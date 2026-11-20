/**
 * Serializer — JSON export/import and PNG export.
 */
import { ShapeElement } from '../elements/ShapeElement.js';
import { TextElement } from '../elements/TextElement.js';
import { MatrixElement } from '../elements/MatrixElement.js?v=5';
import { StackElement } from '../elements/StackElement.js';
import { QueueElement } from '../elements/QueueElement.js';
import { PenElement } from '../elements/PenElement.js';
import { MermaidElement } from '../elements/MermaidElement.js';
import { MarkdownElement } from '../elements/MarkdownElement.js';
import { TreeElement } from '../tree/TreeElement.js?v=2';
import { GraphElement } from '../graph/GraphElement.js';
import { validateWhiteboardElement } from './WhiteboardElementValidation.js?v=2';
import { MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM } from '../canvas/Camera.js';
import { elementsInPaintOrder } from './ElementOrder.js';

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMPORTED_ELEMENTS = 10000;
const MAX_WORLD_COORDINATE = 100_000_000;
const MAX_EXPORT_CANVAS_DIMENSION = 16384;
const MAX_EXPORT_CANVAS_PIXELS = 16_000_000;

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
                reject(new TypeError('JSON 檔案不存在或超過 25 MB。'));
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
    static loadJSONData(app, data, { preserveExternalConnections = false } = {}) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) {
            throw new TypeError('JSON 檔案格式錯誤，缺少物件清單。');
        }
        if (data.elements.length > MAX_IMPORTED_ELEMENTS) {
            throw new TypeError('JSON 檔案超過 10,000 個物件上限。');
        }

        const importedElements = [];
        const elementIds = new Set();
        for (const ed of data.elements) {
            if (!ed || typeof ed !== 'object' || Array.isArray(ed) || typeof ed.type !== 'string') {
                throw new TypeError('JSON 檔案含無效的白板物件。');
            }
            validateWhiteboardElement(ed);
            if (!Object.prototype.hasOwnProperty.call(TYPE_MAP, ed.type)) {
                throw new TypeError('不支援的白板物件類型：' + ed.type);
            }
            if (ed.id !== undefined) {
                // Shape and format are checked by the shared validator above;
                // this set enforces the document-wide uniqueness constraint.
                if (elementIds.has(ed.id)) throw new TypeError('白板物件 ID 重複。');
                elementIds.add(ed.id);
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
            throw new TypeError('白板視角設定無效。');
        }

        const importedById = new Map(importedElements.map(element => [element.id, element]));
        const validPortsById = new Map();
        const hasPort = (elementId, portId) => {
            const target = importedById.get(elementId);
            if (!target) return false;
            let ports = validPortsById.get(elementId);
            if (!ports) {
                ports = new Set((target.getConnectionPorts?.() || []).map(port => port.id));
                validPortsById.set(elementId, ports);
            }
            return ports.has(portId);
        };
        for (const element of importedElements) {
            if (element.shapeType !== 'line' && element.shapeType !== 'arrow') continue;
            for (const endpoint of ['p1', 'p2']) {
                const connection = element.connections?.[endpoint];
                if (connection && preserveExternalConnections &&
                    !importedById.has(connection.elementId)) continue;
                if (connection && !hasPort(connection.elementId, connection.portId)) {
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
        const sorted = elementsInPaintOrder(visibleElements);
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
