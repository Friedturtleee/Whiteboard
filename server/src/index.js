import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { DurableObject } from 'cloudflare:workers';
import { validateWhiteboardElement } from '../../js/core/WhiteboardElementValidation.js';
import { TreeParser } from '../../js/tree/TreeParser.js';
import { authenticateRequest, getAllowedOrigins, getRoomId, isAllowedOrigin } from './auth.mjs';
import { consumeConnectTicket, handleApiRequest } from './api.mjs';

const MAX_WEBSOCKET_MESSAGE_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGES_PER_MINUTE = 240;
const MAX_BYTES_PER_MINUTE = 64 * 1024 * 1024;
const MAX_ROOM_CONNECTIONS = 50;
const MAX_AWARENESS_UPDATE_BYTES = 16 * 1024;
const MAX_AWARENESS_CLIENTS_PER_UPDATE = 64;
const MAX_AWARENESS_CLIENT_STATES = 512;
const MAX_ELEMENTS = 10000;
const MAX_BOARD_BYTES = 25 * 1024 * 1024;
const MAX_ELEMENT_BYTES = 4 * 1024 * 1024;
const ARRAY_VALUE_PREFIX = '\u0000cpwb-array-v1:';
const ALLOWED_ELEMENT_TYPES = new Set([
  'rectangle', 'circle', 'ellipse', 'line', 'arrow', 'text', 'matrix', 'stack', 'queue',
  'pen', 'mermaid', 'markdown', 'tree', 'graph'
]);

function validatePlainJsonValue(value, depth = 0, key = '') {
  if (depth > 12) throw new Error('Whiteboard data nesting limit exceeded.');
  if (Array.isArray(value)) {
    if (value.length > 100000) throw new Error('Whiteboard list limit exceeded.');
    return value.map(child => validatePlainJsonValue(child, depth + 1, key));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 256) throw new Error('Whiteboard object field limit exceeded.');
    const result = {};
    for (const [childKey, child] of entries) {
      if (['__proto__', 'constructor', 'prototype'].includes(childKey) || childKey.length > 128) {
        throw new Error('Whiteboard field name is invalid.');
      }
      result[childKey] = validatePlainJsonValue(child, depth + 1, childKey);
    }
    return result;
  }
  if (typeof value === 'string') {
    if (value.length > (key === 'svgString' ? 2_000_000 : 1_000_000)) {
      throw new Error('Whiteboard text limit exceeded.');
    }
    return value;
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 100_000_000)) {
    throw new Error('Whiteboard number is outside the supported range.');
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  throw new Error('Whiteboard contains an unsupported data value.');
}

function toPlainYValue(value, depth = 0, key = '') {
  if (depth > 12) throw new Error('Whiteboard data nesting limit exceeded.');
  if (value instanceof Y.Text) {
    const text = value.toString();
    const maxLength = key === 'svgString' ? 2_000_000 : 1_000_000;
    if (text.length > maxLength) throw new Error('Whiteboard text limit exceeded.');
    return text;
  }
  if (value instanceof Y.Array) {
    if (value.length > 100000) throw new Error('Whiteboard list limit exceeded.');
    return value.toArray().map(child => toPlainYValue(child, depth + 1, key));
  }
  if (value instanceof Y.Map) {
    if (value.size > 256) throw new Error('Whiteboard object field limit exceeded.');
    const result = {};
    for (const [childKey, child] of value.entries()) {
      if (['__proto__', 'constructor', 'prototype'].includes(childKey) || childKey.length > 128) {
        throw new Error('Whiteboard field name is invalid.');
      }
      result[childKey] = toPlainYValue(child, depth + 1, childKey);
    }
    return result;
  }
  if (Array.isArray(value)) {
    if (value.length > 100000) throw new Error('Whiteboard list limit exceeded.');
    return value.map(child => toPlainYValue(child, depth + 1, key));
  }
  if (typeof value === 'string' && value.startsWith(ARRAY_VALUE_PREFIX)) {
    const json = value.slice(ARRAY_VALUE_PREFIX.length);
    if (new TextEncoder().encode(json).byteLength > MAX_ELEMENT_BYTES) {
      throw new Error('Whiteboard list exceeds the size limit.');
    }
    let nesting = 0;
    let inString = false;
    let escaped = false;
    for (const char of json) {
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '[' || char === '{') {
        nesting++;
        if (nesting + depth > 12) throw new Error('Whiteboard data nesting limit exceeded.');
      } else if (char === ']' || char === '}') nesting--;
    }
    let parsed;
    try { parsed = JSON.parse(json); } catch { throw new Error('Whiteboard list data is invalid.'); }
    if (!Array.isArray(parsed)) throw new Error('Whiteboard list data is invalid.');
    return validatePlainJsonValue(parsed, depth + 1, key);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 256) throw new Error('Whiteboard object field limit exceeded.');
    const result = {};
    for (const [childKey, child] of entries) {
      if (['__proto__', 'constructor', 'prototype'].includes(childKey) || childKey.length > 128) {
        throw new Error('Whiteboard field name is invalid.');
      }
      result[childKey] = toPlainYValue(child, depth + 1, childKey);
    }
    return result;
  }
  if (typeof value === 'string') {
    if (value.length > (key === 'svgString' ? 2_000_000 : 1_000_000)) throw new Error('Whiteboard text limit exceeded.');
    return value;
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 100_000_000)) {
    throw new Error('Whiteboard number is outside the supported range.');
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  throw new Error('Whiteboard contains an unsupported data value.');
}

