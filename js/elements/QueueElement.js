/**
 * QueueElement — FIFO queue visualization.
 */
import { Element } from '../core/Element.js';
import { splitDataTokens } from '../core/DataTokens.js';

const EMPTY_CELL = '\u3000';
const isEmptyCell = value => value == null || value === '' || value === EMPTY_CELL;
const MAX_ITEMS = 10000;

export class QueueElement extends Element {
    constructor(x = 0, y = 0) {
        super('queue', x, y, 300, 60);
        this.items = [];
        this.cellWidth = 44;       // square: matches cell height (height - 16 = 44)
        this.fontSize = 14;
        this.maxDisplay = 10;
        this.label = 'Queue';
        this.inputText = '';
        this.highlights = {};      // { displayIndex: color }
        this.selectedIndices = new Set(); // item indices for cell selection
        this._hoverEdge = null;           // 'left' | null
        this._lastItemIdx = -1;           // for shift-range select
    }

    enqueue(val) {
        if (this.items.length >= MAX_ITEMS) return false;
        this.items.push(val);
        this._updateSize();
        this.updateTextFromData();
        return true;
    }

    dequeue() {
        if (this.items.length === 0) return undefined;
        const v = this.items.shift();
        const nextHighlights = {};
        for (const [key, color] of Object.entries(this.highlights)) {
            const index = Number(key);
            if (Number.isInteger(index) && index > 0 && index < this.items.length + 1) {
                nextHighlights[index - 1] = color;
            }
        }
        this.highlights = nextHighlights;
        this.selectedIndices = new Set([...this.selectedIndices]
            .filter(index => Number.isInteger(index) && index > 0)
            .map(index => index - 1));
        this._lastItemIdx = this._lastItemIdx > 0 ? this._lastItemIdx - 1 : -1;
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
        this.selectedIndices.clear();
        this._lastItemIdx = -1;
        this._updateSize();
        return null;
    }

    updateTextFromData() {
        this.inputText = this.items.map(v => isEmptyCell(v) ? EMPTY_CELL : v).join(' ');
    }

    _updateSize() {
        const count = Math.max(1, Math.min(this.items.length, this.maxDisplay));
        this.height = this.cellWidth + 16;
        this.width = count * this.cellWidth + 16;
        this.fontSize = Math.max(10, Math.floor(this.cellWidth * 0.35));
    }

    /**
     * Snapshot state before resize drag begins.
     */
    onResizeStart() {
        this._origCellWidth = this.cellWidth;
        this._origResizeW = this.width;
        this._origResizeH = this.height;
    }

    captureResizeState() {
        return { cellWidth: this.cellWidth, fontSize: this.fontSize };
    }

    restoreResizeState(state) {
        if (!state) return;
        this.cellWidth = state.cellWidth;
        this.fontSize = state.fontSize;
    }

    /**
     * Called when element is resized via handle. Adjusts cell proportions.
     */
    onResize(newW, newH) {
        const count = Math.max(1, Math.min(this.items.length, this.maxDisplay));
        const newCellW = Math.floor((newW - 16) / count);
        const newCellH = Math.floor(newH - 16);
        this.cellWidth = Math.max(20, Math.min(newCellW, newCellH));
        this._updateSize();
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, height: h, rotation, items, cellWidth } = this;

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
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displayItems = items.slice(0, this.maxDisplay);
        const startX = x + 8; // 8px left padding

        // Adaptive font size
        const maxLen = Math.max(1, ...displayItems.map(v => String(v).length));
        const cellInnerW = cellWidth - 6;
        const cellInnerH = h - 16;
        const fontByWidth = cellInnerW / (maxLen * 0.6);
        const fontByHeight = cellInnerH * 0.5;
        const adaptiveFontSize = Math.max(8, Math.min(fontByWidth, fontByHeight, 36));
        ctx.font = `${adaptiveFontSize}px Consolas, monospace`;

        const slotsToDraw = Math.max(1, displayItems.length);
        for (let i = 0; i < slotsToDraw; i++) {
            const cx = startX + i * cellWidth + cellWidth / 2;
            const cy = y + h / 2;

            // Highlight background (user-defined colour)
            if (this.highlights[i]) {
                ctx.fillStyle = this.highlights[i];
                ctx.globalAlpha = this.opacity;
                ctx.fillRect(startX + i * cellWidth, y + 8, cellWidth, cellWidth);
            }

            // Cell border
            ctx.strokeStyle = this.getEffectiveColor(this.color);
            ctx.lineWidth = 1;
            ctx.globalAlpha = this.opacity * 0.3;
            ctx.strokeRect(startX + i * cellWidth, y + 8, cellWidth, cellWidth);
            ctx.globalAlpha = this.opacity;

            // Value (skip rendering the full-width space placeholder)
            if (i < displayItems.length && !isEmptyCell(displayItems[i])) {
                ctx.fillStyle = this.getEffectiveColor(this.color);
                ctx.fillText(String(displayItems[i]), cx, cy, cellInnerW);
            }

            // Cell selection highlight
            if (this.selectedIndices.has(i)) {
                ctx.strokeStyle = '#56b3e6';
                ctx.lineWidth = 2.5;
                ctx.globalAlpha = this.opacity;
                ctx.strokeRect(startX + i * cellWidth + 1.5, y + 8 + 1.5, cellWidth - 3, cellWidth - 3);
            }
        }

        // Direction arrow
        ctx.strokeStyle = this.getEffectiveColor('#808080');
        ctx.lineWidth = 1.5;
        const arrowY = y + h + 10;
        const contentW = slotsToDraw * cellWidth;
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

    hitTestItem(wx, wy) {
        const point = this.toLocalPoint(wx, wy);
        const slots = Math.max(1, Math.min(this.items.length, this.maxDisplay));
        for (let i = 0; i < slots; i++) {
            if (point.x >= this.x + 8 + i * this.cellWidth &&
                point.x <= this.x + 8 + (i + 1) * this.cellWidth &&
                point.y >= this.y + 8 && point.y <= this.y + this.height - 8) {
                return i;
            }
        }
        return -1;
    }

    serialize() {
        return {
            ...super.serialize(),
            items: this.items, cellWidth: this.cellWidth,
            fontSize: this.fontSize, maxDisplay: this.maxDisplay,
            inputText: this.inputText, highlights: this.highlights
        };
    }

    static fromData(data) {
        const el = new QueueElement(data.x, data.y);
        return el;
    }
}
