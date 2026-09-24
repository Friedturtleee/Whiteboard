/**
 * StackElement — LIFO stack visualization.
 */
import { Element } from '../core/Element.js';
import { splitDataTokens } from '../core/DataTokens.js';

const EMPTY_CELL = '\u3000';
const isEmptyCell = value => value == null || value === '' || value === EMPTY_CELL;
const MAX_ITEMS = 10000;

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
        if (this.items.length >= MAX_ITEMS) return false;
        this.items.push(val);
        this._updateSize();
        this.updateTextFromData();
        return true;
    }

    updateTextFromData() {
        this.inputText = this.items.map(v => isEmptyCell(v) ? EMPTY_CELL : v).join(' ');
    }

    pop() {
        if (this.items.length === 0) return undefined;
        const index = this.items.length - 1;
        const v = this.items.pop();
        delete this.highlights[index];
        this.selectedIndices.delete(index);
        this._lastItemIdx = -1;
        this._updateSize();
        this.updateTextFromData();
        return v;
    }

    setFromText(text) {
        const rawText = String(text ?? '');
        if (rawText.length > 1000000) return '最多輸入 10000 個元素。';
        const vals = splitDataTokens(rawText, { multiline: true });
        if (vals.length > MAX_ITEMS) return '最多輸入 10000 個元素。';
        this.inputText = rawText;
        this.items = vals;
        this.highlights = {};
        this.selectedIndices.clear();
        this._lastItemIdx = -1;
        this._updateSize();
        return null;
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

    captureResizeState() {
        return { cellHeight: this.cellHeight, fontSize: this.fontSize };
    }

    restoreResizeState(state) {
        if (!state) return;
        this.cellHeight = state.cellHeight;
        this.fontSize = state.fontSize;
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

        // Items drawn bottom-up; all selection/highlight indices refer to this.items.
        const displayItems = items.slice(-this.maxDisplay);
        const firstItemIndex = items.length - displayItems.length;
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
            const itemIndex = firstItemIndex + i;
            if (this.highlights[itemIndex]) {
                ctx.fillStyle = this.highlights[itemIndex];
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
            if (i < displayItems.length && !isEmptyCell(displayItems[i])) {
                ctx.fillStyle = this.getEffectiveColor(this.color);
                ctx.fillText(String(displayItems[i]), cx, cy, w - 16);
            }

            // Cell selection highlight
            if (this.selectedIndices.has(itemIndex)) {
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

        ctx.restore();
    }

    /**
     * Returns the stable index in this.items of the visible item at (wx, wy), or -1.
     */
    hitTestItem(wx, wy) {
        const point = this.toLocalPoint(wx, wy);
        const baseY = this.y + this.height - 8;
        const slots = Math.max(1, Math.min(this.items.length, this.maxDisplay));
        for (let i = 0; i < slots; i++) {
            const top = baseY - (i + 1) * this.cellHeight;
            const bottom = top + this.cellHeight;
            if (point.x >= this.x + 8 && point.x <= this.x + this.width - 8 &&
                point.y >= top && point.y <= bottom) {
                return this.items.length - slots + i;
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