function validateElement(id, shared) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !(shared instanceof Y.Map)) {
    throw new Error('Whiteboard element ID or record is invalid.');
  }
  const data = toPlainYValue(shared);
  validateWhiteboardElement(data);
  if (data.type === 'tree') validateTreeElementSource(data);
  if (data.id !== id || !ALLOWED_ELEMENT_TYPES.has(data.type) ||
      ![data.x, data.y, data.width, data.height].every(Number.isFinite)) {
    throw new Error('Whiteboard element schema is invalid.');
  }
  const size = new TextEncoder().encode(JSON.stringify(data)).byteLength;
  if (size > MAX_ELEMENT_BYTES) throw new Error('Whiteboard element exceeds the size limit.');
  return size;
}

function validateTreeElementSource(data) {
  if (data.inputText === '') return;
  const lines = data.inputText.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  let parsed = TreeParser.autoDetectAndParse(data.inputText, data.treeType || 'tree');
  if (parsed.error) parsed = TreeParser.parseRootedFormat(lines);
  if (parsed.error || !parsed.root) throw new Error('Tree source cannot be restored.');

  const validPaths = new Set();
  const pending = [{ node: parsed.root, path: 'r' }];
  while (pending.length) {
    const { node, path } = pending.pop();
    if (!node || validPaths.has(path)) continue;
    validPaths.add(path);
    (node.children || []).forEach((child, index) => {
      if (child) pending.push({ node: child, path: `${path}.${index}` });
    });
  }
  for (const [path, value] of Object.entries(data.nodeValueOverrides || {})) {
    if (!validPaths.has(path) || typeof value === 'object') {
      throw new Error('Tree node override points to an unknown node.');
    }
  }
  for (const path of Object.keys(data.edgeWeightOverrides || {})) {
    if (!validPaths.has(path) || path === 'r') {
      throw new Error('Tree edge-weight override points to an unknown edge.');
    }
  }
}

function validateDocumentMetadata(doc) {
  for (const name of doc.share.keys()) {
    if (name !== 'elements' && name !== 'meta') throw new Error('Unknown whiteboard document root.');
  }
  const metadata = doc.share.get('meta');
  if (!metadata) return;
  if (!(metadata instanceof Y.Map) || metadata.size > 1) throw new Error('Whiteboard metadata is invalid.');
  for (const key of metadata.keys()) if (key !== 'camera') throw new Error('Unknown whiteboard metadata field.');
  if (!metadata.has('camera')) return;
  const camera = metadata.get('camera');
  if (!(camera instanceof Y.Map)) throw new Error('Whiteboard camera metadata is invalid.');
  const value = toPlainYValue(camera);
  if (Object.keys(value).sort().join(',') !== 'x,y,zoom' ||
      !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.zoom) ||
      Math.abs(value.x) > 100_000_000 || Math.abs(value.y) > 100_000_000 ||
      value.zoom < 0.45 || value.zoom > 10) {
    throw new Error('Whiteboard camera metadata is invalid.');
  }
}

