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

    _rememberSelectedColor() {
        for (let index = this.selectedElements.length - 1; index >= 0; index--) {
            const color = this.selectedElements[index]?.color;
            if (typeof color === 'string' && color) {
                this.app.currentColor = color;
                return;
            }
        }
    }

    clear() {
        // Pure: the colour of a selection is synced to app.currentColor when the
        // selection is made (select / toggleSelect / addToSelection / selectAll /
        // finishRubberBand), never as a side effect of deselecting.
        this.selectedElements = [];
        this.rubberBand = null;
        this.app.renderer.markDirty();
    }

    select(el) {
        if (!el) {
            this.selectedElements = [];
            this.app.renderer.markDirty();
            return;
        }
        if (el.locked) {
            const editable = this.selectedElements.filter(item => !item.locked);
            if (editable.length !== this.selectedElements.length) {
                this.selectedElements = editable;
                this.app.renderer.markDirty();
            }
            return;
        }
        this.selectedElements = [el];
        this._rememberSelectedColor();
        this.app.renderer.markDirty();
    }

    toggleSelect(el) {
        if (!el) return;
        const idx = this.selectedElements.indexOf(el);
        if (el.locked) {
            if (idx >= 0) {
                this.selectedElements.splice(idx, 1);
                this.app.renderer.markDirty();
            }
            return;
        }
        if (idx >= 0) {
            this.selectedElements.splice(idx, 1);
        } else {
            this.selectedElements.push(el);
        }
        this._rememberSelectedColor();
        this.app.renderer.markDirty();
    }

    addToSelection(el) {
        if (!el) return;
        if (el.locked) {
            this.selectedElements = this.selectedElements.filter(item => item !== el && !item.locked);
            this.app.renderer.markDirty();
            return;
        }
        if (!this.selectedElements.includes(el)) {
            this.selectedElements.push(el);
            this.app.currentColor = el.color || this.app.currentColor;
            this.app.renderer.markDirty();
        }
    }

    isSelected(el) {
        return this.selectedElements.includes(el);
    }

    selectAll() {
        this.selectedElements = this.app.elements.filter(e => !e.hidden && !e.locked);
        this._rememberSelectedColor();
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

    /** Finish rubber-band: select all elements whose real shape intersects the rect */
    finishRubberBand(additive = false) {
        if (!this.rubberBand) return;
        const rb = this.rubberBand;
        const selected = [];
        const seen = new Set();
        if (additive) {
            const present = new Set(this.app.elements);
            for (const el of this.selectedElements) {
                if (!el.locked && present.has(el) && !seen.has(el)) { seen.add(el); selected.push(el); }
            }
        }
        for (const el of this.app.elements) {
            if (el.hidden || el.locked || seen.has(el)) continue;
            if (SelectionManager._intersectsRubberBand(el, rb)) { seen.add(el); selected.push(el); }
        }
        this.selectedElements = selected;
        this.rubberBand = null;
        this._rememberSelectedColor();
        this.app.renderer.markDirty();
    }

    /**
     * Cheap AABB reject first, then the real shape for elements thinner than their
     * bbox: lines/arrows (segment), pens (polyline) and rotated elements (oriented box).
     */
    static _intersectsRubberBand(el, rb) {
        const b = el.getRotatedBounds ? el.getRotatedBounds() : el.getBounds();
        if (!HitTest.rectsIntersect(rb, b)) return false;
        const isLine = el.shapeType === 'line' || el.shapeType === 'arrow';
        const isPen = Array.isArray(el.points) && el.type === 'pen';
        if (!isLine && !isPen && !el.rotation) return true;
        const toWorld = point => (el.rotation && el.toWorldPoint ? el.toWorldPoint(point.x, point.y) : point);
        // Inflate by half the stroke so a thick stroke grazing the rect still counts.
        const half = isLine || isPen ? Math.max(0, Number(el.strokeWidth) || 0) / 2 : 0;
        const rect = { x: rb.x - half, y: rb.y - half, w: rb.w + half * 2, h: rb.h + half * 2 };
        if (isLine) {
            const p1 = el.getEndpointWorld?.(0) ?? toWorld({ x: el.x, y: el.y });
            const p2 = el.getEndpointWorld?.(1) ?? toWorld({ x: el.x + el.width, y: el.y + el.height });
            return HitTest.segmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, rect);
        }
        if (isPen) {
            if (el.points.length === 0) return true;
            return HitTest.polylineIntersectsRect(el.rotation ? el.points.map(toWorld) : el.points, rect);
        }
        const local = el.getBounds();
        return HitTest.polygonIntersectsRect([
            toWorld({ x: local.x, y: local.y }), toWorld({ x: local.x + local.w, y: local.y }),
            toWorld({ x: local.x + local.w, y: local.y + local.h }), toWorld({ x: local.x, y: local.y + local.h })
        ], rb);
    }

    /** Delete all selected elements */
    deleteSelected() {
        const removed = [];
        for (const el of this.selectedElements) {
            if (el.locked) continue;
            const idx = this.app.elements.indexOf(el);
            if (idx >= 0) {
                this.app.elements.splice(idx, 1);
                removed.push(el);
            }
        }
        this.selectedElements = [];
        this.app.layerManager._reindex();
        this.app.renderer.markDirty();
        return removed;
    }

    /** Set property on all selected elements */
    setProperty(prop, value) {
        for (const el of this.selectedElements) {
            if (el.locked) continue;
            el[prop] = value;
        }
        this.app.renderer.markDirty();
    }
}
