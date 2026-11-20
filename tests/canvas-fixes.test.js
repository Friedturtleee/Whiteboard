import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../js/canvas/Renderer.js';
import { Camera } from '../js/canvas/Camera.js';
import { Grid } from '../js/canvas/Grid.js';
import { HitTest } from '../js/canvas/HitTest.js';
import { SelectionManager } from '../js/core/SelectionManager.js';
import { getTextLodStride } from '../js/core/CanvasTextFit.js';
import { ShapeElement } from '../js/elements/ShapeElement.js';
import { PenElement } from '../js/elements/PenElement.js';

function fakeCtx() {
    const calls = [];
    return new Proxy({ calls }, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return (...args) => { calls.push([prop, ...args]); };
        },
        set(target, prop, value) { target[prop] = value; return true; }
    });
}

test('renderer culls offscreen elements but draws visible and boundless ones', () => {
    const drawn = [];
    const make = (id, x, y) => ({
        id, x, y, width: 50, height: 50, zIndex: 0, strokeWidth: 2,
        getBounds() { return { x: this.x, y: this.y, w: 50, h: 50 }; },
        draw() { drawn.push(id); }
    });
    const app = {
        elements: [make('in', 10, 10), make('far', 5000, 5000), make('edge', 520, 10),
            { id: 'nobounds', zIndex: 0, draw() { drawn.push('nobounds'); } }],
        selectionManager: { selectedElements: [], rubberBand: null },
        transform: { mode: null }, settings: { showGrid: false }
    };
    const camera = { x: 0, y: 0, zoom: 1 };
    const renderer = new Renderer({ width: 500, height: 400 }, fakeCtx(), camera, null, app);
    renderer._render();
    assert.deepEqual(drawn.sort(), ['edge', 'in', 'nobounds']);
});

test('renderer only schedules frames while dirty', () => {
    const frames = [];
    globalThis.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };
    globalThis.cancelAnimationFrame = () => {};
    try {
        const renderer = new Renderer({ width: 10, height: 10 }, fakeCtx(), new Camera(), new Grid(), {
            elements: [], selectionManager: { selectedElements: [], rubberBand: null },
            transform: { mode: null }
        });
        renderer.start();
        assert.equal(frames.length, 1);
        frames.shift()();
        assert.equal(frames.length, 0, 'idle loop must not reschedule');
        renderer.markDirty(); renderer.markDirty();
        assert.equal(frames.length, 1, 'one frame for repeated dirties');
        frames.shift()();
        renderer.stop();
    } finally {
        delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
    }
});

test('multi-selection draws one group box and no handles; single draws handles', () => {
    const a = new ShapeElement('rectangle', 0, 0, 40, 40);
    const b = new ShapeElement('rectangle', 100, 100, 40, 40);
    const ctx = fakeCtx();
    const app = {
        elements: [a, b], selectionManager: { selectedElements: [a, b], rubberBand: null },
        transform: { mode: null }
    };
    const renderer = new Renderer({}, ctx, { zoom: 1 }, null, app);
    renderer._drawSelectionOverlay(ctx, 1);
    const rects = ctx.calls.filter(c => c[0] === 'strokeRect');
    assert.equal(rects.length, 1);
    assert.deepEqual(rects[0].slice(1), [0, 0, 140, 140]);
    assert.equal(ctx.calls.filter(c => c[0] === 'fillRect').length, 0);
    ctx.calls.length = 0;
    app.selectionManager.selectedElements = [a];
    renderer._drawSelectionOverlay(ctx, 1);
    assert.ok(ctx.calls.filter(c => c[0] === 'fillRect').length >= 8);
});

test('rotated line endpoint handles use getEndpointWorld positions', () => {
    const line = new ShapeElement('line', 0, 0, 100, 0);
    line.rotation = Math.PI / 2;
    const ctx = fakeCtx();
    const renderer = new Renderer({}, ctx, { zoom: 1 }, null, {});
    renderer._drawElementHandles(ctx, line);
    const arcs = ctx.calls.filter(c => c[0] === 'arc');
    const p1 = line.getEndpointWorld(0), p2 = line.getEndpointWorld(1);
    assert.ok(Math.abs(arcs[0][1] - p1.x) < 1e-9 && Math.abs(arcs[0][2] - p1.y) < 1e-9);
    assert.ok(Math.abs(arcs[1][1] - p2.x) < 1e-9 && Math.abs(arcs[1][2] - p2.y) < 1e-9);
    assert.notEqual(Math.round(p2.y), 0);
});

test('snap hint draws every port of the snapped element', () => {
    const rect = new ShapeElement('rectangle', 0, 0, 100, 100);
    const ctx = fakeCtx();
    const renderer = new Renderer({}, ctx, { zoom: 1 }, null, {
        elements: [rect], _snapPreview: { x: 50, y: 0, elementId: rect.id, portId: 'top' }
    });
    renderer._drawConnectionPortHints(ctx);
    assert.equal(ctx.calls.filter(c => c[0] === 'arc').length, 5); // 4 other ports + highlight
});

test('devicePixelRatio change resizes the backing store', () => {
    const canvas = { clientWidth: 200, clientHeight: 100, width: 200, height: 100 };
    const renderer = new Renderer(canvas, fakeCtx(), { zoom: 1 }, null, {});
    globalThis.window = { devicePixelRatio: 2 };
    try {
        assert.equal(renderer.syncCanvasSize(), true);
        assert.deepEqual([canvas.width, canvas.height], [400, 200]);
        assert.equal(renderer.syncCanvasSize(), false);
    } finally { delete globalThis.window; }
});

