import * as Y from 'https://esm.sh/yjs@13.6.31?bundle';
import * as encoding from 'https://esm.sh/lib0@0.2.117/encoding?bundle';
import * as decoding from 'https://esm.sh/lib0@0.2.117/decoding?bundle';
import { Serializer } from '../core/Serializer.js';
import { validateWhiteboardElement } from '../core/WhiteboardElementValidation.js';

const MAX_ELEMENTS = 10000;
const MAX_BOARD_BYTES = 25 * 1024 * 1024;
const MAX_ELEMENT_BYTES = 4 * 1024 * 1024;
const MAX_UPDATE_BATCH_BYTES = 2 * 1024 * 1024;
const MAX_UPDATE_BATCH_ELEMENTS = 50;
const ARRAY_VALUE_PREFIX = '\u0000cpwb-array-v1:';
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

function toShared(value) {
    if (typeof value === 'string') {
        const text = new Y.Text();
        if (value) text.insert(0, value);
        return text;
    }
    // Fixed-index arrays (matrix cells, graph edges, stack items) are atomic
    // fields: Y.Array sequence merges can insert items and corrupt dimensions
    // when two people edit separate indexes at the same time.
    if (Array.isArray(value)) return ARRAY_VALUE_PREFIX + JSON.stringify(value);
    if (value && typeof value === 'object') {
        const map = new Y.Map();
        for (const [key, child] of Object.entries(value)) map.set(key, toShared(child));
        return map;
    }
    return value;
}

function toPlain(value) {
    if (value instanceof Y.Text) return value.toString();
    if (value instanceof Y.Array) return value.toArray().map(toPlain);
    if (value instanceof Y.Map) return Object.fromEntries([...value.entries()].map(([key, child]) => [key, toPlain(child)]));
    if (Array.isArray(value)) return value.map(toPlain);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toPlain(child)]));
    if (typeof value === 'string' && value.startsWith(ARRAY_VALUE_PREFIX)) {
        const parsed = JSON.parse(value.slice(ARRAY_VALUE_PREFIX.length));
        if (!Array.isArray(parsed)) throw new Error('Invalid shared array value.');
        return parsed;
    }
    return value;
}

function valueType(value) {
    if (typeof value === 'string') return 'text';
    if (Array.isArray(value)) return 'array';
    if (value && typeof value === 'object') return 'map';
    return 'scalar';
}

