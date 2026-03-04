/**
 * QueueElement — FIFO queue visualization.
 */
import { Element } from '../core/Element.js';

export class QueueElement extends Element {
    constructor(x = 0, y = 0) {
        super('queue', x, y, 300, 60);
        this.items = [];
        this.cellWidth = 44;       // square: matches cell height (height - 16 = 44)
        this.fontSize = 14;
        this.maxDisplay = 10;
        this.label = 'Queue';
        this.inputText = '';
    }

    enqueue(val) {
        this.items.push(val);
        this._updateSize();
    }

    dequeue() {
        const v = this.items.shift();
        this._updateSize();
        return v;
    }

    setFromText(text) {
        this.inputText = text;
        this.items = text.trim().split(/[\s,\n]+/).filter(v => v);
        this._updateSize();
    }

    _updateSize() {
        const count = Math.min(this.items.length, this.maxDisplay);
        this.width = Math.max(this.cellWidth, count * this.cellWidth);
    }

    /**
     * Called when element is resized via handle. Adjusts cell proportions.
     */
    onResize(newW, newH) {
        this.cellWidth = Math.max(24, newH - 16);
        this._updateSize();
        if (this.width < newW) this.width = newW; // allow stretching wider
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, height: h, rotation, items, cellWidth, fontSize } = this;

        ctx.save();
        if (rotation) {
            const cx = x + this.width / 2, cy = y + h / 2;
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            ctx.translate(-cx, -cy);
        }

        // Background
        ctx.fillStyle = 'rgba(30,30,30,0.8)';
        ctx.fillRect(x, y, this.width, h);
        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, this.width, h);

        // Items drawn left to right
        ctx.font = `${fontSize}px Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayItems = items.slice(0, this.maxDisplay);
        const startX = x; // no left padding

        for (let i = 0; i < displayItems.length; i++) {
            const cx = startX + i * cellWidth + cellWidth / 2;
            const cy = y + h / 2;

            // Cell border
            ctx.strokeStyle = this.getEffectiveColor(this.color);
            ctx.lineWidth = 1;
            ctx.globalAlpha = this.opacity * 0.3;
            ctx.strokeRect(startX + i * cellWidth, y + 8, cellWidth, h - 16);
            ctx.globalAlpha = this.opacity;

            // Value
            ctx.fillStyle = this.getEffectiveColor(this.color);
            ctx.fillText(String(displayItems[i]), cx, cy, cellWidth - 6);
        }

        // Direction arrow
        ctx.strokeStyle = this.getEffectiveColor('#808080');
        ctx.lineWidth = 1.5;
        const arrowY = y + h + 10;
        const contentW = Math.max(cellWidth, displayItems.length * cellWidth);
        ctx.beginPath();
        ctx.moveTo(startX, arrowY);
        ctx.lineTo(startX + contentW, arrowY);
        ctx.moveTo(startX + contentW - 6, arrowY - 4);
        ctx.lineTo(startX + contentW, arrowY);
        ctx.lineTo(startX + contentW - 6, arrowY + 4);
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#808080';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Front', startX, arrowY + 12);
        ctx.textAlign = 'right';
        ctx.fillText('Back', startX + contentW, arrowY + 12);

        ctx.restore();
    }

    getBounds() {
        return { x: this.x, y: this.y, w: this.width, h: this.height + 25 };
    }

    serialize() {
        return {
            ...super.serialize(),
            items: this.items, cellWidth: this.cellWidth,
            fontSize: this.fontSize, maxDisplay: this.maxDisplay,
            inputText: this.inputText
        };
    }

    static fromData(data) {
        const el = new QueueElement(data.x, data.y);
        return el;
    }
}
