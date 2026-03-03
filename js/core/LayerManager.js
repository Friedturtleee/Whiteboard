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

    bringToFront(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx < 0) return;
        this.app.elements.splice(idx, 1);
        this.app.elements.push(el);
        this._reindex();
    }

    sendToBack(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx < 0) return;
        this.app.elements.splice(idx, 1);
        this.app.elements.unshift(el);
        this._reindex();
    }

    moveUp(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx < 0 || idx >= this.app.elements.length - 1) return;
        [this.app.elements[idx], this.app.elements[idx + 1]] =
            [this.app.elements[idx + 1], this.app.elements[idx]];
        this._reindex();
    }

    moveDown(el) {
        const idx = this.app.elements.indexOf(el);
        if (idx <= 0) return;
        [this.app.elements[idx], this.app.elements[idx - 1]] =
            [this.app.elements[idx - 1], this.app.elements[idx]];
        this._reindex();
    }
}
