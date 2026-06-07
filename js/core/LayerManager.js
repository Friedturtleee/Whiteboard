/**
 * LayerManager — z-order management for elements.
 */
export class LayerManager {
    constructor(app) {
        this.app = app;
    }

    _reindex() {
        this.app.elements.forEach((el, i) => { el.zIndex = i; });
        this.app.renderer.markDirty();
    }

    _pushHistory(oldArr) {
        const newArr = this.app.elements.slice();
        this.app.history.push({
            description: 'Reorder layers',
            undo: () => {
                this.app.elements.splice(0, this.app.elements.length, ...oldArr);
                this._reindex();
                if (this.app.layerPanel) this.app.layerPanel.update();
            },
            redo: () => {
                this.app.elements.splice(0, this.app.elements.length, ...newArr);
                this._reindex();
                if (this.app.layerPanel) this.app.layerPanel.update();
            }
        });
    }

    bringToFront(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx < 0) return;
        const oldArr = this.app.elements.slice();
        this.app.elements.splice(idx, 1);
        this.app.elements.push(el);
        this._reindex();
        this._pushHistory(oldArr);
    }

    sendToBack(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx < 0) return;
        const oldArr = this.app.elements.slice();
        this.app.elements.splice(idx, 1);
        this.app.elements.unshift(el);
        this._reindex();
        this._pushHistory(oldArr);
    }

    moveUp(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx < 0 || idx >= this.app.elements.length - 1) return;
        const oldArr = this.app.elements.slice();
        [this.app.elements[idx], this.app.elements[idx + 1]] =
            [this.app.elements[idx + 1], this.app.elements[idx]];
        this._reindex();
        this._pushHistory(oldArr);
    }

    moveDown(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx <= 0) return;
        const oldArr = this.app.elements.slice();
        [this.app.elements[idx], this.app.elements[idx - 1]] =
            [this.app.elements[idx - 1], this.app.elements[idx]];
        this._reindex();
        this._pushHistory(oldArr);
    }
}
