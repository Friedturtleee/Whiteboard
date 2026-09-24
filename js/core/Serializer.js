/**
 * Serializer — JSON export/import and PNG export.
 */
import { ShapeElement } from '../elements/ShapeElement.js';
import { TextElement } from '../elements/TextElement.js';
import { MatrixElement } from '../elements/MatrixElement.js';
import { StackElement } from '../elements/StackElement.js';
import { QueueElement } from '../elements/QueueElement.js';
import { PenElement } from '../elements/PenElement.js';
import { MermaidElement } from '../elements/MermaidElement.js';
import { MarkdownElement } from '../elements/MarkdownElement.js';
import { TreeElement } from '../tree/TreeElement.js';
import { GraphElement } from '../graph/GraphElement.js';
import { validateWhiteboardElement } from './WhiteboardElementValidation.js';

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMPORTED_ELEMENTS = 10000;
const MAX_IMPORTED_PEN_POINTS = 100000;
const MAX_IMPORTED_TEXT_LENGTH = 1_000_000;
const MAX_IMPORTED_SVG_LENGTH = 2_000_000;
const MAX_WORLD_COORDINATE = 100_000_000;
const MAX_ELEMENT_DIMENSION = 10_000_000;
const MAX_EXPORT_CANVAS_DIMENSION = 16384;
const MAX_EXPORT_CANVAS_PIXELS = 16_000_000;
const MIN_CAMERA_ZOOM = 0.45;
const MAX_CAMERA_ZOOM = 10;

function isSafeDisplayValue(value) {
    return value === null || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= MAX_IMPORTED_TEXT_LENGTH);
}

function isValidGraphId(value) {
    return (typeof value === 'string' && value.length > 0 && value.length <= 128) ||
        (typeof value === 'number' && Number.isSafeInteger(value));
}

function isValidHighlightMap(value, keyPattern = /^[\w,-]{1,32}$/) {
    if (value === undefined) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length <= 10000 && entries.every(([key, color]) =>
        keyPattern.test(key) && typeof color === 'string' && color.length <= 256);
}

function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob)) return false;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    // Give the browser time to start the download before releasing its object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}

const TYPE_MAP = {
    rectangle: ShapeElement,
    circle: ShapeElement,
    ellipse: ShapeElement,
    line: ShapeElement,
    arrow: ShapeElement,
    text: TextElement,
    matrix: MatrixElement,
    stack: StackElement,
    queue: QueueElement,
    pen: PenElement,
    mermaid: MermaidElement,
    markdown: MarkdownElement,
    tree: TreeElement,
    graph: GraphElement,
};

export class Serializer {
    static exportJSON(app) {
        const data = {
            version: 1,
            elements: app.elements.map(el => el.serialize()),
            camera: { x: app.camera.x, y: app.camera.y, zoom: app.camera.zoom }
        };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        downloadBlob(blob, `whiteboard-${Date.now()}.json`);
    }

