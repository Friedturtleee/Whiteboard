/**
 * PenElement — freehand brush / pen stroke.
 * Stores an array of world-space points and renders as a smooth quadratic
 * Bézier path.  Supports line-width, opacity, and color like all other elements.
 */
import { Element } from '../core/Element.js';

export class PenElement extends Element {
    constructor(x = 0, y = 0) {
        super('pen', x, y, 0, 0);
        this.points = [];          // [{ x, y }, …] in world space
        this.strokeWidth = 2;
        this.label = 'Pen';
    }

    // ── Add a point and recompute bounding box ─────────────────────────────
    addPoint(wx, wy) {
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) return false;
        if (this.points.length === 0) {
            this.x = wx;
            this.y = wy;
            this.width = 0;
            this.height = 0;
        } else {
            const right = this.x + this.width;
            const bottom = this.y + this.height;
            this.x = Math.min(this.x, wx);
            this.y = Math.min(this.y, wy);
            this.width = Math.max(right, wx) - this.x;
            this.height = Math.max(bottom, wy) - this.y;
        }
        this.points.push({ x: wx, y: wy });
        return true;
    }

    _recalcBounds() {
        if (this.points.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const point of this.points) {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
        if (minX === Infinity) {
            this.width = 0;
            this.height = 0;
            return;
        }
        this.x      = minX;
        this.y      = minY;
        this.width  = maxX - minX;
        this.height = maxY - minY;
    }

    optimize(epsilon = 1.0) {
        this.points = _douglasPeucker(this.points, epsilon);
        this._recalcBounds();
    }

    // ── Rendering ─────────────────────────────────────────────────────────
    draw(ctx, camera) {
        if (this.points.length < 2) return;
        this.applyStyle(ctx);

        ctx.save();
        if (this.rotation) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(this.rotation);
            ctx.translate(-cx, -cy);
        }
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);

        // Smooth curve via mid-point quadratic Bézier
        for (let i = 1; i < this.points.length - 1; i++) {
            const mx = (this.points[i].x + this.points[i + 1].x) / 2;
            const my = (this.points[i].y + this.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(this.points[i].x, this.points[i].y, mx, my);
        }

        // Last segment
        const last = this.points[this.points.length - 1];
        const prev = this.points[this.points.length - 2];
        ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);

        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.lineWidth   = this.strokeWidth;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.stroke();
        ctx.restore();
    }

    containsPoint(wx, wy, camera) {
        const tol = Math.max(this.strokeWidth / 2 + 3, 6) / (camera?.zoom || 1);
        if (tol <= 0) return false;
        const tolSquared = tol * tol;
        let lx = wx, ly = wy;
        if (this.rotation) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            const cos = Math.cos(-this.rotation), sin = Math.sin(-this.rotation);
            const dx = wx - cx, dy = wy - cy;
            lx = cx + dx * cos - dy * sin;
            ly = cy + dx * sin + dy * cos;
        }
        const minX = Math.min(this.x, this.x + this.width) - tol;
        const maxX = Math.max(this.x, this.x + this.width) + tol;
        const minY = Math.min(this.y, this.y + this.height) - tol;
        const maxY = Math.max(this.y, this.y + this.height) + tol;
        if (lx < minX || lx > maxX || ly < minY || ly > maxY) return false;
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            if (lx < Math.min(p1.x, p2.x) - tol || lx > Math.max(p1.x, p2.x) + tol ||
                ly < Math.min(p1.y, p2.y) - tol || ly > Math.max(p1.y, p2.y) + tol) {
                continue;
            }
            if (_ptSegDistSquared(lx, ly, p1.x, p1.y, p2.x, p2.y) < tolSquared) return true;
        }
        return false;
    }

    // Lines/pens are connectors-sourced themselves — no connection ports
    getConnectionPorts() { return []; }

    // ── Serialization ─────────────────────────────────────────────────────
    serialize() {
        return {
            ...super.serialize(),
            points:      this.points.slice(),
            strokeWidth: this.strokeWidth,
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.points      = (Array.isArray(data.points) ? data.points : [])
            .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
            .map(point => ({ x: point.x, y: point.y }));
        this.strokeWidth = data.strokeWidth ?? 2;
        this._recalcBounds();
        return this;
    }

    static fromData(data) {
        return new PenElement(data.x ?? 0, data.y ?? 0);
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _ptSegDistSquared(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        const offsetX = px - x1;
        const offsetY = py - y1;
        return offsetX * offsetX + offsetY * offsetY;
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const offsetX = px - (x1 + t * dx);
    const offsetY = py - (y1 + t * dy);
    return offsetX * offsetX + offsetY * offsetY;
}

function _douglasPeucker(points, epsilon) {
    if (points.length <= 2) return points;
    if (epsilon < 0) return points.slice();
    const epsilonSquared = epsilon * epsilon;
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    const ranges = [[0, points.length - 1]];

    while (ranges.length) {
        const [start, end] = ranges.pop();
        const first = points[start];
        const last = points[end];
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const lengthSquared = dx * dx + dy * dy;
        let maxDistanceSquared = epsilonSquared;
        let index = -1;
        for (let i = start + 1; i < end; i++) {
            const point = points[i];
            let distanceSquared;
            if (lengthSquared === 0) {
                const offsetX = point.x - first.x;
                const offsetY = point.y - first.y;
                distanceSquared = offsetX * offsetX + offsetY * offsetY;
            } else {
                const cross = Math.abs(dy * point.x - dx * point.y + last.x * first.y - last.y * first.x);
                distanceSquared = cross * cross / lengthSquared;
            }
            if (distanceSquared > maxDistanceSquared) {
                maxDistanceSquared = distanceSquared;
                index = i;
            }
        }
        if (index !== -1) {
            keep[index] = 1;
            ranges.push([start, index], [index, end]);
        }
    }

    return points.filter((_, index) => keep[index]);
}
