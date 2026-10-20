/**
 * Camera — manages pan (x, y) and zoom state with coordinate transforms.
 */
export const MIN_CAMERA_ZOOM = 0.00001;
export const MAX_CAMERA_ZOOM = 10;

export class Camera {
    constructor() {
        this.x = 0;   // world-space offset
        this.y = 0;
        this.zoom = 1.5;   // 150實際用戶看到 100%
        this.minZoom = MIN_CAMERA_ZOOM;
        this.maxZoom = MAX_CAMERA_ZOOM;
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
        if (!Number.isFinite(delta) || delta === 0) return;
        const factor = delta > 0 ? 1.075 : 1 / 1.075;  // 7.5% per step
        this.zoomTo(this.zoom * factor, sx, sy);
    }

    /** Change scale while keeping the point under the screen pivot fixed. */
    zoomTo(nextZoom, sx, sy) {
        if (![nextZoom, sx, sy].every(Number.isFinite) || nextZoom <= 0) return;
        const oldZoom = this.zoom;
        this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, nextZoom));

        // Adjust pan so the world point under the cursor stays fixed
        const worldBefore = { x: sx / oldZoom + this.x, y: sy / oldZoom + this.y };
        const worldAfter  = { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
        this.x += worldBefore.x - worldAfter.x;
        this.y += worldBefore.y - worldAfter.y;
    }

    /** Uniformly frame world bounds inside a screen-space working area. */
    fitBounds(bounds, viewport) {
        if (![bounds.x, bounds.y, bounds.w, bounds.h, viewport.x, viewport.y,
            viewport.width, viewport.height].every(Number.isFinite) ||
            bounds.w < 0 || bounds.h < 0 || viewport.width <= 0 || viewport.height <= 0) return false;
        const zoom = Math.min(viewport.width / Math.max(1, bounds.w),
            viewport.height / Math.max(1, bounds.h), this.maxZoom);
        this.zoom = Math.max(this.minZoom, zoom);
        this.x = bounds.x + bounds.w / 2 - (viewport.x + viewport.width / 2) / this.zoom;
        this.y = bounds.y + bounds.h / 2 - (viewport.y + viewport.height / 2) / this.zoom;
        return true;
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