function validateAwarenessUpdate(awareness, update) {
  if (update.byteLength > MAX_AWARENESS_UPDATE_BYTES) {
    throw new Error('Presence update exceeds the size limit.');
  }
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  if (count > MAX_AWARENESS_CLIENTS_PER_UPDATE) {
    throw new Error('Presence update contains too many clients.');
  }
  const newClientIds = new Set();
  for (let index = 0; index < count; index++) {
    const clientId = decoding.readVarUint(decoder);
    decoding.readVarUint(decoder); // awareness clock
    const state = JSON.parse(decoding.readVarString(decoder));
    if (state !== null && (!state || typeof state !== 'object' || Array.isArray(state))) {
      throw new Error('Presence state must be an object or null.');
    }
    if (state !== null && !awareness.states.has(clientId)) newClientIds.add(clientId);
  }
  if (decoding.hasContent(decoder)) throw new Error('Presence update contains trailing data.');
  if (awareness.states.size + newClientIds.size > MAX_AWARENESS_CLIENT_STATES) {
    throw new Error('Presence state limit reached for this whiteboard.');
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function corsResponse(response, origin) {
  if (!origin || response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function getSocketRole(env, attachment) {
  if (!env.DB) return null;
  const board = await env.DB.prepare(
    'SELECT owner_user_id FROM boards WHERE id = ? AND deleted_at IS NULL'
  ).bind(attachment.boardId).first();
  if (!board) return null;

  if (attachment.shareLinkId) {
    const link = await env.DB.prepare(
      `SELECT 1 AS valid FROM share_links
        WHERE id = ? AND board_id = ? AND revoked_at IS NULL AND expires_at > ?`
    ).bind(attachment.shareLinkId, attachment.boardId, Date.now()).first();
    return link ? 'viewer' : null;
  }

  if (board.owner_user_id === attachment.userId) return 'owner';
  const member = await env.DB.prepare(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?'
  ).bind(attachment.boardId, attachment.userId).first();
  return member?.role ?? null;
}

export class WhiteboardRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.sql = ctx.storage.sql;
    this.storageError = false;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data BLOB NOT NULL
      )
    `);
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.dirtyElementIds = new Set();
    this.elementBytes = new Map();
    this.loadDocFromSqlite();
    this.bindDocumentEvents();
  }

  loadDocFromSqlite() {
    const cursor = this.sql.exec('SELECT data FROM updates ORDER BY id ASC');
    this.updateCount = 0;
    for (const row of cursor) {
      Y.applyUpdate(this.doc, new Uint8Array(row.data), this);
      this.updateCount++;
    }
    this.validateWholeDocument();
  }

  restoreDocFromSqlite() {
    this.awareness.destroy();
    this.doc.destroy();
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.dirtyElementIds.clear();
    this.elementBytes.clear();
    this.loadDocFromSqlite();
    this.bindDocumentEvents();
  }

  bindDocumentEvents() {
    const elements = this.doc.getMap('elements');
    elements.observeDeep(events => {
      for (const event of events) {
        if (event.path?.length) this.dirtyElementIds.add(String(event.path[0]));
        else for (const id of event.changes?.keys?.keys?.() || []) this.dirtyElementIds.add(String(id));
      }
    });
    this.doc.on('update', (update, origin) => {
      if (origin === this || this.storageError) return;
      let persisting = false;
      try {
        this.validateDirtyElements();
        if (update.byteLength > MAX_WEBSOCKET_MESSAGE_BYTES) throw new Error('Update limit exceeded.');
        if (this.updateCount % 10 === 0 && Y.encodeStateAsUpdate(this.doc).byteLength > MAX_BOARD_BYTES) {
          throw new Error('Whiteboard document limit exceeded.');
        }
        persisting = true;
        this.saveUpdateToSqlite(update);
      } catch (err) {
        if (!persisting) {
          // Yjs has already applied the update in memory. Rebuild from the
          // durable log so rejected input cannot poison the room or evict peers.
          try {
            this.restoreDocFromSqlite();
            console.warn('Rejected invalid whiteboard update.', err);
            try { origin?.close(4001, 'Whiteboard update was rejected.'); } catch {}
            return;
          } catch (restoreError) {
            console.error('Unable to restore the last saved whiteboard state.', restoreError);
          }
        }
        // Never advertise an update that was not durably recorded. A failure
        // after validation indicates a storage/compaction problem, not bad input.
        this.storageError = true;
        console.error('Failed to persist Yjs update; closing room sockets.', err);
        for (const ws of this.ctx.getWebSockets()) {
          try { ws.close(1011, 'Whiteboard storage is unavailable.'); } catch {}
        }
        return;
      }
      try {
        const boardId = origin?.deserializeAttachment?.()?.boardId;
        if (boardId) this.touchBoardActivity(boardId);
      } catch (err) {
        console.error('Unable to read whiteboard activity metadata.', err);
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      syncProtocol.writeUpdate(encoder, update);
      const broadcastMessage = encoding.toUint8Array(encoder);
      this.broadcast(broadcastMessage);
      if (origin && typeof origin.send === 'function') {
        const ack = encoding.createEncoder();
        encoding.writeVarUint(ack, 2);
        try { origin.send(encoding.toUint8Array(ack)); } catch {}
      }
    });

    this.awareness.on('update', ({ added, updated, removed }) => {
      const clients = added.concat(updated, removed);
      if (!clients.length) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 1);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients)
      );
      this.broadcast(encoding.toUint8Array(encoder));
    });
  }

  validateDirtyElements() {
    const elements = this.doc.getMap('elements');
    if (elements.size > MAX_ELEMENTS) throw new Error('Whiteboard element count limit exceeded.');
    for (const id of this.dirtyElementIds) {
      const element = elements.get(id);
      if (element === undefined) this.elementBytes.delete(id);
      else this.elementBytes.set(id, validateElement(id, element));
    }
    this.dirtyElementIds.clear();
    let total = 0;
    for (const size of this.elementBytes.values()) total += size;
    if (total > MAX_BOARD_BYTES) throw new Error('Whiteboard document size limit exceeded.');
    validateDocumentMetadata(this.doc);
  }

  validateWholeDocument() {
    const elements = this.doc.getMap('elements');
    if (elements.size > MAX_ELEMENTS) throw new Error('Whiteboard element count limit exceeded.');
    this.elementBytes.clear();
    for (const [id, element] of elements.entries()) this.elementBytes.set(id, validateElement(id, element));
    let total = 0;
    for (const size of this.elementBytes.values()) total += size;
    if (total > MAX_BOARD_BYTES || Y.encodeStateAsUpdate(this.doc).byteLength > MAX_BOARD_BYTES) {
      throw new Error('Whiteboard document size limit exceeded.');
    }
    validateDocumentMetadata(this.doc);
  }

  saveUpdateToSqlite(update) {
    this.sql.exec('INSERT INTO updates (data) VALUES (?)', update.slice().buffer);
    this.updateCount = (this.updateCount || 0) + 1;
    if (this.updateCount >= 100) this.compactSqlite();
  }

  touchBoardActivity(boardId) {
    const now = Date.now();
    if (!this.env.DB || (this.lastBoardTouchAt && now - this.lastBoardTouchAt < 30_000)) return;
    this.lastBoardTouchAt = now;
    this.env.DB.prepare('UPDATE boards SET updated_at = MAX(updated_at, ?) WHERE id = ? AND deleted_at IS NULL')
      .bind(now, boardId).run()
      .catch(err => console.error('Unable to refresh whiteboard activity time.', err));
  }

  compactSqlite() {
    const state = Y.encodeStateAsUpdate(this.doc);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM updates');
      this.sql.exec('INSERT INTO updates (data) VALUES (?)', state.slice().buffer);
    });
    this.updateCount = 1;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/_invalidate') && request.method === 'POST') {
      let criteria;
      try { criteria = await request.json(); } catch { return new Response('Invalid request.', { status: 400 }); }
      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment() || {};
        if (criteria.all ||
          (criteria.userId && attachment.userId === criteria.userId) ||
          (criteria.shareLinkId && attachment.shareLinkId === criteria.shareLinkId)) {
          try { ws.close(4001, 'Whiteboard access changed.'); } catch {}
        }
      }
      return new Response(null, { status: 204 });
    }

    if (url.pathname.endsWith('/_purge') && request.method === 'POST') {
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(4001, 'Whiteboard was deleted.'); } catch {}
      }
      try {
        this.ctx.storage.transactionSync(() => this.sql.exec('DELETE FROM updates'));
        this.doc.destroy();
        this.doc = new Y.Doc();
        this.awareness = new awarenessProtocol.Awareness(this.doc);
        this.updateCount = 0;
        this.dirtyElementIds = new Set();
        this.elementBytes = new Map();
        this.storageError = false;
        this.bindDocumentEvents();
        await this.ctx.storage.deleteAlarm();
      } catch (err) {
        this.storageError = true;
        console.error('Failed to purge deleted whiteboard content.', err);
        return new Response('Unable to purge room data.', { status: 500 });
      }
      return new Response(null, { status: 204 });
    }

    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected websocket.', { status: 400 });
    }
    if (this.storageError) return new Response('Whiteboard storage is unavailable.', { status: 503 });

    const boardId = request.headers.get('X-Whiteboard-Board');
    const role = request.headers.get('X-Whiteboard-Role');
    const userId = request.headers.get('X-Whiteboard-User') || null;
    const shareLinkId = request.headers.get('X-Whiteboard-Share') || null;
    if (!getRoomId(`/${boardId || ''}`) || !['owner', 'editor', 'viewer'].includes(role) ||
      (role === 'viewer' && !userId && !shareLinkId) || (role !== 'viewer' && !userId)) {
      return new Response('Invalid room access.', { status: 403 });
    }
    if (this.ctx.getWebSockets().length >= MAX_ROOM_CONNECTIONS) {
      return new Response('This whiteboard has reached its active connection limit.', { status: 429 });
    }

    const tags = [`board:${boardId}`];
    if (userId) tags.push(`user:${userId}`);
    if (shareLinkId) tags.push(`share:${shareLinkId}`);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, tags);
    server.serializeAttachment({
      boardId, userId, role, shareLinkId,
      rateWindowStartedAt: Date.now(), messageCount: 0, byteCount: 0
    });
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment();
      if (!attachment) {
        try { ws.close(4001, 'Whiteboard access changed.'); } catch {}
        continue;
      }
      try {
        const currentRole = await getSocketRole(this.env, attachment);
        if (!currentRole || currentRole !== attachment.role) ws.close(4001, 'Whiteboard access changed.');
      } catch {
        // Fail closed if the ACL database cannot be checked at revalidation time.
        try { ws.close(1011, 'Unable to confirm whiteboard access.'); } catch {}
      }
    }
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }

  async webSocketMessage(ws, message) {
    const bytes = message instanceof ArrayBuffer
      ? new Uint8Array(message)
      : ArrayBuffer.isView(message)
        ? new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
        : null;
    if (!bytes) {
      ws.close(1003, 'Binary messages are required.');
      return;
    }
    if (bytes.byteLength > MAX_WEBSOCKET_MESSAGE_BYTES) {
      ws.close(1009, 'Message too large.');
      return;
    }

    try {
      const attachment = ws.deserializeAttachment();
      if (!attachment || !await this.checkMessageRate(ws, attachment, bytes.byteLength)) {
        ws.close(1008, 'Message rate limit exceeded.');
        return;
      }
      const currentRole = await getSocketRole(this.env, attachment);
      if (!currentRole || currentRole !== attachment.role) {
        ws.close(4001, 'Whiteboard access changed.');
        return;
      }

      const decoder = decoding.createDecoder(bytes);
      const messageType = decoding.readVarUint(decoder);
      if (messageType === 0) {
        const syncMessageType = decoding.readVarUint(decoder);
        if (currentRole === 'viewer' && syncMessageType !== syncProtocol.messageYjsSyncStep1) {
          ws.close(1008, 'This whiteboard is read-only.');
          return;
        }
        if (currentRole === 'owner' || currentRole === 'editor') {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 0);
          const syncDecoder = decoding.createDecoder(bytes);
          decoding.readVarUint(syncDecoder);
          syncProtocol.readSyncMessage(syncDecoder, encoder, this.doc, ws);
          if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
            encoding.writeVarUint(encoder, 0);
            syncProtocol.writeSyncStep1(encoder, this.doc);
          }
          if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
        } else {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 0);
          syncProtocol.writeSyncStep2(encoder, this.doc, decoding.readVarUint8Array(decoder));
          ws.send(encoding.toUint8Array(encoder));
        }
      } else if (messageType === 1) {
        const update = decoding.readVarUint8Array(decoder);
        validateAwarenessUpdate(this.awareness, update);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws);
      } else {
        ws.close(1003, 'Unknown synchronization message.');
      }
    } catch (err) {
      console.error('Invalid WebSocket synchronization message.', err);
      try { ws.close(1003, 'Invalid synchronization message.'); } catch {}
    }
  }

  async checkMessageRate(ws, attachment, messageBytes) {
    const now = Date.now();
    if (now - attachment.rateWindowStartedAt >= 60_000) {
      attachment.rateWindowStartedAt = now;
      attachment.messageCount = 0;
      attachment.byteCount = 0;
    }
    attachment.messageCount++;
    attachment.byteCount = (attachment.byteCount || 0) + messageBytes;
    ws.serializeAttachment(attachment);
    return attachment.messageCount <= MAX_MESSAGES_PER_MINUTE && attachment.byteCount <= MAX_BYTES_PER_MINUTE;
  }

  webSocketClose() {}
  webSocketError() {}

  broadcast(bytes) {
    for (const ws of this.ctx.getWebSockets()) {
      try { if (ws.readyState === 1) ws.send(bytes); } catch {}
    }
  }
}

async function handleWebSocket(request, env, boardId) {
  if (!request.headers.get('Origin') || !isAllowedOrigin(request.headers.get('Origin'), env)) {
    return new Response('Origin is not allowed.', { status: 403 });
  }
  if (!env.DB || !env.WHITEBOARD_ROOM) return new Response('Cloud storage is not configured.', { status: 503 });
  const url = new URL(request.url);
  const ticket = url.searchParams.get('ticket');
  const claims = await consumeConnectTicket(env, ticket, boardId);
  if (!claims) return new Response('Connection ticket is invalid or expired.', { status: 401 });

  const room = env.WHITEBOARD_ROOM.get(env.WHITEBOARD_ROOM.idFromName(boardId));
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  headers.delete('Authorization');
  headers.set('X-Whiteboard-Board', boardId);
  headers.set('X-Whiteboard-Role', claims.role);
  if (claims.user_id) headers.set('X-Whiteboard-User', claims.user_id);
  if (claims.share_link_id) headers.set('X-Whiteboard-Share', claims.share_link_id);
  return room.fetch(new Request(request, { headers }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const boardConnection = url.pathname.match(/^\/api\/boards\/([a-f0-9]{32})\/connect$/i);

    if (boardConnection && (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
      const boardId = boardConnection[1].toLowerCase();
      return handleWebSocket(request, env, boardId);
    }

    if (!url.pathname.startsWith('/api/')) return new Response('Not found.', { status: 404 });
    if (origin && !isAllowedOrigin(origin, env)) return new Response('Origin is not allowed.', { status: 403 });
    if (request.method === 'OPTIONS') {
      if (!origin || !getAllowedOrigins(env).has(origin)) return new Response('Origin is not allowed.', { status: 403 });
      return corsResponse(new Response(null, { status: 204 }), origin);
    }

    try {
      let userId = null;
      const anonymousShareAccess = url.pathname === '/api/share/access' && request.method === 'POST';
      if (!anonymousShareAccess) {
        const auth = await authenticateRequest(request, env, verifyToken);
        if (auth.error) return corsResponse(json({ error: auth.error.message }, auth.error.status), origin);
        userId = auth.userId;
      }
      const needsAccountLookup = request.method === 'POST' && /\/api\/boards\/[a-f0-9]{32}\/members$/i.test(url.pathname);
      const clerkClient = needsAccountLookup
        ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
        : null;
      const response = await handleApiRequest(request, env, userId, clerkClient);
      return corsResponse(response, origin);
    } catch (err) {
      console.error('Whiteboard API request failed.', err);
      const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
      return corsResponse(json({ error: status < 500 ? err.message : 'The request could not be completed.' }, status), origin);
    }
  }
};
