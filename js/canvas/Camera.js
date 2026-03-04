/**
 * Camera — manages pan (x, y) and zoom state with coordinate transforms.
 */
export class Camera {
    constructor() {
        this.x = 0;   // world-space offset
        this.y = 0;
        this.zoom = 1.5;   // 150實際用戶看到 100%
        this.minZoom = 0.45;   // ~30% 顯示，防止文字被撠壓
        this.maxZoom = 10;
    }

    /** Apply camera transform to a canvas 2D context */
    applyTransform(ctx) {
        ctx.setTransform(this.zoom, 0, 0, this.zoom, -this.x * this.zoom, -this.y * this.zoom);
    }

    /** Convert screen pixel coords to world coords */
    screenToWorld(sx, sy) {
        return {
            x: sx / this.zoom + this.x,
            y: sy / this.zoom + this.y
        };
    }

    /** Convert world coords to screen pixel coords */
    worldToScreen(wx, wy) {
        return {
            x: (wx - this.x) * this.zoom,
            y: (wy - this.y) * this.zoom
        };
    }

    /**
     * Zoom towards a screen-space point (e.g. mouse cursor).
     * @param {number} delta - positive = zoom in, negative = zoom out
     * @param {number} sx - screen x
     * @param {number} sy - screen y
     */
    zoomAt(delta, sx, sy) {
        const oldZoom = this.zoom;
        const factor = delta > 0 ? 1.075 : 1 / 1.075;  // 7.5% per step
        this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));

        // Adjust pan so the world point under the cursor stays fixed
        const worldBefore = { x: sx / oldZoom + this.x, y: sy / oldZoom + this.y };
        const worldAfter  = { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
        this.x += worldBefore.x - worldAfter.x;
        this.y += worldBefore.y - worldAfter.y;
    }

    /** Pan the camera by screen-space delta */
    pan(dsx, dsy) {
        this.x -= dsx / this.zoom;
        this.y -= dsy / this.zoom;
    }

    /** Reset zoom and position */
    reset() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1.5;  // reset 回到預設縮放
    }
}
