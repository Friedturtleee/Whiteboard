/**
 * Renderer — drives the requestAnimationFrame loop with dirty-flag optimization.
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
        this._loop = this._loop.bind(this);
    }

    start() {
        this._loop();
    }

    stop() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }

    markDirty() {
        this.needsRedraw = true;
    }

    _loop() {
        if (this.needsRedraw) {
            this.needsRedraw = false;
            this._render();
        }
        this._rafId = requestAnimationFrame(this._loop);
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
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(
            camera.zoom * dpr, 0, 0, camera.zoom * dpr,
            -camera.x * camera.zoom * dpr,
            -camera.y * camera.zoom * dpr
        );

        // Draw grid
        grid.draw(ctx, camera, w / dpr, h / dpr);

        // Draw elements sorted by z-index
        const elements = app.elements.slice().sort((a, b) => a.zIndex - b.zIndex);
        for (const el of elements) {
            if (el.hidden) continue;
            ctx.save();
            el.draw(ctx, camera);
            ctx.restore();
        }

        // Draw selection visuals
        this._drawSelectionOverlay(ctx, dpr);
    }

    _drawSelectionOverlay(ctx, dpr) {
        const { app, camera } = this;
        const sel = app.selectionManager;

        // Draw selection handles on selected elements
        for (const el of sel.selectedElements) {
            if (el.hidden) continue;
            ctx.save();
            this._drawElementHandles(ctx, el);
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
    }

    _drawElementHandles(ctx, el) {
        const bounds = el.getBounds();
        if (!bounds) return;
        const { camera } = this;
        const lw = 1.5 / camera.zoom;
        const hs = 5 / camera.zoom; // handle size (half)

        // Bounding box
        ctx.save();
        if (el.rotation) {
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
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
}
