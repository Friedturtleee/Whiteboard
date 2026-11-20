/**
 * MatrixElement — 2D matrix visualization for competitive programming.
 */
import { Element } from '../core/Element.js';
import { formatDataToken, splitDataTokens, parsePastedMatrixRows, isTabularMatrixInput } from '../core/DataTokens.js?v=2';
import { drawCanvasCellText } from '../core/CanvasTextFit.js';
import { getLocalViewport } from '../canvas/Viewport.js';

const EMPTY_CELL = '\u3000';
const isEmptyCell = value => value == null || value === '' || value === EMPTY_CELL;
const NUMERIC_TOKEN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const MAX_MATRIX_ROWS = 200;
const MAX_MATRIX_COLS = 200;
const MAX_MATRIX_CELLS = 10000;
const MAX_MATRIX_INPUT_LENGTH = 1000000;
const graphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function splitCharacters(value) {
    return graphemeSegmenter
        ? Array.from(graphemeSegmenter.segment(value), item => item.segment)
        : Array.from(value);
}

function formatMatrixCell(value, singleColumn) {
    const token = formatDataToken(value);
    const text = String(value ?? '');
    // A one-cell row is otherwise ambiguous with a compact character grid.
    return singleColumn && text.length > 1 && !/^\d+$/.test(text) && token === text
        ? JSON.stringify(text)
        : token;
}

function remapGridKeys(keys, axis, at, action) {
    const next = new Set();
    for (const key of keys || []) {
        let [row, col] = String(key).split(',').map(Number);
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) continue;
        const coordinate = axis === 'row' ? row : col;
        if (action === 'delete' && coordinate === at) continue;
        if (coordinate >= at) {
            if (axis === 'row') row += action === 'insert' ? 1 : -1;
            else col += action === 'insert' ? 1 : -1;
        }
        next.add(row + ',' + col);
    }
    return next;
}

