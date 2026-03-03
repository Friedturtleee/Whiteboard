/**
 * SelectionManager — handles single/multi-select, rubber-band, and group operations.
 */
import { HitTest } from '../canvas/HitTest.js';

export class SelectionManager {
    constructor(app) {
        this.app = app;
        this.selectedElements = [];
        this.rubberBand = null;  // { x, y, w, h } in world coords
    }

    clear() {
        this.selectedElements = [];
        this.rubberBand = null;
        this.app.renderer.markDirty();
    }

    select(el) {
        this.selectedElements = [el];
        this.app.renderer.markDirty();
    }

    toggleSelect(el) {
        const idx = this.selectedElements.indexOf(el);
        if (idx >= 0) {
            this.selectedElements.splice(idx, 1);
        } else {
            this.selectedElements.push(el);
        }
        this.app.renderer.markDirty();
    }

    addToSelection(el) {
        if (!this.selectedElements.includes(el)) {
            this.selectedElements.push(el);
            this.app.renderer.markDirty();
        }
    }

    isSelected(el) {
        return this.selectedElements.includes(el);
    }

    selectAll() {
        this.selectedElements = this.app.elements.filter(e => !e.hidden && !e.locked);
        this.app.renderer.markDirty();
    }

    /** Start rubber-band selection */
    startRubberBand(wx, wy) {
        this.rubberBand = { x: wx, y: wy, w: 0, h: 0, startX: wx, startY: wy };
    }

    /** Update rubber-band as mouse moves */
    updateRubberBand(wx, wy) {
        if (!this.rubberBand) return;
        const rb = this.rubberBand;
        rb.x = Math.min(rb.startX, wx);
        rb.y = Math.min(rb.startY, wy);
        rb.w = Math.abs(wx - rb.startX);
        rb.h = Math.abs(wy - rb.startY);
        this.app.renderer.markDirty();
    }

    /** Finish rubber-band: select all elements intersecting the rect */
    finishRubberBand(additive = false) {
        if (!this.rubberBand) return;
        const rb = this.rubberBand;
        if (!additive) this.selectedElements = [];
        for (const el of this.app.elements) {
            if (el.hidden || el.locked) continue;
            const b = el.getBounds();
            if (HitTest.rectsIntersect(rb, b)) {
                if (!this.selectedElements.includes(el)) {
                    this.selectedElements.push(el);
                }
            }
        }
        this.rubberBand = null;
        this.app.renderer.markDirty();
    }

    /** Get bounding box of all selected elements */
    getGroupBounds() {
        if (this.selectedElements.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of this.selectedElements) {
            const b = el.getBounds();
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /** Move all selected elements by delta */
    moveSelected(dx, dy) {
        for (const el of this.selectedElements) {
            if (el.locked) continue;
            el.x += dx;
            el.y += dy;
            // For graph/tree elements, update internal node positions
            if (el.moveNodes) el.moveNodes(dx, dy);
        }
        this.app.renderer.markDirty();
    }

    /** Delete all selected elements */
    deleteSelected() {
        const removed = [];
        for (const el of this.selectedElements) {
            const idx = this.app.elements.indexOf(el);
            if (idx >= 0) {
                this.app.elements.splice(idx, 1);
                removed.push(el);
            }
        }
        this.selectedElements = [];
        this.app.renderer.markDirty();
        return removed;
    }

    /** Set property on all selected elements */
    setProperty(prop, value) {
        for (const el of this.selectedElements) {
            el[prop] = value;
        }
        this.app.renderer.markDirty();
    }
}
