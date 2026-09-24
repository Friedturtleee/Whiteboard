/**
 * HitTest — geometry-based hit detection for all element types.
 */
export class HitTest {
    /**
     * Test a world-space point against all elements (reverse z-order).
     * Returns the topmost hit element or null.
     */
    static hitTestAll(elements, wx, wy, camera) {
        const sorted = elements.slice().sort((a, b) => b.zIndex - a.zIndex);
        for (const el of sorted) {
            if (el.hidden) continue;
            if (el.containsPoint(wx, wy, camera)) return el;
        }
        return null;
    }

    /**
     * Hit test for resize/rotate handles on a specific element.
     * Returns: { type: 'resize'|'rotate', index, cursor } or null.
     */
    static hitTestHandles(el, wx, wy, camera) {
        // ── Line / Arrow: only two endpoint handles ──────────────────────────
        if (el.shapeType === 'line' || el.shapeType === 'arrow') {
            const tol = 8 / camera.zoom;
            const p1 = el.getEndpointWorld?.(0) ?? el.toWorldPoint(el.x, el.y);
            const p2 = el.getEndpointWorld?.(1) ?? el.toWorldPoint(el.x + el.width, el.y + el.height);
            if (Math.hypot(wx - p1.x, wy - p1.y) < tol)
                return { type: 'endpoint', index: 0, cursor: 'crosshair' };
            if (Math.hypot(wx - p2.x, wy - p2.y) < tol)
                return { type: 'endpoint', index: 1, cursor: 'crosshair' };
            return null;
        }

        const bounds = el.getBounds();
        if (!bounds) return null;
        const tol = 6 / camera.zoom;

        const point = el.toLocalPoint(wx, wy);
        const lx = point.x, ly = point.y;

        // Rotation handle
        const rcx = bounds.x + bounds.w / 2;
        const rcy = bounds.y - 25 / camera.zoom;
        if (Math.hypot(lx - rcx, ly - rcy) < tol) {
            return { type: 'rotate', index: -1, cursor: 'crosshair' };
        }

        // Resize handles
        const handles = [
            { x: bounds.x, y: bounds.y, cursor: 'nw-resize', idx: 0 },
            { x: bounds.x + bounds.w, y: bounds.y, cursor: 'ne-resize', idx: 1 },
            { x: bounds.x + bounds.w, y: bounds.y + bounds.h, cursor: 'se-resize', idx: 2 },
            { x: bounds.x, y: bounds.y + bounds.h, cursor: 'sw-resize', idx: 3 },
            { x: bounds.x + bounds.w / 2, y: bounds.y, cursor: 'n-resize', idx: 4 },
            { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2, cursor: 'e-resize', idx: 5 },
            { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h, cursor: 's-resize', idx: 6 },
            { x: bounds.x, y: bounds.y + bounds.h / 2, cursor: 'w-resize', idx: 7 },
        ];
        for (const h of handles) {
            if (Math.abs(lx - h.x) < tol && Math.abs(ly - h.y) < tol) {
                return { type: 'resize', index: h.idx, cursor: h.cursor };
            }
        }
        return null;
    }

    /** Check if a rectangle (x,y,w,h) intersects another rectangle */
    static rectsIntersect(a, b) {
        return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
    }

    /** Point to line segment distance */
    static pointToSegmentDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
}
