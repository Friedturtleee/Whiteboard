import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// BoardCollaboration imports Yjs/lib0 from esm.sh; map those to the Worker's
// installed copies of the exact same versions so it can be loaded under Node.
const modules = path.resolve('server/node_modules');
const hooks = `
const map = {
  yjs: ${JSON.stringify(pathToFileURL(path.join(modules, 'yjs/dist/yjs.mjs')).href)},
  encoding: ${JSON.stringify(pathToFileURL(path.join(modules, 'lib0/encoding.js')).href)},
  decoding: ${JSON.stringify(pathToFileURL(path.join(modules, 'lib0/decoding.js')).href)}
};
export async function resolve(specifier, context, next) {
  const match = /^https:\\/\\/esm\\.sh\\/(yjs|lib0)@[^/]+(?:\\/(encoding|decoding))?/.exec(specifier);
  if (match) return { url: map[match[2] || match[1]], shortCircuit: true };
  return next(specifier, context);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const { BoardCollaboration } = await import('../js/network/BoardCollaboration.js');
const { Serializer } = await import('../js/core/Serializer.js');
const { validateWhiteboardElement } = await import('../js/core/WhiteboardElementValidation.js');
const { validateTreeElementSource } = await import('../js/core/TreeSourceValidation.js');
const { Element } = await import('../js/core/Element.js');
const Y = await import(pathToFileURL(path.join(modules, 'yjs/dist/yjs.mjs')).href);

class FakeSocket {
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances = [];
    constructor() {
        this.readyState = 0;
        this.listeners = {};
        this.sent = [];
        FakeSocket.instances.push(this);
    }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    send(data) { this.sent.push(data); }
    close() { this.readyState = FakeSocket.CLOSED; }
    emit(type, event = {}) { (this.listeners[type] || []).forEach(handler => handler(event)); }
}
globalThis.WebSocket = FakeSocket;

function rect(id) {
    return { id, type: 'rectangle', shapeType: 'rectangle', x: 0, y: 0, width: 10, height: 10 };
}

function toMap(record) {
    const map = new Y.Map();
    for (const [key, value] of Object.entries(record)) map.set(key, value);
    return map;
}

function makeCollab() {
    const calls = { reconnect: 0 };
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { selectedElements: [], clear() {} },
        layerManager: { _reindex() {} },
        propertyPanel: { update() {} },
        layerPanel: { update() {} },
        renderer: { markDirty() {} },
        _autosave() {},
        _updateZoomDisplay() {},
        cloudBoards: {
            renderStatus() {},
            updateUndoControls() {},
            reconnect() { calls.reconnect++; }
        }
    };
    const collab = new BoardCollaboration(app, {
        apiBaseUrl: 'https://example.test', board: { id: 'b1', role: 'editor' }, ticket: 't'
    });
    return { collab, app, calls, socket: FakeSocket.instances.at(-1) };
}

test('local Yjs transactions are skipped while remote ones are applied', () => {
    const { collab, app } = makeCollab();
    collab.doc.transact(() => collab.elementsMap.set('local1', toMap(rect('local1'))), collab.localOrigin);
    assert.equal(app.elements.length, 0, 'local origin must not be re-applied');
    collab.doc.transact(() => collab.elementsMap.set('remote1', toMap(rect('remote1'))), collab.remoteOrigin);
    assert.deepEqual(app.elements.map(element => element.id), ['remote1']);
    collab.disconnect();
});

test('one malformed shared element does not abort applying the others', () => {
    const { collab, app } = makeCollab();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        collab.doc.transact(() => {
            const bad = toMap(rect('bad'));
            bad.set('broken', '\u0000cpwb-array-v1:{not json');
            collab.elementsMap.set('bad', bad);
            collab.elementsMap.set('good', toMap(rect('good')));
        }, collab.remoteOrigin);
    } finally {
        console.warn = originalWarn;
    }
    assert.deepEqual(app.elements.map(element => element.id), ['good']);
    collab.disconnect();
});

test('repeated 1003 closes stop reconnecting and 4001 reasons are distinguished', () => {
    const { collab, calls, socket } = makeCollab();
    let current = socket;
    for (let attempt = 0; attempt < 5; attempt++) {
        current.emit('close', { code: 1003, reason: 'Invalid whiteboard data.' });
        if (collab.status === 'error') break;
        collab.reconnect('ticket');
        current = FakeSocket.instances.at(-1);
    }
    assert.equal(collab.status, 'error');
    assert.ok(calls.reconnect < 3, `reconnect requested ${calls.reconnect} times`);
    collab.disconnect();

    const rejected = makeCollab();
    rejected.socket.emit('close', { code: 4001, reason: 'Whiteboard update was rejected.' });
    assert.equal(rejected.collab.status, 'revoked');
    assert.equal(rejected.collab.closeReason, 'rejected');
    rejected.collab.disconnect();

    const revoked = makeCollab();
    revoked.socket.emit('close', { code: 4001, reason: 'Whiteboard access changed.' });
    assert.equal(revoked.collab.closeReason, 'revoked');
    revoked.collab.disconnect();
});

test('undo history is capped', () => {
    const { collab } = makeCollab();
    for (let index = 0; index < 260; index++) {
        collab.doc.transact(() => collab.elementsMap.set(`e${index}`, toMap(rect(`e${index}`))), collab.localOrigin);
        collab.undoManager.stopCapturing();
    }
    assert.ok(collab.undoManager.undoStack.length <= 200);
    collab.disconnect();
});

test('Serializer rejects exactly what the shared validator rejects', () => {
    const app = { elements: [], camera: { x: 0, y: 0, zoom: 1 }, selectionManager: { clear() {} }, renderer: { markDirty() {} } };
    const invalid = [
        { ...rect('a'), width: -5 },
        { ...rect('a'), opacity: 2 },
        { ...rect('a'), type: 'nope' },
        { id: 'm', type: 'matrix', x: 0, y: 0, width: 10, height: 10, rows: 2, cols: 2, data: [[1]] },
        { id: 't', type: 'tree', x: 0, y: 0, width: 10, height: 10, inputText: 'x', _relOffsetX: 1e12 },
        { id: 'g', type: 'graph', x: 0, y: 0, width: 10, height: 10, graphNodes: [], edges: [{ u: 1, v: 2 }] }
    ];
    for (const record of invalid) {
        assert.throws(() => validateWhiteboardElement(record), TypeError);
        assert.throws(() => Serializer.loadJSONData(app, { elements: [record] }), TypeError);
    }
    assert.doesNotThrow(() => Serializer.loadJSONData(app, { elements: [rect('ok')] }));
    assert.throws(() => Serializer.loadJSONData(app, { elements: [rect('d'), rect('d')] }), /duplicate/);
});

test('tree source validation rejects overrides for unknown nodes', () => {
    const base = { type: 'tree', inputText: '3\n1 2\n1 3', inputMode: 'rooted' };
    assert.doesNotThrow(() => validateTreeElementSource(base));
    assert.throws(() => validateTreeElementSource({ ...base, nodeValueOverrides: { 'r.9': 'x' } }), /unknown node/);
    assert.throws(() => validateTreeElementSource({ ...base, inputText: 'garbage ???' }));
});

test('Element.deserialize ignores dangerous and method-shadowing keys', () => {
    class Probe extends Element {
        constructor() { super('probe'); }
        draw() { return 'original'; }
    }
    const element = new Probe();
    const payload = JSON.parse('{"__proto__":{"polluted":true},"constructor":"x","prototype":"y","draw":"evil","serialize":"evil","x":42,"label":"ok"}');
    payload.callback = () => 'evil';
    element.deserialize(payload);
    assert.equal(element.x, 42);
    assert.equal(element.label, 'ok');
    assert.equal(element.draw(), 'original');
    assert.equal(typeof element.serialize, 'function');
    assert.equal(element.constructor, Probe);
    assert.equal(Object.getPrototypeOf(element), Probe.prototype);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.hasOwn(element, 'callback'), false);
});
