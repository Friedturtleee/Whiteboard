/**
 * StackElement — LIFO stack visualization.
 */
import { Element } from '../core/Element.js';

export class StackElement extends Element {
    constructor(x = 0, y = 0) {
        super('stack', x, y, 80, 200);
        this.items = [];           // bottom → top
        this.cellHeight = 72;      // square: matches cell width (width - 8 = 72)
        this.fontSize = 14;
        this.maxDisplay = 8;
        this.label = 'Stack';
        this.inputText = '';
        this.highlights = {};      // { displayIndex: color }
    }

    push(val) {
        this.items.push(val);
        this._updateSize();
    }

    pop() {
        const v = this.items.pop();
        this._updateSize();
        return v;
    }

    setFromText(text) {
        this.inputText = text;
        const vals = text.trim().split(/[\s,\n]+/).filter(v => v);
        this.items = vals;
        this._updateSize();
    }

    _updateSize() {
        const count = Math.min(this.items.length, this.maxDisplay);
        this.height = Math.max(80, count * this.cellHeight + 40);
    }

    /**
     * Snapshot state before resize drag begins.
     */
    onResizeStart() {
        this._origCellHeight = this.cellHeight;
        this._origResizeW = this.width;
    }

    /**
     * Called when element is resized via handle. Adjusts cell proportions.
     */
    onResize(newW, newH) {
        // Keep cells square: cellHeight matches inner width
        this.cellHeight = Math.max(24, newW - 8);
        const count = Math.min(this.items.length, this.maxDisplay);
        this.height = Math.max(newW, count * this.cellHeight + 40);
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, width: w, rotation, items, cellHeight, fontSize } = this;

        ctx.save();
        if (rotation) {
            const cx = x + w / 2, cy = y + this.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            ctx.translate(-cx, -cy);
        }

        // Background
        ctx.fillStyle = 'rgba(30,30,30,0.8)';
        ctx.fillRect(x, y, w, this.height);
        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, this.height);

        // Items drawn bottom-up
        ctx.font = `${fontSize}px Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayItems = items.slice(-this.maxDisplay);
        const baseY = y + this.height - 10;

        for (let i = 0; i < displayItems.length; i++) {
            const cy = baseY - (i + 1) * cellHeight + cellHeight / 2;
            const cx = x + w / 2;

            // Highlight background
            if (this.highlights[i]) {
                ctx.fillStyle = this.highlights[i];
                ctx.globalAlpha = this.opacity;
                ctx.fillRect(x + 4, baseY - (i + 1) * cellHeight, w - 8, cellHeight);
            }

            // Cell
            ctx.strokeStyle = this.getEffectiveColor(this.color);
            ctx.lineWidth = 1;
            ctx.globalAlpha = this.opacity * 0.3;
            ctx.strokeRect(x + 4, baseY - (i + 1) * cellHeight, w - 8, cellHeight);
            ctx.globalAlpha = this.opacity;

            // Value
            ctx.fillStyle = this.getEffectiveColor(this.color);
            ctx.fillText(String(displayItems[i]), cx, cy, w - 12);
        }

        // Top label
        ctx.fillStyle = this.getEffectiveColor('#808080');
        ctx.font = '10px sans-serif';
        ctx.fillText('TOP ↑', x + w / 2, y + 10);

        // Arrow
        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.lineWidth = 1.5;
        const arrowX = x + w + 8;
        if (displayItems.length > 0) {
            const topCellY = baseY - displayItems.length * cellHeight;
            ctx.beginPath();
            ctx.moveTo(arrowX, baseY);
            ctx.lineTo(arrowX, topCellY);
            ctx.moveTo(arrowX - 4, topCellY + 6);
            ctx.lineTo(arrowX, topCellY);
            ctx.lineTo(arrowX + 4, topCellY + 6);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Returns display index (0 = bottom) of item at (wx, wy), or -1.
     */
    hitTestItem(wx, wy) {
        const baseY = this.y + this.height - 10;
        const displayItems = this.items.slice(-this.maxDisplay);
        for (let i = 0; i < displayItems.length; i++) {
            const top    = baseY - (i + 1) * this.cellHeight;
            const bottom = baseY - i * this.cellHeight;
            if (wx >= this.x + 4 && wx <= this.x + this.width - 4 &&
                wy >= top && wy <= bottom) {
                return i;
            }
        }
        return -1;
    }

    serialize() {
        return {
            ...super.serialize(),
            items: this.items, cellHeight: this.cellHeight,
            fontSize: this.fontSize, maxDisplay: this.maxDisplay,
            inputText: this.inputText, highlights: this.highlights
        };
    }

    static fromData(data) {
        const el = new StackElement(data.x, data.y);
        return el;
    }
}
