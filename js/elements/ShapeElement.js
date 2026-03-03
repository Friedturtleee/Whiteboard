/**
 * ShapeElement — rectangle, circle, ellipse, line, arrow.
 */
import { Element } from '../core/Element.js';

export class ShapeElement extends Element {
    constructor(shapeType = 'rectangle', x = 0, y = 0, w = 120, h = 80) {
        super(shapeType, x, y, w, h);
        this.shapeType = shapeType;
        this.label = shapeType;
        // For line/arrow: we store x,y as start and width,height as end offset
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, width: w, height: h, rotation } = this;

        ctx.save();
        if (rotation && this.shapeType !== 'line' && this.shapeType !== 'arrow') {
            const cx = x + w / 2, cy = y + h / 2;
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            ctx.translate(-cx, -cy);
        }

        switch (this.shapeType) {
            case 'rectangle':
                if (this.fillColor !== 'transparent') {
                    ctx.fillRect(x, y, w, h);
                }
                ctx.strokeRect(x, y, w, h);
                break;

            case 'circle': {
                const cx = x + w / 2, cy = y + h / 2;
                const rx = w / 2, ry = h / 2;
                ctx.beginPath();
                ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
                if (this.fillColor !== 'transparent') ctx.fill();
                ctx.stroke();
                break;
            }

            case 'ellipse': {
                const cx = x + w / 2, cy = y + h / 2;
                ctx.beginPath();
                ctx.ellipse(cx, cy, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
                if (this.fillColor !== 'transparent') ctx.fill();
                ctx.stroke();
                break;
            }

            case 'line': {
                const x2 = x + w, y2 = y + h;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                break;
            }

            case 'arrow': {
                const x2 = x + w, y2 = y + h;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                // Arrowhead
                const angle = Math.atan2(h, w);
                const headLen = 14;
                ctx.beginPath();
                ctx.moveTo(x2, y2);
                ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
                ctx.moveTo(x2, y2);
                ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
                ctx.stroke();
                break;
            }
        }
        ctx.restore();
    }

    containsPoint(wx, wy, camera) {
        if (this.shapeType === 'line' || this.shapeType === 'arrow') {
            const { HitTest } = this.constructor._hitTestModule || {};
            const tol = 6 / (camera?.zoom || 1);
            const dist = _pointToSegDist(wx, wy, this.x, this.y, this.x + this.width, this.y + this.height);
            return dist < tol;
        }
        if (this.shapeType === 'circle' || this.shapeType === 'ellipse') {
            const b = this.getBounds();
            let lx = wx, ly = wy;
            if (this.rotation) {
                const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                const cos = Math.cos(-this.rotation), sin = Math.sin(-this.rotation);
                const dx = wx - cx, dy = wy - cy;
                lx = cx + dx * cos - dy * sin;
                ly = cy + dx * sin + dy * cos;
            }
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            const rx = b.w / 2, ry = b.h / 2;
            if (rx === 0 || ry === 0) return false;
            return ((lx - cx) / rx) ** 2 + ((ly - cy) / ry) ** 2 <= 1;
        }
        return super.containsPoint(wx, wy, camera);
    }

    getBounds() {
        if (this.shapeType === 'line' || this.shapeType === 'arrow') {
            const x1 = this.x, y1 = this.y;
            const x2 = this.x + this.width, y2 = this.y + this.height;
            const minX = Math.min(x1, x2), minY = Math.min(y1, y2);
            return { x: minX, y: minY, w: Math.abs(this.width), h: Math.abs(this.height) };
        }
        return super.getBounds();
    }

    serialize() {
        return { ...super.serialize(), shapeType: this.shapeType };
    }

    static fromData(data) {
        const el = new ShapeElement(data.shapeType || data.type);
        return el;
    }
}

function _pointToSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