function remapGridHighlights(highlights, axis, at, action) {
    const next = {};
    for (const [key, color] of Object.entries(highlights || {})) {
        let [row, col] = key.split(',').map(Number);
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) continue;
        const coordinate = axis === 'row' ? row : col;
        if (action === 'delete' && coordinate === at) continue;
        if (coordinate >= at) {
            if (axis === 'row') row += action === 'insert' ? 1 : -1;
            else col += action === 'insert' ? 1 : -1;
        }
        next[row + ',' + col] = color;
    }
    return next;
}

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
        this.selectedCells = new Set(); // "r,c" keys for cell selection
        this._hoverEdge = null;         // 'right' | 'bottom' | null
        this._lastCellKey = null;       // for shift-range select
        this._activeCellKey = null;     // keyboard cursor within a selected range
        this._initData();
    }

    _initData() {
        this.data = [];
        for (let r = 0; r < this.rows; r++) {
            this.data[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.data[r][c] = '';
            }
        }
        this._updateSize();
    }

    _updateSize() {
        this.width = this.cols * this.cellSize + 20;
        this.height = this.rows * this.cellSize + 20;
    }

    /**
     * Snapshot state before resize drag begins.
     */
    onResizeStart() {
        this._origCellSize = this.cellSize;
        this._origResizeW = this.width;
        this._origResizeH = this.height;
    }

    captureResizeState() {
        return { cellSize: this.cellSize, fontSize: this.fontSize };
    }

    restoreResizeState(state) {
        if (!state) return;
        this.cellSize = state.cellSize;
        this.fontSize = state.fontSize;
    }

    /**
     * Called when element is resized via handle. Recalculates cellSize from new dimensions.
     */
    onResize(newW, newH) {
        // An empty matrix has no cell grid to scale. Keep its cell size stable
        // while allowing the outer placeholder bounds to be resized.
        if (this.rows <= 0 || this.cols <= 0) return;
        const newCellW = Math.floor((newW - 20) / this.cols);
        const newCellH = Math.floor((newH - 20) / this.rows);
        this.cellSize = Math.max(16, Math.min(newCellW, newCellH));
        // Re-snap the element size to grid
        this.width  = this.cols * this.cellSize + 20;
        this.height = this.rows * this.cellSize + 20;
        // Scale font with cell size
        this.fontSize = Math.max(9, Math.min(18, Math.floor(this.cellSize * 0.35)));
    }

    // ── Row / Col insertion & deletion ──────────────────

    _remapCellFocus(axis, at, action) {
        for (const property of ['_lastCellKey', '_activeCellKey']) {
            if (this[property]) this[property] = remapGridKeys(new Set([this[property]]), axis, at, action).values().next().value || null;
        }
    }

    insertRow(afterRow) {
        if (this.rows < 1 || this.cols < 1 ||
            this.rows >= MAX_MATRIX_ROWS || (this.rows + 1) * this.cols > MAX_MATRIX_CELLS) {
            return false;
        }
        const index = Number.isInteger(afterRow) ? afterRow : -1;
        const at = index < 0 ? this.rows : Math.min(this.rows, index + 1);
        const newRow = new Array(this.cols).fill('');
        this.data.splice(at, 0, newRow);
        this.rows++;
        this.selectedCells = remapGridKeys(this.selectedCells, 'row', at, 'insert');
        this._remapCellFocus('row', at, 'insert');
        this.highlights = remapGridHighlights(this.highlights, 'row', at, 'insert');
        this._updateSize();
        this.updateTextFromData();
        return true;
    }

    deleteRow(row) {
        if (!Number.isInteger(row) || row < 0 || row >= this.rows || this.rows <= 1) return;
        this.data.splice(row, 1);
        this.rows--;
        // Remap selected cells
        const next = new Set();
        for (const k of this.selectedCells) {
            const [r, c] = k.split(',').map(Number);
            if (r < row) next.add(k);
            else if (r > row) next.add(`${r - 1},${c}`);
        }
        this.selectedCells = next;
        this._remapCellFocus('row', row, 'delete');
        this.highlights = remapGridHighlights(this.highlights, 'row', row, 'delete');
        this._updateSize();
        this.updateTextFromData();
    }

    insertCol(afterCol) {
        if (this.rows < 1 || this.cols < 1 ||
            this.cols >= MAX_MATRIX_COLS || this.rows * (this.cols + 1) > MAX_MATRIX_CELLS) {
            return false;
        }
        const index = Number.isInteger(afterCol) ? afterCol : -1;
        const at = index < 0 ? this.cols : Math.min(this.cols, index + 1);
        for (const row of this.data) row.splice(at, 0, '');
        this.cols++;
        this.selectedCells = remapGridKeys(this.selectedCells, 'col', at, 'insert');
        this._remapCellFocus('col', at, 'insert');
        this.highlights = remapGridHighlights(this.highlights, 'col', at, 'insert');
        this._updateSize();
        this.updateTextFromData();
        return true;
    }

    deleteCol(col) {
        if (!Number.isInteger(col) || col < 0 || col >= this.cols || this.cols <= 1) return;
        for (const row of this.data) row.splice(col, 1);
        this.cols--;
        const next = new Set();
        for (const k of this.selectedCells) {
            const [r, c] = k.split(',').map(Number);
            if (c < col) next.add(k);
            else if (c > col) next.add(`${r},${c - 1}`);
        }
        this.selectedCells = next;
        this._remapCellFocus('col', col, 'delete');
        this.highlights = remapGridHighlights(this.highlights, 'col', col, 'delete');
        this._updateSize();
        this.updateTextFromData();
    }

    setFromText(text) {
        const rawText = String(text ?? '');
        if (rawText.length > MAX_MATRIX_INPUT_LENGTH) {
            return '矩陣資料不得超過 1 MB。';
        }
        // Support dimension format: "3*5" or "3x5" or "3 * 5" → creates empty matrix
        const dimMatch = rawText.trim().match(/^(\d+)\s*[*xX×]\s*(\d+)$/);
        if (dimMatch) {
            const rows = Number(dimMatch[1]);
            const cols = Number(dimMatch[2]);
            if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) ||
                rows < 1 || cols < 1 || rows > MAX_MATRIX_ROWS || cols > MAX_MATRIX_COLS ||
                rows * cols > MAX_MATRIX_CELLS) {
                return '矩陣上限為 200 × 200，最多 10,000 格。';
            }
            const data = Array.from({ length: rows }, () => new Array(cols).fill(''));
            this.inputText = rawText;
            this.selectedCells.clear();
            this._lastCellKey = this._activeCellKey = null;
            this.highlights = {};
            this.rows = rows;
            this.cols = cols;
            this.data = data;
            this._updateSize();
            return null;
        }

        // A single grapheme fills the current grid; tabs keep their table meaning.
        const singleValues = splitDataTokens(rawText, { multiline: true });
        const singleValue = singleValues[0];
        const isSingleCharacter = singleValues.length === 1 &&
            (singleValue === ''
                ? rawText === EMPTY_CELL
                : splitCharacters(singleValue).length === 1);
        if (this.rows > 0 && this.cols > 0 &&
            !rawText.includes('\t') && isSingleCharacter) {
            const value = singleValue === '' ? '' : singleValue;
            const tokenLength = formatMatrixCell(value, this.cols === 1).length;
            const expandedLength = this.rows * (this.cols * tokenLength + this.cols - 1) + this.rows - 1;
            if (expandedLength > MAX_MATRIX_INPUT_LENGTH) {
                return '套用後資料不得超過 1 MB。';
            }

            this.inputText = rawText;
            this.selectedCells.clear();
            this._lastCellKey = null;
            this.highlights = {};
            this.data = Array.from(
                { length: this.rows },
                () => new Array(this.cols).fill(value)
            );
            this._updateSize();
            return null;
        }

        // Keep tabs because they separate spreadsheet cells, including empty ones.
        // U+3000 is also an intentional empty-cell marker.
        const tabular = isTabularMatrixInput(rawText);
        const lines = tabular
            ? parsePastedMatrixRows(rawText)
            : rawText.replace(/\r/g, '').split('\n').filter(line => !/^ *$/.test(line));

        if (lines.length === 0) {
            this.inputText = rawText;
            this.selectedCells.clear();
            this._lastCellKey = this._activeCellKey = null;
            this.highlights = {};
            this.rows = 0;
            this.cols = 0;
            this.data = [];
            this.width = 0;
            this.height = 0;
            return null;
        }

        if (lines.length > MAX_MATRIX_ROWS) {
            return '矩陣最多支援 200 列。';
        }
        let cols = 0;
        const data = [];
        // Combined input rules, evaluated in this order (the dimension form
        // "RxC" and the single-character fill are handled earlier):
        //  1. Tabular input (tabs, or quoted cells containing physical
        //     newlines) keeps every cell exactly as parsed, including empty
        //     cells, and is NEVER split into characters.
        //  2. Otherwise each non-blank line is tokenised on whitespace/commas.
        //  3. CP character grid ("#..#" / "abc" rows): a line is split into
        //     characters only when EVERY line is a single, unquoted,
        //     non-numeric token and at least one has more than one grapheme.
        //     Requiring the whole input to qualify keeps a single column of
        //     numbers ("-5", "3.14", "10") or mixed words intact, while still
        //     splitting "#..#" over ".##." and one-line "AB". getTextFromData quotes
        //     multi-character one-cell rows so edited columns round-trip.
        const tokenRows = tabular ? lines : lines.map(line => splitDataTokens(line));
        const isCharGrid = !tabular && tokenRows.every((vals, index) =>
            vals.length === 1 && !/^\s*"/.test(lines[index]) && !NUMERIC_TOKEN.test(vals[0])) &&
            tokenRows.some(vals => splitCharacters(vals[0]).length > 1);
        for (let r = 0; r < lines.length; r++) {
            let vals = tokenRows[r];
            if (isCharGrid) vals = splitCharacters(vals[0]);
            if (vals.length > MAX_MATRIX_COLS) {
                return '矩陣最多支援 200 欄。';
            }
            data[r] = vals;
            cols = Math.max(cols, vals.length);
            if ((r + 1) * cols > MAX_MATRIX_CELLS) {
                return '矩陣最多 10,000 格。';
            }
        }
        // Pad shorter rows
        for (let r = 0; r < data.length; r++) {
            while (data[r].length < cols) data[r].push('');
        }
        this.inputText = rawText;
        this.selectedCells.clear();
        this._lastCellKey = this._activeCellKey = null;
        this.highlights = {};
        this.rows = data.length;
        this.cols = cols;
        this.data = data;
        this._updateSize();
        return null;
    }

    getTextFromData(data = this.data) {
        return data.map(row => row.map(value => formatMatrixCell(value, row.length === 1))
            .join(' ')).join('\n');
    }

    updateTextFromData() {
        this.inputText = this.getTextFromData();
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
        const snappedTextAngle = Math.abs(Math.sin(rotation)) > Math.abs(Math.cos(rotation))
            ? Math.PI / 2
            : 0;

        const viewport = getLocalViewport(ctx, Math.max(4, cellSize / 4));
        const firstRow = viewport ? Math.max(0, Math.floor((viewport.minY - y - pad) / cellSize)) : 0;
        const lastRow = viewport ? Math.min(rows, Math.ceil((viewport.maxY - y - pad) / cellSize)) : rows;
        const firstCol = viewport ? Math.max(0, Math.floor((viewport.minX - x - pad) / cellSize)) : 0;
        const lastCol = viewport ? Math.min(cols, Math.ceil((viewport.maxX - x - pad) / cellSize)) : cols;
        const color = this.getEffectiveColor(this.color);
        for (let r = firstRow; r < lastRow; r++) {
            for (let c = firstCol; c < lastCol; c++) {
                const cx = x + pad + c * cellSize;
                const cy = y + pad + r * cellSize;
                const hkey = `${r},${c}`;

                // Highlight (user-defined colour)
                if (this.highlights[hkey]) {
                    ctx.fillStyle = this.highlights[hkey];
                    ctx.globalAlpha = this.opacity;
                    ctx.fillRect(cx, cy, cellSize, cellSize);
                }

                // Cell border
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.globalAlpha = this.opacity * 0.4;
                ctx.strokeRect(cx, cy, cellSize, cellSize);
                ctx.globalAlpha = this.opacity;

                // Value (do not render placeholders)
                const val = this.data[r]?.[c] ?? '';
                if (!isEmptyCell(val)) {
                    ctx.fillStyle = color;
                    ctx.save();
                    const text = String(val);
                    ctx.translate(cx + cellSize / 2, cy + cellSize / 2);
                    ctx.rotate(snappedTextAngle - rotation);
                    drawCanvasCellText(ctx, text, this.fontSize, cellSize - 8, cellSize - 8, 0, 0);
                    ctx.restore();
                }

                // Cell selection highlight
                if (this.selectedCells.has(hkey)) {
                    ctx.strokeStyle = this._activeCellKey === hkey ? '#a6ddff' : '#56b3e6';
                    ctx.lineWidth = this._activeCellKey === hkey ? 3 : 2.5;
                    ctx.globalAlpha = this.opacity;
                    ctx.strokeRect(cx + 1.5, cy + 1.5, cellSize - 3, cellSize - 3);
                }
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
        if (this.rows <= 0 || this.cols <= 0 || !Number.isFinite(this.cellSize) || this.cellSize <= 0) {
            return null;
        }
        const point = this.toLocalPoint(wx, wy);
        const pad = 10;
        const localX = point.x - this.x - pad;
        const localY = point.y - this.y - pad;
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