test('hitTestAll rejects far elements early but keeps results identical', () => {
    let calls = 0;
    const el = (id, x, z, extra = {}) => ({
        id, x, y: 0, width: 20, height: 20, zIndex: z, rotation: 0,
        getBounds() { return { x: this.x, y: 0, w: 20, h: 20 }; },
        containsPoint(wx, wy) { calls++; return wx >= this.x && wx <= this.x + 20 && wy >= 0 && wy <= 20; },
        ...extra
    });
    const els = [el('a', 0, 1), el('b', 10, 2), el('far', 100000, 3)];
    assert.equal(HitTest.hitTestAll(els, 15, 5, { zoom: 1 }).id, 'b');
    calls = 0;
    HitTest.hitTestAll(els, 5, 5, { zoom: 1 });
    assert.equal(calls, 2, 'the far element must not reach containsPoint');
    calls = 0;
    // graph-like elements are never early-rejected
    const graph = el('g', 5000, 5, { type: 'graph' });
    assert.equal(HitTest.hitTestAll([graph], 0, 0, { zoom: 1 }), null);
    assert.equal(calls, 1);
    // thin line still hit
    const line = new ShapeElement('line', 0, 0, 100, 0);
    assert.equal(HitTest.hitTestAll([line], 50, 3, { zoom: 1 }), line);
    assert.equal(HitTest.hitTestAll([line], 50, 30, { zoom: 1 }), null);
});

function selApp(elements) {
    const app = { elements, currentColor: '#111', renderer: { markDirty() {} }, layerManager: { _reindex() {} } };
    app.selectionManager = new SelectionManager(app);
    return app;
}
const sweep = (app, x, y, w, h, additive = false) => {
    const sm = app.selectionManager;
    sm.startRubberBand(x, y); sm.updateRubberBand(x + w, y + h); sm.finishRubberBand(additive);
    return sm.selectedElements;
};

test('rubber band uses real shape for diagonal lines, pens and rotated boxes', () => {
    const diag = new ShapeElement('line', 0, 0, 100, 100);
    const pen = new PenElement();
    for (const [x, y] of [[0, 0], [0, 100], [100, 100]]) pen.addPoint(x, y);
    const rot = new ShapeElement('rectangle', 0, 0, 200, 20);
    rot.x = 0; rot.y = 0; rot.rotation = Math.PI / 4;
    const app = selApp([diag, pen, rot]);
    // top-right corner of the shared bbox: empty for the diagonal and the pen's L
    const hit = sweep(app, 85, 0, 14, 14);
    assert.ok(!hit.includes(diag), 'diagonal line bbox corner');
    assert.ok(!hit.includes(pen), 'pen L-shape bbox corner');
    assert.ok(sweep(app, 45, 45, 10, 10).includes(diag));
    assert.ok(sweep(app, -5, 95, 10, 10).includes(pen));
    // rotated 200x20 bar centred at (100,10): corner of its AABB is empty, its middle is not
    assert.ok(!sweep(app, 200, -60, 10, 10).includes(rot));
    assert.ok(sweep(app, 95, 5, 10, 10).includes(rot));
});

test('rubber band additive keeps selection without duplicates; clear() leaves currentColor alone', () => {
    const a = new ShapeElement('rectangle', 0, 0, 20, 20); a.color = '#f00';
    const b = new ShapeElement('rectangle', 100, 0, 20, 20); b.color = '#0f0';
    const app = selApp([a, b]);
    app.selectionManager.select(a);
    assert.equal(app.currentColor, '#f00');
    app.currentColor = '#abc';
    app.selectionManager.clear();
    assert.equal(app.currentColor, '#abc');
    app.selectionManager.select(a);
    const sel = sweep(app, -5, -5, 200, 30, true);
    assert.deepEqual(sel, [a, b]);
});

test('Camera.zoomByFactor keeps the anchor and clamps', () => {
    const camera = new Camera();
    camera.x = 40; camera.y = -30; camera.zoom = 2;
    const before = camera.screenToWorld(300, 200);
    camera.zoomByFactor(Math.exp(0.35), 300, 200);
    const after = camera.screenToWorld(300, 200);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1e-9);
    assert.ok(Math.abs(camera.zoom - 2 * Math.exp(0.35)) < 1e-9);
    camera.zoomByFactor(1e9, 300, 200);
    assert.equal(camera.zoom, camera.maxZoom);
    const zoom = camera.zoom;
    camera.zoomByFactor(NaN, 1, 1); camera.zoomByFactor(-2, 1, 1); camera.zoomByFactor(0, 1, 1);
    assert.equal(camera.zoom, zoom);
});

test('grid batches lines into two strokes', () => {
    const ctx = fakeCtx();
    const camera = new Camera(); camera.zoom = 1;
    new Grid().draw(ctx, camera, 800, 600);
    assert.equal(ctx.calls.filter(c => c[0] === 'stroke').length, 2);
    assert.equal(ctx.calls.filter(c => c[0] === 'beginPath').length, 2);
});

test('text LOD stride helper', () => {
    assert.equal(getTextLodStride({ getTransform: () => ({ c: 0, d: 0.01 }) }, 10), 5);
    assert.equal(getTextLodStride({}, 10), 1);
});
