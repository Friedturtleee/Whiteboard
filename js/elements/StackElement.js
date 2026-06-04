/**
 * StackElement — LIFO stack visualization.
 */
import { Element } from '../core/Element.js';

export class StackElement extends Element {
    constructor(x = 0, y = 0) {
        super('stack', x, y, 80, 200);
        this.items = [];           // bottom → top
        this.cellHeight = 72;      // square: matches cell width (width - 16 = 72)
        this.fontSize = 14;
        this.maxDisplay = 8;
        this.label = 'Stack';
        this.inputText = '';
        this.highlights = {};      // { displayIndex: color }
        this.selectedIndices = new Set(); // item indices for cell selection
        this._hoverEdge = null;           // 'top' | null
        this._lastItemIdx = -1;           // for shift-range select
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
        this.selectedIndices.clear();
        this._lastItemIdx = -1;
        this._updateSize();
    }

    _updateSize() {
        const count = Math.max(1, Math.min(this.items.length, this.maxDisplay));
        this.width = this.cellHeight + 16;
        this.height = count * this.cellHeight + 8 /*bottom*/ + 24 /*top for label*/;
        this.fontSize = Math.max(10, Math.floor(this.cellHeight * 0.35));
    }

    /**
     * Snapshot state before resize drag begins.
     */
    onResizeStart() {
        this._origCellHeight = this.cellHeight;
        this._origResizeW = this.width;
        this._origResizeH = this.height;
    }

    /**
     * Called when element is resized via handle. Adjusts cell proportions.
     */
    onResize(newW, newH) {
        const count = Math.max(1, Math.min(this.items.length, this.maxDisplay));
        const newCellW = Math.floor(newW - 16);
        const newCellH = Math.floor((newH - 32) / count); // 32 = 8 + 24
        this.cellHeight = Math.max(20, Math.min(newCellW, newCellH));
        this._updateSize();
    }

    /** Returns 'top' | null if (wx,wy) is in the top edge-add zone. */
    hitTestEdgeAdd(wx, wy) {
        const zone = 28;
        if (wx >= this.x && wx <= this.x + this.width &&
            wy >= this.y - zone && wy <= this.y + 4) return 'top';
        return null;
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, width: w, rotation, items, cellHeight } = this;

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

        // Top label
        ctx.fillStyle = this.getEffectiveColor('#808080');
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOP ↑', x + w / 2, y + 14);

        // Items drawn bottom-up
        const displayItems = items.slice(-this.maxDisplay);
        const baseY = y + this.height - 8;

        // Adaptive font size
        const maxLen = Math.max(1, ...displayItems.map(v => String(v).length));
        const cellInnerW = w - 16;
        const cellInnerH = cellHeight - 6;
        const fontByWidth = cellInnerW / (maxLen * 0.6);
        const fontByHeight = cellInnerH * 0.5;
        const adaptiveFontSize = Math.max(8, Math.min(fontByWidth, fontByHeight, 36));
        ctx.font = `${adaptiveFontSize}px Consolas, monospace`;

        const slotsToDraw = Math.max(1, displayItems.length);
        for (let i = 0; i < slotsToDraw; i++) {
            const topY = baseY - (i + 1) * cellHeight;
            const cy = topY + cellHeight / 2;
            const cx = x + w / 2;

            // Highlight background (user-defined colour)
            if (this.highlights[i]) {
                ctx.fillStyle = this.highlights[i];
                ctx.globalAlpha = this.opacity;
                ctx.fillRect(x + 8, topY, w - 16, cellHeight);
            }

            // Cell border
            ctx.strokeStyle = this.getEffectiveColor(this.color);
            ctx.lineWidth = 1;
            ctx.globalAlpha = this.opacity * 0.3;
            ctx.strokeRect(x + 8, topY, w - 16, cellHeight);
            ctx.globalAlpha = this.opacity;

            // Value (skip rendering the full-width space placeholder)
            if (i < displayItems.length && displayItems[i] !== '　') {
                ctx.fillStyle = this.getEffectiveColor(this.color);
                ctx.fillText(String(displayItems[i]), cx, cy, w - 16);
            }

            // Cell selection highlight
            if (this.selectedIndices.has(i)) {
                ctx.strokeStyle = '#56b3e6';
                ctx.lineWidth = 2.5;
                ctx.globalAlpha = this.opacity;
                ctx.strokeRect(x + 8 + 1.5, topY + 1.5, w - 16 - 3, cellHeight - 3);
            }
        }

        // Arrow
        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.lineWidth = 1.5;
        const arrowX = x + w + 8;
        const topCellY = baseY - slotsToDraw * cellHeight;
        ctx.beginPath();
        ctx.moveTo(arrowX, baseY);
        ctx.lineTo(arrowX, topCellY);
        ctx.moveTo(arrowX - 4, topCellY + 6);
        ctx.lineTo(arrowX, topCellY);
        ctx.lineTo(arrowX + 4, topCellY + 6);
        ctx.stroke();

        // "+" edge-add indicator at top
        if (this._hoverEdge === 'top') {
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = '#56b3e6';
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('+', x + w / 2, y - 14);
        }

        ctx.restore();
    }

    /**
     * Returns display index (0 = bottom) of item at (wx, wy), or -1.
     */
    hitTestItem(wx, wy) {
        const baseY = this.y + this.height - 8;
        const slots = Math.max(1, Math.min(this.items.length, this.maxDisplay));
        for (let i = 0; i < slots; i++) {
            const top = baseY - (i + 1) * this.cellHeight;
            const bottom = top + this.cellHeight;
            if (wx >= this.x + 8 && wx <= this.x + this.width - 8 &&
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
