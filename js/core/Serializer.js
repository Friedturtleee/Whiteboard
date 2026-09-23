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
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whiteboard-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    static importJSON(app, file) {
        return new Promise((resolve, reject) => {
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

        const importedElements = [];
        for (const ed of data.elements) {
            if (!ed || typeof ed !== 'object' || Array.isArray(ed) || typeof ed.type !== 'string') {
                throw new TypeError('Whiteboard file contains an invalid element record.');
            }
            if (!Object.prototype.hasOwnProperty.call(TYPE_MAP, ed.type)) {
                throw new TypeError('Unsupported whiteboard element type: ' + ed.type);
            }
            if (![ed.x, ed.y, ed.width, ed.height].every(Number.isFinite)) {
                throw new TypeError('Whiteboard element has invalid bounds.');
            }

            if (ed.type === 'matrix') {
                const { rows, cols, data: cells } = ed;
                if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) ||
                    rows < 0 || cols < 0 || rows > 200 || cols > 200 || rows * cols > 10000 ||
                    ((rows === 0) !== (cols === 0)) ||
                    !Array.isArray(cells) || cells.length !== rows ||
                    cells.some(row => !Array.isArray(row) || row.length !== cols)) {
                    throw new TypeError('Matrix element has invalid dimensions or cell data.');
                }
            } else if (ed.type === 'queue' || ed.type === 'stack') {
                if (!Array.isArray(ed.items) || ed.items.length > 10000) {
                    throw new TypeError('Array element has invalid or oversized item data.');
                }
            } else if (ed.type === 'pen') {
                if (!Array.isArray(ed.points) || ed.points.some(point =>
                    !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
                    throw new TypeError('Pen element contains invalid point data.');
                }
            } else if (ed.type === 'graph') {
                if (!Array.isArray(ed.graphNodes) || ed.graphNodes.length > 500 ||
                    !Array.isArray(ed.edges) || ed.edges.length > 100000) {
                    throw new TypeError('Graph element has invalid or oversized node/edge data.');
                }
                const nodeIds = new Set();
                for (const node of ed.graphNodes) {
                    if (!node || (typeof node.id !== 'string' && typeof node.id !== 'number') ||
                        !Number.isFinite(node.x) || !Number.isFinite(node.y) || nodeIds.has(String(node.id))) {
                        throw new TypeError('Graph element contains an invalid node.');
                    }
                    nodeIds.add(String(node.id));
                }
                for (const edge of ed.edges) {
                    if (!edge || !nodeIds.has(String(edge.u)) || !nodeIds.has(String(edge.v))) {
                        throw new TypeError('Graph element contains an edge with an unknown endpoint.');
                    }
                }
            } else if (ed.type === 'tree' &&
                (typeof ed.inputText !== 'string' || ed.inputText.length > 1000000)) {
                throw new TypeError('Tree element has invalid or oversized source data.');
            }

            const Cls = TYPE_MAP[ed.type];
            const el = Cls.fromData ? Cls.fromData(ed) : new Cls();
            el.deserialize(ed);
            importedElements.push(el);
        }

        const camera = data.camera;
        if (camera != null && (typeof camera !== 'object' ||
            ![camera.x, camera.y, camera.zoom].every(Number.isFinite) || camera.zoom <= 0)) {
            throw new TypeError('Whiteboard file contains invalid camera settings.');
        }

        app.elements = importedElements;
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

        const offCanvas = document.createElement('canvas');
        offCanvas.width = w * 2; // 2x for quality
        offCanvas.height = h * 2;
        const offCtx = offCanvas.getContext('2d');
        offCtx.scale(2, 2);

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
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `whiteboard-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }
}
