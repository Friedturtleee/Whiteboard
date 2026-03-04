/**
 * MatrixElement — 2D matrix visualization for competitive programming.
 */
import { Element } from '../core/Element.js';

export class MatrixElement extends Element {
    constructor(x = 0, y = 0) {
        super('matrix', x, y, 200, 160);
        this.rows = 3;
        this.cols = 3;
        this.cellSize = 42;
        this.data = [];           // 2D array
        this.highlights = {};     // { "r,c": color }
        this.fontSize = 14;
        this.label = 'Matrix';
        this.inputText = '';
        this._initData();
    }

    _initData() {
        this.data = [];
        for (let r = 0; r < this.rows; r++) {
            this.data[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.data[r][c] = 0;
            }
        }
        this._updateSize();
    }

    _updateSize() {
        this.width = this.cols * this.cellSize + 20;
        this.height = this.rows * this.cellSize + 20;
    }

    /**
     * Called when element is resized via handle. Recalculates cellSize from new dimensions.
     * Only allows SHRINKING — dragging outward is ignored.
     */
    onResize(newW, newH) {
        const newCellW = Math.floor((newW - 20) / this.cols);
        const newCellH = Math.floor((newH - 20) / this.rows);
        const proposed = Math.max(16, Math.min(newCellW, newCellH));
        // Only shrink, never grow beyond current cell size
        this.cellSize = Math.min(proposed, this.cellSize);
        // Re-snap the element size to grid
        this.width = this.cols * this.cellSize + 20;
        this.height = this.rows * this.cellSize + 20;
        // Scale font with cell size
        this.fontSize = Math.max(13, Math.min(18, Math.floor(this.cellSize * 0.35)));
    }

    setFromText(text) {
        this.inputText = text;

        // Support dimension format: "3*5" or "3x5" or "3 * 5" → creates empty matrix
        const dimMatch = text.trim().match(/^(\d+)\s*[*xX×]\s*(\d+)$/);
        if (dimMatch) {
            this.rows = parseInt(dimMatch[1]);
            this.cols = parseInt(dimMatch[2]);
            this.data = [];
            for (let r = 0; r < this.rows; r++) {
                this.data[r] = [];
                for (let c = 0; c < this.cols; c++) {
                    this.data[r][c] = 0;
                }
            }
            this._updateSize();
            return;
        }

        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        this.rows = lines.length;
        this.cols = 0;
        this.data = [];
        for (let r = 0; r < lines.length; r++) {
            const vals = lines[r].split(/[\s,]+/).map(v => v.trim());
            this.data[r] = vals;
            this.cols = Math.max(this.cols, vals.length);
        }
        // Pad shorter rows
        for (let r = 0; r < this.rows; r++) {
            while (this.data[r].length < this.cols) this.data[r].push('');
        }
        this._updateSize();
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, rows, cols, cellSize, rotation } = this;
        const pad = 10;

        ctx.save();
        if (rotation) {
            const cx = x + this.width / 2, cy = y + this.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            ctx.translate(-cx, -cy);
        }

        // Background
        ctx.fillStyle = 'rgba(30,30,30,0.8)';
        ctx.fillRect(x, y, this.width, this.height);

        // Grid & cells
        ctx.font = `${this.fontSize}px Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cx = x + pad + c * cellSize;
                const cy = y + pad + r * cellSize;

                // Highlight
                const hkey = `${r},${c}`;
                if (this.highlights[hkey]) {
                    ctx.fillStyle = this.highlights[hkey];
                    ctx.fillRect(cx, cy, cellSize, cellSize);
                }

                // Cell border
                ctx.strokeStyle = this.getEffectiveColor(this.color);
                ctx.lineWidth = 1;
                ctx.globalAlpha = this.opacity * 0.4;
                ctx.strokeRect(cx, cy, cellSize, cellSize);
                ctx.globalAlpha = this.opacity;

                // Value
                const val = this.data[r]?.[c] ?? '';
                ctx.fillStyle = this.getEffectiveColor(this.color);
                ctx.fillText(String(val), cx + cellSize / 2, cy + cellSize / 2, cellSize - 4);
            }
        }

        // Brackets
        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.lineWidth = 2;
        const bx = x + pad - 4;
        const by = y + pad - 4;
        const bw = cols * cellSize + 8;
        const bh = rows * cellSize + 8;
        // Left bracket
        ctx.beginPath();
        ctx.moveTo(bx + 6, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + 6, by + bh);
        ctx.stroke();
        // Right bracket
        ctx.beginPath();
        ctx.moveTo(bx + bw - 6, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - 6, by + bh);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Hit test: returns { row, col } if (wx, wy) is inside a cell, or null.
     */
    hitTestCell(wx, wy) {
        const pad = 10;
        const localX = wx - this.x - pad;
        const localY = wy - this.y - pad;
        if (localX < 0 || localY < 0) return null;
        const col = Math.floor(localX / this.cellSize);
        const row = Math.floor(localY / this.cellSize);
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            return { row, col };
        }
        return null;
    }

    serialize() {
        return {
            ...super.serialize(),
            rows: this.rows, cols: this.cols,
            cellSize: this.cellSize, data: this.data,
            highlights: this.highlights, fontSize: this.fontSize,
            inputText: this.inputText
        };
    }

    static fromData(data) {
        const el = new MatrixElement(data.x, data.y);
        return el;
    }
}
