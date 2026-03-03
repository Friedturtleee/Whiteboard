/**
 * LayerPanel — bottom-right panel for z-order management.
 */
export class LayerPanel {
    constructor(app) {
        this.app = app;
        this._list = document.getElementById('layer-list');

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

        // Show elements in reverse z-order (topmost first)
        const sorted = this.app.elements.slice().sort((a, b) => b.zIndex - a.zIndex);

        for (const el of sorted) {
            const item = document.createElement('div');
            item.className = 'layer-item';
            if (this.app.selectionManager.isSelected(el)) item.classList.add('selected');

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
                el.hidden = !el.hidden;
                this.app.renderer.markDirty();
                this.update();
            });

            item.appendChild(colorDot);
            item.appendChild(name);
            item.appendChild(vis);

            item.addEventListener('click', () => {
                this.app.selectionManager.select(el);
                this.app.propertyPanel.update();
                this.update();
            });

            this._list.appendChild(item);
        }
    }
}
