/**
 * History — undo/redo via Command Pattern.
 */
export class History {
    constructor(app) {
        this.app = app;
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = 100;
    }

    push(command) {
        command.timestamp = Date.now();
        this.undoStack.push(command);
        if (this.undoStack.length > this.maxSize) this.undoStack.shift();
        this.redoStack = [];
    }

    clear() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const cmd = this.undoStack.pop();
        try {
            cmd.undo();
        } catch (error) {
            this.undoStack.push(cmd);
            throw error;
        }
        this.redoStack.push(cmd);
        this.app.renderer.markDirty();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const cmd = this.redoStack.pop();
        try {
            cmd.redo();
        } catch (error) {
            this.redoStack.push(cmd);
            throw error;
        }
        this.undoStack.push(cmd);
        this.app.renderer.markDirty();
    }

    /** Helper: create a move command */
    pushMove(elementsInfo, onChange = null) {
        // elementsInfo = [{ el, fromX, fromY, toX, toY }, ...]
        const apply = key => {
            for (const info of elementsInfo) {
                info.el.x = info[key === 'from' ? 'fromX' : 'toX'];
                info.el.y = info[key === 'from' ? 'fromY' : 'toY'];
                const points = info[key === 'from' ? 'fromPoints' : 'toPoints'];
                if (points && Array.isArray(info.el.points)) {
                    info.el.points = points.map(point => ({ ...point }));
                }
            }
            onChange?.();
        };
        this.push({
            description: 'Move',
            undo() { apply('from'); },
            redo() { apply('to'); }
        });
    }

    /** Helper: create an add element(s) command */
    pushAdd(app, elements) {
        const arr = Array.isArray(elements) ? elements : [elements];
        const desc = arr.length === 1 ? 'Add ' + arr[0].type : 'Add ' + arr.length + ' elements';
        this.push({
            description: desc,
            undo() {
                for (const el of arr) {
                    const idx = app.elements.indexOf(el);
                    if (idx >= 0) app.elements.splice(idx, 1);
                }
                if (app.selectionManager?.selectedElements) {
                    const removed = new Set(arr);
                    app.selectionManager.selectedElements = app.selectionManager.selectedElements
                        .filter(el => !removed.has(el));
                }
                app.layerManager._reindex();
            },
            redo() {
                for (const el of arr) {
                    if (!app.elements.includes(el)) app.elements.push(el);
                }
                app.layerManager._reindex();
            }
        });
    }

    /** Helper: create a delete command */
    pushDelete(app, elements) {
        const previousSelection = app.selectionManager?.selectedElements?.slice() || [];
        const copies = elements
            .map(el => ({ el, idx: app.elements.indexOf(el) }))
            .filter(copy => copy.idx >= 0)
            .sort((a, b) => a.idx - b.idx);
        this.push({
            description: 'Delete',
            undo() {
                for (const c of copies) {
                    if (!app.elements.includes(c.el)) app.elements.splice(c.idx, 0, c.el);
                }
                app.layerManager._reindex();
                if (app.selectionManager?.selectedElements) {
                    app.selectionManager.selectedElements = previousSelection
                        .filter(el => app.elements.includes(el));
                }
            },
            redo() {
                for (const c of copies) {
                    const idx = app.elements.indexOf(c.el);
                    if (idx >= 0) app.elements.splice(idx, 1);
                }
                if (app.selectionManager?.selectedElements) {
                    const deleted = new Set(copies.map(copy => copy.el));
                    app.selectionManager.selectedElements = app.selectionManager.selectedElements
                        .filter(el => !deleted.has(el));
                }
                app.layerManager._reindex();
            }
        });
    }

    /** Helper: create a property change command */
    pushPropertyChange(el, prop, oldVal, newVal) {
        this.push({
            description: `Change ${prop}`,
            undo() { el[prop] = oldVal; },
            redo() { el[prop] = newVal; }
        });
    }

    /** Helper: resize command */
    pushResize(
        el, fromBounds, toBounds, fromPoints = null, toPoints = null,
        onChange = null, fromResizeState = null, toResizeState = null
    ) {
        const applyBounds = (bounds, points, resizeState) => {
            el.x = bounds.x;
            el.y = bounds.y;
            el.width = bounds.w;
            el.height = bounds.h;
            if (points && Array.isArray(el.points)) {
                el.points = points.map(point => ({ ...point }));
            }
            if (resizeState && typeof el.restoreResizeState === 'function') {
                el.restoreResizeState(resizeState);
            } else if (typeof el.onResize === 'function') {
                el.onResize(bounds.w, bounds.h);
            }
            onChange?.();
        };
        this.push({
            description: 'Resize',
            undo() { applyBounds(fromBounds, fromPoints, fromResizeState); },
            redo() { applyBounds(toBounds, toPoints, toResizeState); }
        });
    }

    /** Helper: rotate command */
    pushRotate(el, fromRot, toRot, onChange = null) {
        this.push({
            description: 'Rotate',
            undo() { el.rotation = fromRot; onChange?.(); },
            redo() { el.rotation = toRot; onChange?.(); }
        });
    }
}
