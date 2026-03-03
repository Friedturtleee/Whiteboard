/**
 * Serializer — JSON export/import and PNG export.
 */
import { ShapeElement } from '../elements/ShapeElement.js';
import { TextElement } from '../elements/TextElement.js';
import { MatrixElement } from '../elements/MatrixElement.js';
import { StackElement } from '../elements/StackElement.js';
import { QueueElement } from '../elements/QueueElement.js';
import { TreeElement } from '../tree/TreeElement.js';
import { GraphElement } from '../graph/GraphElement.js';
import { Element } from './Element.js';

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
                    app.elements = [];
                    let maxId = 0;
                    for (const ed of data.elements) {
                        const Cls = TYPE_MAP[ed.type];
                        if (!Cls) continue;
                        const el = Cls.fromData ? Cls.fromData(ed) : new Cls();
                        el.deserialize(ed);
                        if (el.id > maxId) maxId = el.id;
                        app.elements.push(el);
                    }
                    Element.resetIdCounter(maxId);
                    if (data.camera) {
                        app.camera.x = data.camera.x;
                        app.camera.y = data.camera.y;
                        app.camera.zoom = data.camera.zoom;
                    }
                    app.selectionManager.clear();
                    app.renderer.markDirty();
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    static exportPNG(app) {
        if (app.elements.length === 0) return;

        // Calculate bounding box of all elements
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of app.elements) {
            if (el.hidden) continue;
            const b = el.getBounds();
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
        const sorted = app.elements.slice().sort((a, b) => a.zIndex - b.zIndex);
        for (const el of sorted) {
            if (el.hidden) continue;
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