    static importJSON(app, file) {
        return new Promise((resolve, reject) => {
            if (!file || !Number.isFinite(file.size) || file.size > MAX_IMPORT_FILE_BYTES) {
                reject(new TypeError('Whiteboard file is missing or exceeds the 25 MB import limit.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    Serializer.loadJSONData(app, data);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /** Validate and build an import off-canvas before replacing the current board. */
    static loadJSONData(app, data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) {
            throw new TypeError('Whiteboard file must contain an elements array.');
        }
        if (data.elements.length > MAX_IMPORTED_ELEMENTS) {
            throw new TypeError('Whiteboard file exceeds the 10000-element import limit.');
        }

        const importedElements = [];
        const elementIds = new Set();
        for (const ed of data.elements) {
            if (!ed || typeof ed !== 'object' || Array.isArray(ed) || typeof ed.type !== 'string') {
                throw new TypeError('Whiteboard file contains an invalid element record.');
            }
            validateWhiteboardElement(ed);
            if (!Object.prototype.hasOwnProperty.call(TYPE_MAP, ed.type)) {
                throw new TypeError('Unsupported whiteboard element type: ' + ed.type);
            }
            if (![ed.x, ed.y, ed.width, ed.height].every(Number.isFinite)) {
                throw new TypeError('Whiteboard element has invalid bounds.');
            }
            const signedLineBounds = ed.type === 'line' || ed.type === 'arrow';
            if (Math.abs(ed.x) > MAX_WORLD_COORDINATE || Math.abs(ed.y) > MAX_WORLD_COORDINATE ||
                Math.abs(ed.x + ed.width) > MAX_WORLD_COORDINATE ||
                Math.abs(ed.y + ed.height) > MAX_WORLD_COORDINATE ||
                (!signedLineBounds && (ed.width < 0 || ed.height < 0)) ||
                Math.abs(ed.width) > MAX_ELEMENT_DIMENSION || Math.abs(ed.height) > MAX_ELEMENT_DIMENSION) {
                throw new TypeError('Whiteboard element bounds are outside the supported range.');
            }
            for (const field of ['rotation', 'opacity', 'saturation', 'strokeWidth', 'zIndex']) {
                if (ed[field] !== undefined && !Number.isFinite(ed[field])) {
                    throw new TypeError('Whiteboard element contains invalid style values.');
                }
            }
            if ((ed.opacity !== undefined && (ed.opacity < 0 || ed.opacity > 1)) ||
                (ed.saturation !== undefined && (ed.saturation < 0 || ed.saturation > 1)) ||
                (ed.strokeWidth !== undefined && (ed.strokeWidth < 0 || ed.strokeWidth > 10000)) ||
                ['color', 'fillColor'].some(field => ed[field] !== undefined &&
                    (typeof ed[field] !== 'string' || ed[field].length > 256)) ||
                (ed.label !== undefined && (typeof ed.label !== 'string' || ed.label.length > 1024)) ||
                ['hidden', 'locked'].some(field => ed[field] !== undefined && typeof ed[field] !== 'boolean')) {
                throw new TypeError('Whiteboard element contains invalid style values.');
            }
            if (ed.id !== undefined) {
                // Shape and format are already checked by the shared validator;
                // this set enforces the document-wide uniqueness constraint.
                if (elementIds.has(ed.id)) throw new TypeError('Whiteboard file contains a duplicate element ID.');
                elementIds.add(ed.id);
            }

            if (['rectangle', 'circle', 'ellipse', 'line', 'arrow'].includes(ed.type)) {
                const validConnection = connection => connection === null ||
                    Boolean(connection && typeof connection === 'object' && !Array.isArray(connection) &&
                        typeof connection.elementId === 'string' && typeof connection.portId === 'string');
                if ((ed.shapeType !== undefined && ed.shapeType !== ed.type) ||
                    (ed.drawStyle !== undefined && !['stroke', 'fill', 'dashed'].includes(ed.drawStyle)) ||
                    (ed.connections !== undefined && (!ed.connections || typeof ed.connections !== 'object' ||
                        Array.isArray(ed.connections) || !validConnection(ed.connections.p1) ||
                        !validConnection(ed.connections.p2)))) {
                    throw new TypeError('Shape element contains invalid shape or connection data.');
                }
            } else if (ed.type === 'matrix') {
                const { rows, cols, data: cells } = ed;
                if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) ||
                    rows < 0 || cols < 0 || rows > 200 || cols > 200 || rows * cols > 10000 ||
                    ((rows === 0) !== (cols === 0)) ||
                    !Array.isArray(cells) || cells.length !== rows ||
                    cells.some(row => !Array.isArray(row) || row.length !== cols ||
                        row.some(value => !isSafeDisplayValue(value))) ||
                    (ed.inputText !== undefined &&
                        (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
                    (ed.cellSize !== undefined && (!Number.isFinite(ed.cellSize) || ed.cellSize <= 0 || ed.cellSize > 10000)) ||
                    (ed.fontSize !== undefined && (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
                    !isValidHighlightMap(ed.highlights, /^\d+,\d+$/)) {
                    throw new TypeError('Matrix element has invalid dimensions or cell data.');
                }
            } else if (ed.type === 'queue' || ed.type === 'stack') {
                if (!Array.isArray(ed.items) || ed.items.length > 10000 ||
                    ed.items.some(value => !isSafeDisplayValue(value)) ||
                    (ed.inputText !== undefined &&
                        (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
                    (ed.type === 'queue' && ed.cellWidth !== undefined &&
                        (!Number.isFinite(ed.cellWidth) || ed.cellWidth <= 0 || ed.cellWidth > 10000)) ||
                    (ed.type === 'stack' && ed.cellHeight !== undefined &&
                        (!Number.isFinite(ed.cellHeight) || ed.cellHeight <= 0 || ed.cellHeight > 10000)) ||
                    (ed.fontSize !== undefined && (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
                    (ed.maxDisplay !== undefined && (!Number.isSafeInteger(ed.maxDisplay) || ed.maxDisplay < 1 || ed.maxDisplay > 100)) ||
                    !isValidHighlightMap(ed.highlights)) {
                    throw new TypeError('Array element has invalid or oversized item data.');
                }
            } else if (ed.type === 'pen') {
                if (!Array.isArray(ed.points) || ed.points.length > MAX_IMPORTED_PEN_POINTS || ed.points.some(point =>
                    !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
                    Math.abs(point.x) > MAX_WORLD_COORDINATE || Math.abs(point.y) > MAX_WORLD_COORDINATE)) {
                    throw new TypeError('Pen element contains invalid point data or exceeds the supported point limit.');
                }
                if (ed.points.length) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const point of ed.points) {
                        minX = Math.min(minX, point.x);
                        minY = Math.min(minY, point.y);
                        maxX = Math.max(maxX, point.x);
                        maxY = Math.max(maxY, point.y);
                    }
                    if (maxX - minX > MAX_ELEMENT_DIMENSION || maxY - minY > MAX_ELEMENT_DIMENSION) {
                        throw new TypeError('Pen element bounds are outside the supported range.');
                    }
                }
            } else if (ed.type === 'graph') {
                if (!Array.isArray(ed.graphNodes) || ed.graphNodes.length > 500 ||
                    !Array.isArray(ed.edges) || ed.edges.length > 100000 ||
                    (ed.inputText !== undefined &&
                        (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
                    (ed.directed !== undefined && typeof ed.directed !== 'boolean') ||
                    (ed.zeroBased !== undefined && typeof ed.zeroBased !== 'boolean') ||
                    (ed.graphMode !== undefined && !['edge-list', 'adj-list'].includes(ed.graphMode)) ||
                    (ed.nodeRadius !== undefined &&
                        (!Number.isFinite(ed.nodeRadius) || ed.nodeRadius <= 0 || ed.nodeRadius > 10000)) ||
                    (ed._nextNodeId !== undefined &&
                        (!Number.isSafeInteger(ed._nextNodeId) || ed._nextNodeId < 1))) {
                    throw new TypeError('Graph element has invalid or oversized node/edge data.');
                }
                const nodeIds = new Set();
                for (const node of ed.graphNodes) {
                    if (!node || !isValidGraphId(node.id) ||
                        !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
                        Math.abs(node.x) > MAX_WORLD_COORDINATE || Math.abs(node.y) > MAX_WORLD_COORDINATE ||
                        (node.label !== undefined && !isSafeDisplayValue(node.label)) ||
                        (node.nodeWeight !== undefined && node.nodeWeight !== null &&
                            !isSafeDisplayValue(node.nodeWeight)) || nodeIds.has(String(node.id))) {
                        throw new TypeError('Graph element contains an invalid node.');
                    }
                    nodeIds.add(String(node.id));
                }
                for (const edge of ed.edges) {
                    if (!edge || !isValidGraphId(edge.u) || !isValidGraphId(edge.v) ||
                        !nodeIds.has(String(edge.u)) || !nodeIds.has(String(edge.v)) ||
                        (edge.w !== undefined && !isSafeDisplayValue(edge.w)) ||
                        (edge.directed !== undefined && typeof edge.directed !== 'boolean')) {
                        throw new TypeError('Graph element contains an edge with an unknown endpoint.');
                    }
                }
            } else if (ed.type === 'tree') {
                if (typeof ed.inputText !== 'string' || ed.inputText.length > MAX_IMPORTED_TEXT_LENGTH ||
                    (ed.treeType !== undefined &&
                        !['tree', 'binary', 'bst', 'avl', 'rb', 'red-black', 'euler'].includes(ed.treeType)) ||
                    (ed.nodeRadius !== undefined &&
                        (!Number.isFinite(ed.nodeRadius) || ed.nodeRadius <= 0 || ed.nodeRadius > 10000)) ||
                    (ed.hasWeights !== undefined && typeof ed.hasWeights !== 'boolean') ||
                    ['_relOffsetX', '_relOffsetY'].some(field => ed[field] !== undefined &&
                        !Number.isFinite(ed[field]))) {
                    throw new TypeError('Tree element has invalid or oversized source data.');
                }
            } else if (ed.type === 'text') {
                if ((ed.text !== undefined &&
                        (typeof ed.text !== 'string' || ed.text.length > MAX_IMPORTED_TEXT_LENGTH)) ||
                    (ed.fontSize !== undefined &&
                        (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
                    (ed.fontFamily !== undefined &&
                        (typeof ed.fontFamily !== 'string' || ed.fontFamily.length > 256)) ||
                    (ed.textAlign !== undefined && !['left', 'center', 'right'].includes(ed.textAlign)) ||
                    ['isBold', 'isItalic', 'isUnderline'].some(field =>
                        ed[field] !== undefined && typeof ed[field] !== 'boolean') ||
                    ['baseWidth', 'baseHeight', '_baseWidth', '_baseHeight'].some(field =>
                        ed[field] !== undefined && (!Number.isFinite(ed[field]) || ed[field] <= 0))) {
                    throw new TypeError('Text element contains invalid or oversized text/style data.');
                }
            } else if (ed.type === 'markdown' &&
                ((ed.markdownText !== undefined &&
                    (typeof ed.markdownText !== 'string' || ed.markdownText.length > MAX_IMPORTED_TEXT_LENGTH)) ||
                    (ed.fontSize !== undefined &&
                        (!Number.isFinite(ed.fontSize) || ed.fontSize <= 0 || ed.fontSize > 500)) ||
                    (ed.renderWidth !== undefined &&
                        (!Number.isFinite(ed.renderWidth) || ed.renderWidth <= 0 || ed.renderWidth > 10000)))) {
                throw new TypeError('Markdown element contains invalid or oversized source/style data.');
            } else if (ed.type === 'mermaid' && ed.svgString !== undefined &&
                (typeof ed.svgString !== 'string' || ed.svgString.length > MAX_IMPORTED_SVG_LENGTH)) {
                throw new TypeError('Mermaid element contains invalid or oversized SVG data.');
            }

            const Cls = TYPE_MAP[ed.type];
            const el = Cls.fromData ? Cls.fromData(ed) : new Cls();
            el.deserialize(ed);
            importedElements.push(el);
        }

        const camera = data.camera;
        if (camera != null && (typeof camera !== 'object' ||
            ![camera.x, camera.y, camera.zoom].every(Number.isFinite) ||
            Math.abs(camera.x) > MAX_WORLD_COORDINATE || Math.abs(camera.y) > MAX_WORLD_COORDINATE ||
            camera.zoom < MIN_CAMERA_ZOOM || camera.zoom > MAX_CAMERA_ZOOM)) {
            throw new TypeError('Whiteboard file contains invalid camera settings.');
        }

        const importedIds = new Set(importedElements.map(element => element.id));
        for (const element of importedElements) {
            if (element.shapeType !== 'line' && element.shapeType !== 'arrow') continue;
            for (const endpoint of ['p1', 'p2']) {
                const connection = element.connections?.[endpoint];
                if (connection && !importedIds.has(connection.elementId)) {
                    element.connections[endpoint] = null;
                }
            }
        }

        app.elements = importedElements;
        app.layerManager?._reindex();
        if (camera) {
            app.camera.x = camera.x;
            app.camera.y = camera.y;
            app.camera.zoom = camera.zoom;
        }
        app.history?.clear();
        app.selectionManager.clear();
        app.renderer.markDirty();
    }

    static exportPNG(app) {
        const visibleElements = app.elements.filter(el => !el.hidden);
        if (visibleElements.length === 0) return;

        // Calculate bounding box of all elements
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of visibleElements) {
            const b = el.getRotatedBounds ? el.getRotatedBounds() : el.getBounds();
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        const pad = 40;
        const w = maxX - minX + pad * 2;
        const h = maxY - minY + pad * 2;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;

        // Keep large boards exportable without allocating an unbounded bitmap.
        const scale = Math.min(
            2,
            MAX_EXPORT_CANVAS_DIMENSION / w,
            MAX_EXPORT_CANVAS_DIMENSION / h,
            Math.sqrt(MAX_EXPORT_CANVAS_PIXELS / (w * h))
        );
        if (!Number.isFinite(scale) || scale <= 0) return false;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = Math.max(1, Math.ceil(w * scale));
        offCanvas.height = Math.max(1, Math.ceil(h * scale));
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) return false;
        offCtx.scale(scale, scale);

        // Background
        offCtx.fillStyle = '#1e1e1e';
        offCtx.fillRect(0, 0, w, h);

        // Translate so elements are in view
        offCtx.translate(-minX + pad, -minY + pad);

        // Draw elements
        const sorted = visibleElements.slice().sort((a, b) => a.zIndex - b.zIndex);
        for (const el of sorted) {
            offCtx.save();
            el.draw(offCtx, { zoom: 1 });
            offCtx.restore();
        }

        offCanvas.toBlob(blob => {
            if (!downloadBlob(blob, `whiteboard-${Date.now()}.png`)) {
                console.error('[PNG export] Browser could not encode the whiteboard canvas.');
            }
        }, 'image/png');
        return true;
    }
}
