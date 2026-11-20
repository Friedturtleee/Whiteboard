import { formatDataToken, parsePastedMatrixRows } from './DataTokens.js';

export const MATRIX_CLIPBOARD_TYPE = 'application/x-whiteboard-matrix+json';
const MAX_INPUT_LENGTH = 1_000_000;

export function encodeMatrixClipboard(element, cells) {
    const firstRow = Math.min(...cells.map(([row]) => row));
    const firstCol = Math.min(...cells.map(([, col]) => col));
    const rows = new Map();
    const entries = [];
    for (const [row, col] of cells) {
        const value = String(element.data[row][col] ?? '');
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(formatDataToken(value));
        entries.push([row - firstRow, col - firstCol, value === '\u3000' ? '' : value]);
    }
    return {
        text: [...rows.values()].map(row => row.join('\t')).join('\n'),
        structured: JSON.stringify({ version: 1, cells: entries })
    };
}

function decodeMatrixClipboard(raw) {
    if (!raw || raw.length > MAX_INPUT_LENGTH * 2) return null;
    try {
        const data = JSON.parse(raw);
        if (data?.version !== 1 || !Array.isArray(data.cells) || !data.cells.length || data.cells.length > 10000) return null;
        const coordinates = new Set();
        for (const cell of data.cells) {
            if (!Array.isArray(cell) || cell.length !== 3) return null;
            const [row, col, value] = cell;
            if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= 200 || col >= 200 ||
                typeof value !== 'string' || value.length > MAX_INPUT_LENGTH) return null;
            const key = `${row},${col}`;
            if (coordinates.has(key)) return null;
            coordinates.add(key);
        }
        return data.cells.slice().sort(([r1, c1], [r2, c2]) => r1 - r2 || c1 - c2);
    } catch { return null; }
}

/** Resolve the entire paste before changing any cell. */
export function planMatrixPaste(element, selectedCells, text, structured = '') {
    if (text.length > MAX_INPUT_LENGTH) return { error: '貼上資料不可超過 1 MB。' };
    let cells = selectedCells;
    const entries = decodeMatrixClipboard(structured);
    const rows = entries ? null : parsePastedMatrixRows(text);
    const valueCount = entries ? entries.length : rows.reduce((count, row) => count + row.length, 0);
    if (!valueCount) return { cells: [], values: [] };
    if (cells.length === 1 && valueCount > 1) {
        const [startRow, startCol] = cells[0];
        if (entries) {
            if (entries.some(([row, col]) => startRow + row >= element.rows || startCol + col >= element.cols)) {
                return { error: '貼上範圍超出矩陣，已保留原值。' };
            }
            cells = entries.map(([row, col]) => [startRow + row, startCol + col]);
        } else {
            if (rows.some(row => row.length !== rows[0].length)) {
                return { error: '每列資料數量不同，請先選取要貼上的格子。' };
            }
            if (startRow + rows.length > element.rows || startCol + rows[0].length > element.cols) {
                return { error: '貼上範圍超出矩陣，已保留原值。' };
            }
            cells = rows.flatMap((row, r) => row.map((_, c) => [startRow + r, startCol + c]));
        }
        if (cells.some(([row, col]) => row >= element.rows || col >= element.cols)) {
            return { error: '貼上範圍超出矩陣，已保留原值。' };
        }
    }
    if (valueCount !== 1 && valueCount !== cells.length) {
        return { error: `請貼上 1 個值，或剛好 ${cells.length} 個值。` };
    }
    return { cells, values: entries ? entries.map(([, , value]) => value) : rows.flat() };
}
