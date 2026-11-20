/**
 * HitTest — geometry-based hit detection for all element types.
 */
export class HitTest {
    /**
     * Test a world-space point against all elements (reverse z-order).
     * Returns the topmost hit element or null.
     */
    static hitTestAll(elements, wx, wy, camera) {
        let topmost = null, highestZ = -Infinity;
        // The later array entry is painted last when z-indices are equal.
        // Scan once instead of sorting the complete board on every move.
        for (let index = elements.length - 1; index >= 0; index--) {
            const el = elements[index];
            if (el.hidden || el.locked) continue;
            const zIndex = el.zIndex ?? 0;
            if (topmost && zIndex <= highestZ) continue;
            if (HitTest._isOutsideHitBounds(el, wx, wy, camera)) continue;
            if (el.containsPoint(wx, wy, camera)) {
                topmost = el; highestZ = zIndex;
            }
        }
        return topmost;
    }

    /**
     * Cheap conservative reject: true only when the point is certainly outside
     * everything containsPoint() could accept. Graph/tree hit shapes (nodes, loops,
     * labels) may extend beyond getBounds(), so they are never rejected here.
     */
    static _isOutsideHitBounds(el, wx, wy, camera) {
        if (el.type === 'graph' || el.type === 'tree' || typeof el.getBounds !== 'function') return false;
        const b = el.getBounds();
        if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return false;
        let px = wx, py = wy;
        if (el.rotation && typeof el.toLocalPoint === 'function') {
            const local = el.toLocalPoint(wx, wy);
            px = local.x; py = local.y;
        }
        const zoom = camera?.zoom > 0 ? camera.zoom : 1;
        const pad = (24 + 2 * Math.max(0, Number(el.strokeWidth) || 0)) / zoom;
        return px < Math.min(b.x, b.x + b.w) - pad || px > Math.max(b.x, b.x + b.w) + pad ||
            py < Math.min(b.y, b.y + b.h) - pad || py > Math.max(b.y, b.y + b.h) + pad;
    }

    /**
     * Hit test for resize/rotate handles on a specific element.
     * Returns: { type: 'resize'|'rotate', index, cursor } or null.
     */
    static hitTestHandles(el, wx, wy, camera) {
        if (!el || el.hidden || el.locked) return null;
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

    /** Inclusive segment-vs-rect test (Liang-Barsky). Rect is { x, y, w, h }. */
    static segmentIntersectsRect(x1, y1, x2, y2, rect) {
        const left = rect.x, right = rect.x + rect.w, top = rect.y, bottom = rect.y + rect.h;
        const dx = x2 - x1, dy = y2 - y1;
        let t0 = 0, t1 = 1;
        const p = [-dx, dx, -dy, dy];
        const q = [x1 - left, right - x1, y1 - top, bottom - y1];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) {
                if (q[i] < 0) return false;
            } else {
                const r = q[i] / p[i];
                if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
                else { if (r < t0) return false; if (r < t1) t1 = r; }
            }
        }
        return true;
    }

    /** Inclusive test of a polyline (array of {x,y}) against a rect; one point counts as a dot. */
    static polylineIntersectsRect(points, rect) {
        if (!points || points.length === 0) return false;
        if (points.length === 1) {
            const p = points[0];
            return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
        }
        for (let i = 0; i < points.length - 1; i++) {
            if (HitTest.segmentIntersectsRect(points[i].x, points[i].y,
                points[i + 1].x, points[i + 1].y, rect)) return true;
        }
        return false;
    }

    /** Inclusive convex polygon (array of {x,y}) vs axis-aligned rect test (SAT). */
    static polygonIntersectsRect(polygon, rect) {
        const corners = [
            { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
            { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }
        ];
        const separated = (ax, ay) => {
            let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
            for (const p of polygon) { const d = p.x * ax + p.y * ay; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
            for (const p of corners) { const d = p.x * ax + p.y * ay; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
            return aMax < bMin || bMax < aMin;
        };
        if (separated(1, 0) || separated(0, 1)) return false;
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length];
            const nx = a.y - b.y, ny = b.x - a.x;
            if ((nx !== 0 || ny !== 0) && separated(nx, ny)) return false;
        }
        return true;
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
