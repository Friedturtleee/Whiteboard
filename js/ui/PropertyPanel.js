/**
 * PropertyPanel — right-side panel for editing element properties.
 */
export class PropertyPanel {
    constructor(app) {
        this.app = app;
        this._panel = document.getElementById('property-panel');
        this._colorGrid = document.getElementById('color-grid');
        this._bindInputs();
        this._buildColorGrid();
    }

    /** 16 muted colors */
    static COLORS = [
        '#b34d4d', '#b3734d', '#b39b4d', '#8a9e4d',
        '#4d8a4d', '#4d8a7a', '#4d8a9e', '#4d6eb3',
        '#4d4db3', '#6b4db3', '#8a4db3', '#b34d8a',
        '#b34d6b', '#8a6b4d', '#b0b0b0', '#e8e8e8'
    ];

    _buildColorGrid() {
        if (!this._colorGrid) return;
        this._colorGrid.innerHTML = '';
        for (const color of PropertyPanel.COLORS) {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.background = color;
            swatch.dataset.color = color;
            swatch.addEventListener('click', () => {
                this.app.selectionManager.setProperty('color', color);
                this._updateColorSelection(color);
                this.app.renderer.markDirty();
            });
            this._colorGrid.appendChild(swatch);
        }
    }

    _updateColorSelection(activeColor) {
        this._colorGrid.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('selected', s.dataset.color === activeColor);
        });
    }

    _bindInputs() {
        const bind = (id, prop, transform = v => v) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                const val = transform(el.value);
                const sel = this.app.selectionManager;
                const oldVals = sel.selectedElements.map(e => ({ el: e, old: e[prop] }));
                sel.setProperty(prop, val);
                // Push history for each
                if (oldVals.length === 1) {
                    this.app.history.pushPropertyChange(oldVals[0].el, prop, oldVals[0].old, val);
                }
            });
        };

        bind('prop-x', 'x', Number);
        bind('prop-y', 'y', Number);
        bind('prop-w', 'width', Number);
        bind('prop-h', 'height', Number);
        bind('prop-rot', 'rotation', v => (Number(v) * Math.PI) / 180);

        bind('prop-opacity', 'opacity', v => Number(v) / 100);
        bind('prop-saturation', 'saturation', v => Number(v) / 100);
        bind('prop-stroke-width', 'strokeWidth', Number);

        // Range display values
        const rangeDisplay = (inputId, displayId, suffix = '') => {
            const inp = document.getElementById(inputId);
            const disp = document.getElementById(displayId);
            if (inp && disp) {
                inp.addEventListener('input', () => { disp.textContent = inp.value + suffix; });
            }
        };
        rangeDisplay('prop-opacity', 'prop-opacity-val', '%');
        rangeDisplay('prop-saturation', 'prop-saturation-val', '%');
        rangeDisplay('prop-stroke-width', 'prop-stroke-width-val', '');
    }

    update() {
        const sel = this.app.selectionManager;
        if (sel.selectedElements.length === 0) {
            this._panel.classList.remove('visible');
            return;
        }
        this._panel.classList.add('visible');

        const el = sel.selectedElements[0];

        const setVal = (id, val) => {
            const inp = document.getElementById(id);
            if (inp) inp.value = val;
        };

        setVal('prop-x', Math.round(el.x));
        setVal('prop-y', Math.round(el.y));
        setVal('prop-w', Math.round(el.width));
        setVal('prop-h', Math.round(el.height));
        setVal('prop-rot', Math.round((el.rotation * 180) / Math.PI));
        setVal('prop-opacity', Math.round(el.opacity * 100));
        setVal('prop-saturation', Math.round(el.saturation * 100));
        setVal('prop-stroke-width', el.strokeWidth);

        // Update display spans
        const opVal = document.getElementById('prop-opacity-val');
        if (opVal) opVal.textContent = Math.round(el.opacity * 100) + '%';
        const satVal = document.getElementById('prop-saturation-val');
        if (satVal) satVal.textContent = Math.round(el.saturation * 100) + '%';
        const swVal = document.getElementById('prop-stroke-width-val');
        if (swVal) swVal.textContent = el.strokeWidth;

        this._updateColorSelection(el.color);
    }
}
