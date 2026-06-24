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
        if (this.app.collaboration && this.app.collaboration.provider) {
            // In multiplayer mode, sync all changes to Yjs instead of local stack
            this.app.collaboration.doc.transact(() => {
                // 1. Delete elements that were removed locally
                for (const id of this.app.collaboration.elementsMap.keys()) {
                    if (!this.app.elements.find(e => e.id === id)) {
                        this.app.collaboration.elementsMap.delete(id);
                    }
                }
                // 2. Update/Add elements that changed locally
                for (const el of this.app.elements) {
                    const serialized = JSON.stringify(el.serialize());
                    if (this.app.collaboration.elementsMap.get(el.id) !== serialized) {
                        this.app.collaboration.elementsMap.set(el.id, serialized);
                    }
                }
            });
            return;
        }

        // Single player fallback
        command.timestamp = Date.now();
        this.undoStack.push(command);
        if (this.undoStack.length > this.maxSize) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.app.collaboration && this.app.collaboration.provider) {
            this.app.collaboration.undoManager.undo();
            return;
        }
        if (this.undoStack.length === 0) return;
        const cmd = this.undoStack.pop();
        cmd.undo();
        this.redoStack.push(cmd);
        this.app.renderer.markDirty();
    }

    redo() {
        if (this.app.collaboration && this.app.collaboration.provider) {
            this.app.collaboration.undoManager.redo();
            return;
        }
        if (this.redoStack.length === 0) return;
        const cmd = this.redoStack.pop();
        cmd.redo();
        this.undoStack.push(cmd);
        this.app.renderer.markDirty();
    }

    /** Helper: create a move command */
    pushMove(elementsInfo) {
        // elementsInfo = [{ el, fromX, fromY, toX, toY }, ...]
        this.push({
            description: 'Move',
            undo() {
                for (const info of elementsInfo) {
                    info.el.x = info.fromX;
                    info.el.y = info.fromY;
                }
            },
            redo() {
                for (const info of elementsInfo) {
                    info.el.x = info.toX;
                    info.el.y = info.toY;
                }
            }
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
                    app.selectionManager.remove(el);
                }
                app.layerManager._reindex();
            },
            redo() {
                for (const el of arr) {
                    app.elements.push(el);
                }
                app.layerManager._reindex();
            }
        });
    }

    /** Helper: create a delete command */
    pushDelete(app, elements) {
        const copies = elements.map(el => ({ el, idx: app.elements.indexOf(el) }));
        this.push({
            description: 'Delete',
            undo() {
                for (const c of copies) {
                    app.elements.splice(c.idx, 0, c.el);
                }
            },
            redo() {
                for (const c of copies) {
                    const idx = app.elements.indexOf(c.el);
                    if (idx >= 0) app.elements.splice(idx, 1);
                }
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
    pushResize(el, fromBounds, toBounds) {
        this.push({
            description: 'Resize',
            undo() { el.x = fromBounds.x; el.y = fromBounds.y; el.width = fromBounds.w; el.height = fromBounds.h; },
            redo() { el.x = toBounds.x; el.y = toBounds.y; el.width = toBounds.w; el.height = toBounds.h; }
        });
    }

    /** Helper: rotate command */
    pushRotate(el, fromRot, toRot) {
        this.push({
            description: 'Rotate',
            undo() { el.rotation = fromRot; },
            redo() { el.rotation = toRot; }
        });
    }
}
