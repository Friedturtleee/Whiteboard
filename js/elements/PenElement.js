/**
 * PenElement — freehand brush/pen stroke.
 * Points are stored relative to (this.x, this.y).
 */
import { Element } from '../core/Element.js';

export class PenElement extends Element {
    constructor(x = 0, y = 0) {
        super('pen', x, y, 1, 1);
        this.points    = [];   // [{x, y}] relative to (this.x, this.y)
        this.brushSize = 3;
        this.label     = 'Pen';
    }

    draw(ctx, camera) {
        if (this.points.length < 2) return;
        const bw = this._baseWidth  || this.width  || 1;
        const bh = this._baseHeight || this.height || 1;
        const sx = this.width  / bw;
        const sy = this.height / bh;

        this.applyStyle(ctx);
        ctx.save();
        if (this.rotation) {
            const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(this.rotation);
            ctx.translate(-cx, -cy);
        }
        ctx.lineWidth   = this.brushSize;
        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.globalAlpha = this.opacity ?? 1;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        const pts = this.points;
        ctx.beginPath();
        ctx.moveTo(this.x + pts[0].x * sx, this.y + pts[0].y * sy);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(this.x + pts[i].x * sx, this.y + pts[i].y * sy);
        }
        ctx.stroke();
        ctx.restore();
    }

    containsPoint(wx, wy, camera) {
        const tol = Math.max(this.brushSize, 6) / (camera?.zoom || 1);
        const bw = this._baseWidth  || this.width  || 1;
        const bh = this._baseHeight || this.height || 1;
        const sx = this.width  / bw;
        const sy = this.height / bh;

        // Un-rotate the test point into element-local unrotated space
        let lx = wx, ly = wy;
        if (this.rotation) {
            const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
            const cos = Math.cos(-this.rotation), sin = Math.sin(-this.rotation);
            const dx = wx - cx, dy = wy - cy;
            lx = cx + dx * cos - dy * sin;
            ly = cy + dx * sin + dy * cos;
        }

        for (let i = 1; i < this.points.length; i++) {
            const p1 = this.points[i - 1];
            const p2 = this.points[i];
            if (_segDist(lx, ly,
                this.x + p1.x * sx, this.y + p1.y * sy,
                this.x + p2.x * sx, this.y + p2.y * sy) < tol) return true;
        }
        return false;
    }

    /**
     * Called when the stroke is finished — rebases so min corner = (0, 0)
     * and updates el.x / y / width / height.
     */
    finish() {
        if (!this.points.length) return;
        let minX = 0, minY = 0, maxX = 0, maxY = 0;
        for (const p of this.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        if (minX < 0 || minY < 0) {
            for (const p of this.points) { p.x -= minX; p.y -= minY; }
            this.x += minX;
            this.y += minY;
        }
        this.width  = Math.max(1, maxX - minX);
        this.height = Math.max(1, maxY - minY);
        // Store reference dimensions for proportional scaling
        this._baseWidth  = this.width;
        this._baseHeight = this.height;
    }

    serialize() {
        return {
            ...super.serialize(),
            points:      this.points.map(p => ({ x: p.x, y: p.y })),
            brushSize:   this.brushSize,
            _baseWidth:  this._baseWidth  ?? this.width,
            _baseHeight: this._baseHeight ?? this.height,
        };
    }

    static fromData(data) {
        const el = new PenElement(data.x ?? 0, data.y ?? 0);
        return el;
    }
}

function _segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
