/**
 * QueueElement — FIFO queue visualization.
 */
import { Element } from '../core/Element.js';

export class QueueElement extends Element {
    constructor(x = 0, y = 0) {
        super('queue', x, y, 300, 60);
        this.items = [];
        this.cellWidth = 50;
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
        this.width = Math.max(120, count * this.cellWidth + 60);
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
        const startX = x + 20;

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
        ctx.beginPath();
        ctx.moveTo(startX, arrowY);
        ctx.lineTo(startX + displayItems.length * cellWidth, arrowY);
        ctx.moveTo(startX + displayItems.length * cellWidth - 6, arrowY - 4);
        ctx.lineTo(startX + displayItems.length * cellWidth, arrowY);
        ctx.lineTo(startX + displayItems.length * cellWidth - 6, arrowY + 4);
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#808080';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Front', startX, arrowY + 12);
        ctx.textAlign = 'right';
        ctx.fillText('Back', startX + displayItems.length * cellWidth, arrowY + 12);

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