function sameJson(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function updateText(shared, value) {
    const oldValue = shared.toString();
    if (oldValue === value) return;
    let prefix = 0;
    const maxPrefix = Math.min(oldValue.length, value.length);
    while (prefix < maxPrefix && oldValue[prefix] === value[prefix]) prefix++;
    let suffix = 0;
    while (suffix < oldValue.length - prefix && suffix < value.length - prefix &&
        oldValue[oldValue.length - 1 - suffix] === value[value.length - 1 - suffix]) suffix++;
    const removeCount = oldValue.length - prefix - suffix;
    const insertValue = value.slice(prefix, value.length - suffix);
    if (removeCount) shared.delete(prefix, removeCount);
    if (insertValue) shared.insert(prefix, insertValue);
}

function reconcile(shared, value) {
    const kind = valueType(value);
    if (kind === 'text' && shared instanceof Y.Text) {
        updateText(shared, value);
        return shared;
    }
    if (kind === 'map' && shared instanceof Y.Map) {
        const desired = new Set(Object.keys(value));
        for (const key of [...shared.keys()]) if (!desired.has(key)) shared.delete(key);
        for (const [key, child] of Object.entries(value)) {
            if (!shared.has(key)) shared.set(key, toShared(child));
            else {
                const current = shared.get(key);
                if (valueType(child) === 'scalar' || valueType(child) !== sharedType(current)) {
                    if (!sameJson(toPlain(current), child)) shared.set(key, toShared(child));
                } else {
                    const reconciled = reconcile(current, child);
                    if (reconciled !== current) shared.set(key, reconciled);
                }
            }
        }
        return shared;
    }
    if (kind === 'array' && shared instanceof Y.Array) {
        const current = shared.toArray();
        let prefix = 0;
        while (prefix < current.length && prefix < value.length && sameJson(toPlain(current[prefix]), value[prefix])) prefix++;
        let suffix = 0;
        while (suffix < current.length - prefix && suffix < value.length - prefix &&
            sameJson(toPlain(current[current.length - 1 - suffix]), value[value.length - 1 - suffix])) suffix++;
        const removeCount = current.length - prefix - suffix;
        if (removeCount) shared.delete(prefix, removeCount);
        const insertItems = value.slice(prefix, value.length - suffix);
        if (insertItems.length) shared.insert(prefix, insertItems.map(toShared));
        return shared;
    }
    if (sameJson(toPlain(shared), value)) return shared;
    return toShared(value);
}

function sharedType(value) {
    if (value instanceof Y.Text) return 'text';
    if (value instanceof Y.Array) return 'array';
    if (value instanceof Y.Map) return 'map';
    if (typeof value === 'string' && value.startsWith(ARRAY_VALUE_PREFIX)) return 'array';
    return 'scalar';
}

export class BoardCollaboration {
    constructor(app, { apiBaseUrl, board, ticket, seedData = null, preferredCamera = null }) {
        this.app = app;
        this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
        this.board = board;
        this.role = board.role;
        this.ticket = ticket;
        this.seedData = seedData;
        this.preferredCamera = preferredCamera;
        this.doc = new Y.Doc();
        this.elementsMap = this.doc.getMap('elements');
        this.metaMap = this.doc.getMap('meta');
        this.remoteOrigin = { type: 'remote' };
        this.localOrigin = { type: 'local' };
        this.initialOrigin = { type: 'initial' };
        this.undoManager = new Y.UndoManager(this.elementsMap, {
            trackedOrigins: new Set([this.localOrigin])
        });
        this.socket = null;
        this.synced = false;
        this.cameraApplied = false;
        this.isApplyingRemote = false;
        this.pendingAcks = 0;
        this.flushWaiters = new Set();
        this.status = 'connecting';
        this._onElementsChanged = this._onElementsChanged.bind(this);
        this.elementsMap.observeDeep(this._onElementsChanged);
        this.doc.on('update', (update, origin) => {
            if (origin === this.remoteOrigin) return;
            if (this.socket?.readyState !== WebSocket.OPEN) return;
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0);
            encoding.writeVarUint(encoder, SYNC_UPDATE);
            encoding.writeVarUint8Array(encoder, update);
            this.pendingAcks++;
            try { this.socket.send(encoding.toUint8Array(encoder)); } catch {
                this.pendingAcks = Math.max(0, this.pendingAcks - 1);
                this.status = 'disconnected';
                this.app.cloudBoards?.renderStatus();
                this._settleFlushWaiters(false);
                return;
            }
            this.status = 'saving';
            this.app.cloudBoards?.renderStatus();
            this.app.cloudBoards?.updateUndoControls();
        });
        this._connect();
    }

    _connect() {
        const socketUrl = new URL(`${this.apiBaseUrl}/api/boards/${this.board.id}/connect`);
        socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        socketUrl.searchParams.set('ticket', this.ticket);
        const socket = new WebSocket(socketUrl);
        socket.binaryType = 'arraybuffer';
        this.socket = socket;
        socket.addEventListener('open', () => {
            if (this.socket !== socket) return;
            this.status = 'connected';
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0);
            encoding.writeVarUint(encoder, SYNC_STEP1);
            encoding.writeVarUint8Array(encoder, Y.encodeStateVector(this.doc));
            socket.send(encoding.toUint8Array(encoder));
            this.app.cloudBoards?.renderStatus();
        });
        socket.addEventListener('message', event => {
            if (this.socket === socket) this._onMessage(event.data);
        });
        socket.addEventListener('error', () => {
            if (this.socket !== socket) return;
            this.status = 'error';
            this.app.cloudBoards?.renderStatus();
        });
        socket.addEventListener('close', event => {
            if (this.socket !== socket) return;
            this.status = event.code === 4001 ? 'revoked' : 'disconnected';
            this.pendingAcks = 0;
            this._settleFlushWaiters(false);
            this.app.cloudBoards?.renderStatus();
            if (!this._intentionalClose && event.code !== 4001 && event.code !== 1000) this.app.cloudBoards?.reconnect(this);
        });
    }

    reconnect(ticket) {
        if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
            this.socket.close(1000, 'Refreshing connection ticket.');
        }
        this.ticket = ticket;
        this.synced = false;
        this.pendingAcks = 0;
        this._settleFlushWaiters(false);
        this.status = 'connecting';
        this._connect();
    }

    _onMessage(data) {
        const consume = async bytes => {
            try {
                const decoder = decoding.createDecoder(bytes);
                while (decoding.hasContent(decoder)) {
                    const type = decoding.readVarUint(decoder);
                    if (type === 0) {
                        const payloadOffset = decoder.pos;
                        const syncDecoder = decoding.createDecoder(bytes.subarray(payloadOffset));
                        const subtype = decoding.readVarUint(syncDecoder);
                        const payload = decoding.readVarUint8Array(syncDecoder);
                        const response = encoding.createEncoder();
                        if (subtype === SYNC_STEP1) {
                            const missing = Y.encodeStateAsUpdate(this.doc, payload);
                            encoding.writeVarUint(response, 0);
                            encoding.writeVarUint(response, SYNC_STEP2);
                            encoding.writeVarUint8Array(response, missing);
                            if (this.role !== 'viewer' && missing.byteLength > 2) {
                                this.status = 'saving';
                                this.app.cloudBoards?.renderStatus();
                            }
                        } else if (subtype === SYNC_STEP2 || subtype === SYNC_UPDATE) {
                            this.isApplyingRemote = true;
                            try { Y.applyUpdate(this.doc, payload, this.remoteOrigin); }
                            finally { this.isApplyingRemote = false; }
                            this._applyCameraIfAvailable();
                        } else {
                            throw new Error('Unknown Yjs synchronization message.');
                        }
                        decoder.pos = payloadOffset + syncDecoder.pos;
                        if (this.role !== 'viewer' && subtype === SYNC_STEP1) {
                            encoding.writeVarUint(response, 0);
                            encoding.writeVarUint(response, SYNC_STEP1);
                            encoding.writeVarUint8Array(response, Y.encodeStateVector(this.doc));
                        }
                        if (encoding.length(response) > 1) this.socket?.send(encoding.toUint8Array(response));
                        if (subtype === SYNC_STEP2) this._markSynced();
                    } else if (type === 1) {
                        decoding.readVarUint8Array(decoder); // Presence is optional; never trust client identity claims.
                    } else if (type === 2) {
                        if (this.pendingAcks > 0) this.pendingAcks--;
                        this.status = this.pendingAcks > 0 ? 'saving' : 'saved';
                        if (this.pendingAcks === 0) this._settleFlushWaiters(true);
                        this.app.cloudBoards?.renderStatus();
                    } else {
                        this.status = 'error';
                        this.socket?.close(1003, 'Unsupported collaboration message.');
                        this.app.cloudBoards?.renderStatus();
                        return;
                    }
                }
            } catch (error) {
                console.error('Invalid whiteboard synchronization data.', error);
                this.status = 'error';
                this.socket?.close(1003, 'Invalid whiteboard data.');
                this.app.cloudBoards?.renderStatus();
            }
        };
        if (data instanceof ArrayBuffer) consume(new Uint8Array(data));
        else if (data instanceof Blob) data.arrayBuffer().then(buffer => consume(new Uint8Array(buffer)));
    }

    _markSynced() {
        if (this.synced) return;
        this.synced = true;
        this.status = 'saved';
        if (this.elementsMap.size === 0 && this.seedData && Array.isArray(this.seedData.elements)) {
            const camera = this.seedData.camera;
            const validCamera = camera && [camera.x, camera.y, camera.zoom].every(Number.isFinite) &&
                Math.abs(camera.x) <= 100_000_000 && Math.abs(camera.y) <= 100_000_000 &&
                camera.zoom >= 0.45 && camera.zoom <= 10;
            if (validCamera && !this.metaMap.has('camera')) {
                this.doc.transact(() => this.metaMap.set('camera', toShared(this.seedData.camera)), this.initialOrigin);
            }
            if (this._applyLocalData(this.seedData.elements)) this.seedData = null;
        }
        this._applyCameraIfAvailable();
        this.app.cloudBoards?.renderStatus();
    }

    _applyCameraIfAvailable() {
        if (this.cameraApplied) return false;
        const sharedCamera = this.metaMap.get('camera');
        const isValidCamera = value => value && [value.x, value.y, value.zoom].every(Number.isFinite) &&
            Math.abs(value.x) <= 100_000_000 && Math.abs(value.y) <= 100_000_000 &&
            value.zoom >= 0.45 && value.zoom <= 10;
        let camera = this.preferredCamera;
        this.preferredCamera = null;
        if (!isValidCamera(camera)) {
            if (!sharedCamera) return false;
            camera = toPlain(sharedCamera);
            if (!isValidCamera(camera)) throw new Error('Shared board camera metadata is invalid.');
        }
        this.app.camera.x = camera.x;
        this.app.camera.y = camera.y;
        this.app.camera.zoom = camera.zoom;
        this.app._updateZoomDisplay();
        this.app.renderer.markDirty();
        this.cameraApplied = true;
        return true;
    }

    syncLocalState() {
        if (!this.synced || this.role === 'viewer') return false;
        try {
            return this._syncLocalState();
        } catch (error) {
            this.status = 'error';
            this.app.cloudBoards?.renderStatus(error.message || '白板同步失敗，請先匯出資料。');
            return false;
        }
    }

    _syncLocalState() {
        const elements = this.app.elements.map(element => element.serialize());
        if (!this._validateElements(elements)) return false;
        const batches = [];
        let batch = [];
        let batchBytes = 0;
        for (const data of elements) {
            const size = new TextEncoder().encode(JSON.stringify(data)).byteLength;
            if (batch.length && (batch.length >= MAX_UPDATE_BATCH_ELEMENTS || batchBytes + size > MAX_UPDATE_BATCH_BYTES)) {
                batches.push(batch);
                batch = [];
                batchBytes = 0;
            }
            batch.push(data);
            batchBytes += size;
        }
        if (batch.length) batches.push(batch);
        for (const part of batches) this._syncElementBatch(part, false, this.localOrigin);

        const present = new Set(elements.map(data => data.id));
        const obsolete = [...this.elementsMap.keys()].filter(id => !present.has(id));
        for (let index = 0; index < obsolete.length; index += 1000) {
            const ids = obsolete.slice(index, index + 1000);
            this.doc.transact(() => ids.forEach(id => this.elementsMap.delete(id)), this.localOrigin);
        }
        this.app.cloudBoards?.renderStatus();
        return true;
    }

    _validateElements(elements) {
        if (elements.length > MAX_ELEMENTS) {
            this.status = 'error';
            this.app.cloudBoards?.renderStatus('白板元素超過雲端限制，請匯出 JSON。');
            return false;
        }
        const ids = new Set();
        let bytes = 0;
        try {
            for (const data of elements) {
                if (!data || typeof data.id !== 'string' || !data.id || ids.has(data.id)) {
                    throw new Error('白板含有無效或重複的元素 ID。');
                }
                ids.add(data.id);
                validateWhiteboardElement(data);
                const size = new TextEncoder().encode(JSON.stringify(data)).byteLength;
                if (size > MAX_ELEMENT_BYTES) throw new Error('單一元素超過雲端限制，請匯出 JSON。');
                bytes += size;
            }
        } catch (error) {
            this.status = 'error';
            this.app.cloudBoards?.renderStatus(error.message || '無法序列化白板資料。');
            return false;
        }
        if (bytes > MAX_BOARD_BYTES) {
            this.status = 'error';
            this.app.cloudBoards?.renderStatus('白板資料超過雲端限制，請匯出 JSON。');
            return false;
        }
        return true;
    }

    _applyLocalData(elements) {
        if (!this._validateElements(elements)) return false;
        let batch = [];
        let batchBytes = 0;
        for (const data of elements) {
            const size = new TextEncoder().encode(JSON.stringify(data)).byteLength;
            if (batch.length && (batch.length >= MAX_UPDATE_BATCH_ELEMENTS || batchBytes + size > MAX_UPDATE_BATCH_BYTES)) {
                this._syncElementBatch(batch, true, this.initialOrigin);
                batch = [];
                batchBytes = 0;
            }
            batch.push(data);
            batchBytes += size;
        }
        if (batch.length) this._syncElementBatch(batch, true, this.initialOrigin);
        this._onElementsChanged([{ path: [], target: this.elementsMap, changes: { keys: new Map(elements.map(item => [item.id, { action: 'add' }])) }, transaction: { origin: this.remoteOrigin } }]);
        return true;
    }

    _syncElementBatch(elements, onlyAddMissing = false, origin = this.localOrigin) {
        this.doc.transact(() => {
            for (const data of elements) {
                const current = this.elementsMap.get(data.id);
                if (!(current instanceof Y.Map)) {
                    this.elementsMap.set(data.id, toShared(data));
                } else if (!onlyAddMissing) {
                    reconcile(current, data);
                }
            }
        }, origin);
    }

    _onElementsChanged(events) {
        const changedIds = new Set();
        const remoteChangedIds = new Set();
        for (const event of events) {
            if (event.transaction?.origin === this) continue;
            const targetIds = event.path?.length
                ? [String(event.path[0])]
                : [...(event.changes?.keys?.keys?.() || [])].map(String);
            for (const id of targetIds) {
                changedIds.add(id);
                if (event.transaction?.origin === this.remoteOrigin) remoteChangedIds.add(id);
            }
        }
        if (!changedIds.size) return;

        for (const id of changedIds) {
            const shared = this.elementsMap.get(id);
            let currentIndex = this.app.elements.findIndex(element => element.id === id);
            if (!shared) {
                if (currentIndex >= 0) {
                    const current = this.app.elements[currentIndex];
                    if (remoteChangedIds.has(id)) {
                        this.app._dismissPendingDialogsForElement?.(current);
                        this.app._cancelInlineEditForElement?.(current);
                    }
                    if (this.app._textEditing === current) this.app._finishTextEditing(true);
                    currentIndex = this.app.elements.indexOf(current);
                    if (currentIndex >= 0) this.app.elements.splice(currentIndex, 1);
                    this.app.selectionManager.selectedElements = this.app.selectionManager.selectedElements
                        .filter(element => element.id !== id);
                }
                continue;
            }
            const data = toPlain(shared);
            const scratch = {
                elements: [], camera: { x: 0, y: 0, zoom: 1 },
                history: { clear() {} }, selectionManager: { clear() {} }, renderer: { markDirty() {} }
            };
            Serializer.loadJSONData(scratch, { elements: [data] });
            const incoming = scratch.elements[0];
            if (!incoming) continue;
            if (currentIndex >= 0 && this.app.elements[currentIndex].type === incoming.type) {
                const current = this.app.elements[currentIndex];
                if (remoteChangedIds.has(id)) {
                    this.app._dismissPendingDialogsForElement?.(current);
                    this.app._cancelInlineEditForElement?.(current);
                    if (this.app._textEditing === current) this.app._finishTextEditing(true, true);
                }
                current.deserialize(incoming.serialize());
            } else {
                if (currentIndex >= 0) {
                    const current = this.app.elements[currentIndex];
                    if (remoteChangedIds.has(id)) {
                        this.app._dismissPendingDialogsForElement?.(current);
                        this.app._cancelInlineEditForElement?.(current);
                    }
                    if (this.app._textEditing === current) this.app._finishTextEditing(true);
                    currentIndex = this.app.elements.indexOf(current);
                    if (currentIndex >= 0) this.app.elements.splice(currentIndex, 1);
                    this.app.selectionManager.selectedElements = this.app.selectionManager.selectedElements
                        .filter(element => element.id !== id);
                }
                this.app.elements.push(incoming);
            }
        }
        this.app.elements.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
        this.app.layerManager._reindex();
        this.app.propertyPanel.update();
        this.app.layerPanel.update();
        this.app.renderer.markDirty();
        this.app._autosave();
        this.app.cloudBoards?.updateUndoControls();
    }

    undo() {
        if (this.role === 'viewer') return;
        this.undoManager.undo();
        this.app.cloudBoards?.updateUndoControls();
    }

    redo() {
        if (this.role === 'viewer') return;
        this.undoManager.redo();
        this.app.cloudBoards?.updateUndoControls();
    }

    async flush(timeoutMs = 12000) {
        if (this.role === 'viewer') return true;
        if (this.socket?.readyState !== WebSocket.OPEN || !this.synced) return false;
        if (!this.syncLocalState()) return false;
        if (this.socket?.readyState !== WebSocket.OPEN) return false;
        if (this.pendingAcks === 0) return true;
        return new Promise(resolve => {
            const waiter = {
                resolve,
                timer: setTimeout(() => {
                    this.flushWaiters.delete(waiter);
                    resolve(false);
                }, timeoutMs)
            };
            this.flushWaiters.add(waiter);
        });
    }

    _settleFlushWaiters(result) {
        for (const waiter of this.flushWaiters) {
            clearTimeout(waiter.timer);
            waiter.resolve(result);
        }
        this.flushWaiters.clear();
    }

    disconnect() {
        this._intentionalClose = true;
        this.pendingAcks = 0;
        this._settleFlushWaiters(false);
        this.elementsMap.unobserveDeep(this._onElementsChanged);
        this.undoManager.destroy();
        this.doc.destroy();
        if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, 'Board changed.');
        this.socket = null;
    }
}
