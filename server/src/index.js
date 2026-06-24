import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { createClerkClient } from '@clerk/backend';

export class WhiteboardRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.sql = state.storage.sql;
    
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.initSqlite();
    this.loadDocFromSqlite();

    this.awareness.on('update', ({ added, updated, removed }) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 1);
      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
      encoding.writeVarUint8Array(encoder, update);
      this.broadcast(encoding.toUint8Array(encoder));
    });

    this.doc.on('update', (update, origin) => {
      if (origin !== this) {
        this.saveUpdateToSqlite(update);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);
        syncProtocol.writeUpdate(encoder, update);
        this.broadcast(encoding.toUint8Array(encoder));
      }
    });
  }

  initSqlite() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data BLOB NOT NULL
      )
    `);
  }

  loadDocFromSqlite() {
    try {
      const cursor = this.sql.exec(`SELECT data FROM updates ORDER BY id ASC`);
      for (const row of cursor) {
        Y.applyUpdate(this.doc, new Uint8Array(row.data), this);
      }
    } catch (e) {
      console.error("Failed to load sqlite", e);
    }
  }

  saveUpdateToSqlite(update) {
    this.sql.exec(`INSERT INTO updates (data) VALUES (?)`, update.buffer);
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);
    this.sessions.set(server, {});

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    server.send(encoding.toUint8Array(encoder));

    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awEncoder = encoding.createEncoder();
      encoding.writeVarUint(awEncoder, 1);
      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(awarenessStates.keys()));
      encoding.writeVarUint8Array(awEncoder, update);
      server.send(encoding.toUint8Array(awEncoder));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    const decoder = decoding.createDecoder(new Uint8Array(msg));
    const messageType = decoding.readVarUint(decoder);

    if (messageType === 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
      if (encoding.length(encoder) > 1) {
        ws.send(encoding.toUint8Array(encoder));
      }
    } else if (messageType === 1) {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws);
    }
  }

  webSocketClose(ws, code, reason, wasClean) {
    this.sessions.delete(ws);
  }

  webSocketError(ws, error) {
    this.sessions.delete(ws);
  }

  broadcast(msg) {
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(msg);
      } catch (e) {
      }
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
      });
    }

    const url = new URL(request.url);

    // If it's not a WebSocket upgrade request, just return a health check
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Whiteboard Server is running. Please connect via WebSocket.", { status: 200 });
    }

    // Development fallback (if no token, allow for testing)
    const token = url.searchParams.get("token");
    if (token) {
      try {
        const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
        await clerk.verifyToken(token);
      } catch (err) {
        return new Response("Unauthorized: Invalid token", { status: 401 });
      }
    } else if (env.CLERK_SECRET_KEY) {
      // If server expects Clerk but no token is provided
      return new Response("Unauthorized: Missing token", { status: 401 });
    }

    const roomId = url.searchParams.get("room") || "default-room";
    const id = env.WHITEBOARD_ROOM.idFromName(roomId);
    const room = env.WHITEBOARD_ROOM.get(id);

    return room.fetch(request);
  }
};
