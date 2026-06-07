/**
 * LayerPanel — bottom-right panel for z-order management.
 * Supports multi-select (Ctrl+click) and range-select (Shift+click).
 */
export class LayerPanel {
    constructor(app) {
        this.app = app;
        this._list = document.getElementById('layer-list');
        this._dragSrc = null;   // element being dragged
        this._lastClickedEl = null; // for shift-range select

        document.getElementById('layer-up')?.addEventListener('click', () => {
            const sel = this.app.selectionManager.selectedElements;
            if (sel.length === 1) this.app.layerManager.moveUp(sel[0]);
            this.update();
        });
        document.getElementById('layer-down')?.addEventListener('click', () => {
            const sel = this.app.selectionManager.selectedElements;
            if (sel.length === 1) this.app.layerManager.moveDown(sel[0]);
            this.update();
        });
    }

    update() {
        if (!this._list) return;
        this._list.innerHTML = '';

        const panel = document.getElementById('layer-panel');
        if (this.app.elements.length === 0) {
            if (panel) panel.style.display = 'none';
            return;
        }
        if (panel) panel.style.display = '';

        // Show elements in reverse z-order (topmost first)
        const sorted = this.app.elements.slice().sort((a, b) => b.zIndex - a.zIndex);

        for (const el of sorted) {
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.draggable = true;
            item.dataset.elId = el.id;
            if (this.app.selectionManager.isSelected(el)) item.classList.add('selected');

            const dragHandle = document.createElement('span');
            dragHandle.className = 'layer-drag-handle';
            dragHandle.textContent = '⠿';
            dragHandle.title = '拖動排序';

            const colorDot = document.createElement('span');
            colorDot.className = 'layer-color';
            colorDot.style.background = el.color;

            const name = document.createElement('span');
            name.className = 'layer-name';
            name.textContent = `${el.label || el.type} #${el.id}`;

            const vis = document.createElement('span');
            vis.className = 'layer-visibility' + (el.hidden ? ' hidden' : '');
            vis.textContent = el.hidden ? '◯' : '◉';
            vis.addEventListener('click', (e) => {
                e.stopPropagation();
                const oldVal = el.hidden;
                el.hidden = !el.hidden;
                this.app.history.pushPropertyChange(el, 'hidden', oldVal, el.hidden);
                this.app.renderer.markDirty();
                this.update();
            });

            item.appendChild(dragHandle);
            item.appendChild(colorDot);
            item.appendChild(name);
            item.appendChild(vis);

            // ── Click to select (with Ctrl/Shift multi-select) ─────────────────
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const sel = this.app.selectionManager;

                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+click: toggle this element in selection
                    sel.toggleSelect(el);
                } else if (e.shiftKey && this._lastClickedEl) {
                    // Shift+click: range select between lastClicked and this
                    const allEls = this.app.elements.slice().sort((a, b) => b.zIndex - a.zIndex);
                    const fromIdx = allEls.indexOf(this._lastClickedEl);
                    const toIdx   = allEls.indexOf(el);
                    if (fromIdx >= 0 && toIdx >= 0) {
                        const lo = Math.min(fromIdx, toIdx);
                        const hi = Math.max(fromIdx, toIdx);
                        for (let i = lo; i <= hi; i++) {
                            if (!sel.isSelected(allEls[i])) sel.toggleSelect(allEls[i]);
                        }
                    }
                } else {
                    // Single click: exclusive select
                    sel.select(el);
                    this.app._focusOnElement(el);
                }

                this._lastClickedEl = el;
                this.app.propertyPanel.update();
                this.update();
            });

            // ── Drag-to-reorder ──────────────────────────────
            item.addEventListener('dragstart', (e) => {
                this._dragSrc = el;
                e.dataTransfer.effectAllowed = 'move';
                item.style.opacity = '0.4';
            });
            item.addEventListener('dragend', () => {
                item.style.opacity = '';
                this._list.querySelectorAll('.layer-item').forEach(i => i.classList.remove('drag-over'));
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this._list.querySelectorAll('.layer-item').forEach(i => i.classList.remove('drag-over'));
                item.classList.add('drag-over');
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                if (!this._dragSrc || this._dragSrc === el) return;

                // Move dragSrc to the zIndex position of the drop target
                const srcIdx = this.app.elements.indexOf(this._dragSrc);
                const dstEl = el;
                const dstIdx = this.app.elements.indexOf(dstEl);
                if (srcIdx < 0 || dstIdx < 0) return;

                const oldArr = this.app.elements.slice();

                this.app.elements.splice(srcIdx, 1);
                const newDst = this.app.elements.indexOf(dstEl);
                // The panel shows in reverse order (top=high zIndex), so dropping ON an item
                // means the dragged item should go ABOVE it in the sorted view = higher index in array
                this.app.elements.splice(newDst + (srcIdx > dstIdx ? 1 : 0), 0, this._dragSrc);
                this.app.layerManager._reindex();
                
                if (this.app.layerManager._pushHistory) {
                    this.app.layerManager._pushHistory(oldArr);
                }

                this._dragSrc = null;
                this.update();
            });

            this._list.appendChild(item);
        }
    }
}
