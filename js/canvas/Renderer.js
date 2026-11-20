import { elementsInPaintOrder } from '../core/ElementOrder.js';

/**
 * Renderer — draws on demand: a requestAnimationFrame is only scheduled while
 * the board is dirty, so an idle whiteboard costs no frames at all.
 */
export class Renderer {
    constructor(canvas, ctx, camera, grid, app) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.camera = camera;
        this.grid = grid;
        this.app = app;
        this.needsRedraw = true;
        this._rafId = null;
        this._running = false;
        this._dprQuery = null;
        this._dprListener = null;
        this._loop = this._loop.bind(this);
    }

    start() {
        this._running = true;
        this._watchDevicePixelRatio();
        this._schedule();
    }

    stop() {
        this._running = false;
        if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._rafId);
        }
        this._rafId = null;
        this._unwatchDevicePixelRatio();
    }

    markDirty() {
        this.needsRedraw = true;
        if (this._running && this._rafId === null) this._schedule();
    }

    _schedule() {
        if (typeof requestAnimationFrame !== 'function') return;
        this._rafId = requestAnimationFrame(this._loop);
    }

    _loop() {
        this._rafId = null;
        if (!this._running || !this.needsRedraw) return;
        this.needsRedraw = false;
        this._render();
    }

    // ── Device pixel ratio ───────────────────────────────────────────────

    /**
     * Resize the backing store to clientSize * devicePixelRatio. Only touches
     * canvas.width/height when they actually differ, because assigning them
     * clears the bitmap.
     */
    syncCanvasSize() {
        const { canvas } = this;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!(w > 0 && h > 0)) return false;
        const pixelWidth = Math.floor(w * dpr), pixelHeight = Math.floor(h * dpr);
        if (canvas.width === pixelWidth && canvas.height === pixelHeight) return false;
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        return true;
    }

    _watchDevicePixelRatio() {
        this._unwatchDevicePixelRatio();
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        // A resolution media query only matches one exact ratio, so re-arm it after every change.
        const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        const listener = () => {
            this.syncCanvasSize();
            this.markDirty();
            if (this._running) this._watchDevicePixelRatio();
        };
        if (typeof query.addEventListener === 'function') query.addEventListener('change', listener);
        else if (typeof query.addListener === 'function') query.addListener(listener);
        this._dprQuery = query;
        this._dprListener = listener;
    }

    _unwatchDevicePixelRatio() {
        const query = this._dprQuery, listener = this._dprListener;
        this._dprQuery = this._dprListener = null;
        if (!query || !listener) return;
        if (typeof query.removeEventListener === 'function') query.removeEventListener('change', listener);
        else if (typeof query.removeListener === 'function') query.removeListener(listener);
    }

    // ── Culling ──────────────────────────────────────────────────────────

    /** Visible world rectangle, or null when the camera state is unusable. */
    _getVisibleWorldRect(canvasWidth, canvasHeight, dpr) {
        const { camera } = this;
        const zoom = camera.zoom;
        if (!(zoom > 0)) return null;
        const minX = camera.x, minY = camera.y;
        const maxX = minX + canvasWidth / (dpr * zoom);
        const maxY = minY + canvasHeight / (dpr * zoom);
        return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
    }

    /**
     * True only when the element's (rotated, padded) world bounds lie fully outside the
     * view. Anything whose bounds cannot be computed is reported as visible.
     */
    _isOutsideView(el, view) {
        if (!view) return false;
        let b;
        try {
            b = typeof el.getRotatedBounds === 'function' ? el.getRotatedBounds()
                : (typeof el.getBounds === 'function' ? el.getBounds() : null);
        } catch { return false; }
        if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return false;
        const zoom = this.camera.zoom;
        // Stroke, arrow heads, antialiasing, selection handles (~40 screen px) and a
        // proportional allowance for content that spills slightly past its bounds.
        const pad = (Math.max(0, Number(el.strokeWidth) || 0)) * 2 + 24 +
            Math.max(Math.abs(b.w), Math.abs(b.h)) * 0.1 + 40 / zoom;
        const minX = Math.min(b.x, b.x + b.w) - pad, maxX = Math.max(b.x, b.x + b.w) + pad;
        const minY = Math.min(b.y, b.y + b.h) - pad, maxY = Math.max(b.y, b.y + b.h) + pad;
        return maxX < view.minX || minX > view.maxX || maxY < view.minY || minY > view.maxY;
    }

    _render() {
        const { canvas, ctx, camera, grid, app } = this;
        const w = canvas.width;
        const h = canvas.height;

        // Clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, w, h);

        // Apply camera transform (scale for HiDPI already in canvas size)
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        ctx.setTransform(
            camera.zoom * dpr, 0, 0, camera.zoom * dpr,
            -camera.x * camera.zoom * dpr,
            -camera.y * camera.zoom * dpr
        );

        // Draw grid
        if (!app.settings || app.settings.showGrid !== false) {
            grid.draw(ctx, camera, w / dpr, h / dpr);
        }

        // Draw elements sorted by z-index, skipping those fully outside the view
        const view = this._getVisibleWorldRect(w, h, dpr);
        const elements = elementsInPaintOrder(app.elements);
        for (const el of elements) {
            if (el.hidden) continue;
            if (this._isOutsideView(el, view)) continue;
            ctx.save();
            try {
                el.draw(ctx, camera);
            } catch (err) {
                // Defensive: if one element fails to draw, don't break the whole canvas
                console.error('[Renderer] draw error for element', el.id, el.type, err);
                // Draw a red outline to indicate the broken element
                ctx.strokeStyle = '#e06c75';
                ctx.lineWidth = 2 / camera.zoom;
                ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
                ctx.strokeRect(el.x, el.y, el.width || 60, el.height || 40);
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        // Draw selection visuals
        this._drawSelectionOverlay(ctx, dpr);

    }

    _drawSelectionOverlay(ctx, dpr) {
        const { app, camera } = this;
        const sel = app.selectionManager;
        const selected = sel.selectedElements;

        if (selected.length === 1) {
            // Handles are only operable for a single selection (see HitTest / app.js).
            const el = selected[0];
            if (!el.hidden && !el.isEditing && !el.isEditingNode && !el.isEditingEdge) {
                ctx.save();
                this._drawElementHandles(ctx, el);
                ctx.restore();
            }
        } else if (selected.length > 1) {
            ctx.save();
            this._drawGroupBounds(ctx, selected);
            ctx.restore();
        }

        // Draw rubber-band rectangle
        if (sel.rubberBand) {
            const rb = sel.rubberBand;
            ctx.strokeStyle = 'rgba(80,140,200,0.7)';
            ctx.fillStyle = 'rgba(80,140,200,0.15)';
            ctx.lineWidth = 1 / camera.zoom;
            ctx.fillRect(rb.x, rb.y, rb.w, rb.h);
            ctx.strokeRect(rb.x, rb.y, rb.w, rb.h);
        }

        // Draw edge-creation preview line (for graph)
        if (app._edgePreview) {
            const ep = app._edgePreview;
            ctx.strokeStyle = 'rgba(200,200,200,0.5)';
            ctx.lineWidth = 2 / camera.zoom;
            ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
            ctx.beginPath();
            ctx.moveTo(ep.x1, ep.y1);
            ctx.lineTo(ep.x2, ep.y2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw connection port hints when dragging a line endpoint
        if (app.transform.mode === 'endpoint') {
            this._drawConnectionPortHints(ctx);
        }
    }

    /** One dashed box around a multi-selection (no handles: they are not operable). */
    _drawGroupBounds(ctx, elements) {
        const { camera } = this;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of elements) {
            if (el.hidden || el.isEditing || el.isEditingNode || el.isEditingEdge) continue;
            const b = el.getRotatedBounds ? el.getRotatedBounds() : el.getBounds();
            if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) continue;
            minX = Math.min(minX, b.x, b.x + b.w); maxX = Math.max(maxX, b.x, b.x + b.w);
            minY = Math.min(minY, b.y, b.y + b.h); maxY = Math.max(maxY, b.y, b.y + b.h);
        }
        if (minX === Infinity) return;
        ctx.strokeStyle = 'rgba(80,140,200,0.8)';
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
    }

    _drawElementHandles(ctx, el) {
        const bounds = el.getBounds();
        if (!bounds) return;
        const { camera } = this;
        const lw = 1.5 / camera.zoom;
        const hs = 5 / camera.zoom; // handle size (half)

        // ── Line / Arrow: two circular endpoint handles only ──────────────
        if (el.shapeType === 'line' || el.shapeType === 'arrow') {
            // Same world-space endpoints HitTest.hitTestHandles uses (honours rotation).
            const p1 = el.getEndpointWorld?.(0) ?? el.toWorldPoint(el.x, el.y);
            const p2 = el.getEndpointWorld?.(1) ?? el.toWorldPoint(el.x + el.width, el.y + el.height);
            const x1 = p1.x, y1 = p1.y;
            const x2 = p2.x, y2 = p2.y;
            const r  = 5.5 / camera.zoom;

            // Dashed guide line
            ctx.strokeStyle = 'rgba(80,140,200,0.45)';
            ctx.lineWidth = lw;
            ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.setLineDash([]);

            // Draw P1 and P2 handles
            for (let i = 0; i < 2; i++) {
                const px = i === 0 ? x1 : x2;
                const py = i === 0 ? y1 : y2;
                const conn = i === 0 ? el.connections?.p1 : el.connections?.p2;
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fillStyle = conn ? 'transparent' : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = conn ? 'transparent' : 'rgba(80,140,200,0.9)';
                ctx.lineWidth = lw;
                ctx.stroke();
            }
            return; // skip standard bounding-box handles
        }

        // Bounding box
        ctx.save();
        if (el.rotation) {
            const { x: cx, y: cy } = el.getRotationCenter();
            ctx.translate(cx, cy);
            ctx.rotate(el.rotation);
            ctx.translate(-cx, -cy);
        }
        ctx.strokeStyle = 'rgba(80,140,200,0.8)';
        ctx.lineWidth = lw;
        ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.setLineDash([]);

        // Resize handles
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(80,140,200,0.8)';
        ctx.lineWidth = lw;
        const corners = [
            [bounds.x, bounds.y],
            [bounds.x + bounds.w, bounds.y],
            [bounds.x + bounds.w, bounds.y + bounds.h],
            [bounds.x, bounds.y + bounds.h],
        ];
        const midpoints = [
            [bounds.x + bounds.w / 2, bounds.y],
            [bounds.x + bounds.w, bounds.y + bounds.h / 2],
            [bounds.x + bounds.w / 2, bounds.y + bounds.h],
            [bounds.x, bounds.y + bounds.h / 2],
        ];
        for (const [px, py] of [...corners, ...midpoints]) {
            ctx.fillRect(px - hs, py - hs, hs * 2, hs * 2);
            ctx.strokeRect(px - hs, py - hs, hs * 2, hs * 2);
        }

        // Rotation handle
        const rcx = bounds.x + bounds.w / 2;
        const rcy = bounds.y - 25 / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(rcx, bounds.y);
        ctx.lineTo(rcx, rcy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rcx, rcy, 4 / camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /**
     * While dragging a line endpoint: show every connection port of the element
     * currently being snapped to, and highlight the port that will be used.
     * Only the snapped candidate's ports are enumerated, never the whole board.
     */
    _drawConnectionPortHints(ctx) {
        const { camera, app } = this;
        const sp = app._snapPreview;
        if (!sp) return;

        const target = sp.elementId != null && Array.isArray(app.elements)
            ? app.elements.find(element => element.id === sp.elementId) : null;
        if (target && typeof target.getConnectionPorts === 'function') {
            ctx.fillStyle = 'rgba(80, 140, 200, 0.25)';
            ctx.strokeStyle = 'rgba(80, 140, 200, 0.8)';
            ctx.lineWidth = 1.5 / camera.zoom;
            for (const port of target.getConnectionPorts()) {
                if (port.id === sp.portId) continue;
                ctx.beginPath();
                ctx.arc(port.x, port.y, 4.5 / camera.zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        // Highlight the snapped port
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 9 / camera.zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80, 140, 200, 0.50)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 140, 200, 1.0)';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.stroke();
    }
}
