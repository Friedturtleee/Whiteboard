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
        this.points.push({ x: wx, y: wy });
        this._recalcBounds();
    }

    _recalcBounds() {
        if (this.points.length === 0) return;
        const xs = this.points.map(p => p.x);
        const ys = this.points.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
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
        let lx = wx, ly = wy;
        if (this.rotation) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            const cos = Math.cos(-this.rotation), sin = Math.sin(-this.rotation);
            const dx = wx - cx, dy = wy - cy;
            lx = cx + dx * cos - dy * sin;
            ly = cy + dx * sin + dy * cos;
        }
        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            if (_ptSegDist(lx, ly, p1.x, p1.y, p2.x, p2.y) < tol) return true;
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
        this.points      = (data.points || []).map(p => ({ x: p.x, y: p.y }));
        this.strokeWidth = data.strokeWidth ?? 2;
        this._recalcBounds();
        return this;
    }

    static fromData(data) {
        const el = new PenElement(data.x ?? 0, data.y ?? 0);
        el.deserialize(data);
        return el;
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _ptSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function _ptLinDist(p, p1, p2) {
    const num = Math.abs((p2.y - p1.y)*p.x - (p2.x - p1.x)*p.y + p2.x*p1.y - p2.y*p1.x);
    const den = Math.hypot(p2.y - p1.y, p2.x - p1.x);
    if (den === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    return num / den;
}

function _douglasPeucker(points, epsilon) {
    if (points.length <= 2) return points;
    let dmax = 0;
    let index = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const d = _ptLinDist(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }
    if (dmax > epsilon) {
        const recResults1 = _douglasPeucker(points.slice(0, index + 1), epsilon);
        const recResults2 = _douglasPeucker(points.slice(index), epsilon);
        return recResults1.slice(0, -1).concat(recResults2);
    } else {
        return [points[0], points[end]];
    }
}

