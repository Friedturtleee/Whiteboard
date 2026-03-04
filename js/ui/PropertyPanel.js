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

        // Draw style selector (for shapes)
        const drawStyleSelect = document.getElementById('prop-draw-style');
        if (drawStyleSelect) {
            drawStyleSelect.addEventListener('change', () => {
                const val = drawStyleSelect.value;
                const sel = this.app.selectionManager;
                for (const el of sel.selectedElements) {
                    if (el.drawStyle !== undefined) {
                        const old = el.drawStyle;
                        el.drawStyle = val;
                        this.app.history.pushPropertyChange(el, 'drawStyle', old, val);
                    }
                }
                this.app.renderer.markDirty();
            });
        }

        // Cell size slider (for matrix)
        const cellSizeInput = document.getElementById('prop-cell-size');
        const cellSizeVal = document.getElementById('prop-cell-size-val');
        if (cellSizeInput) {
            cellSizeInput.addEventListener('input', () => {
                const val = Number(cellSizeInput.value);
                if (cellSizeVal) cellSizeVal.textContent = val;
                const sel = this.app.selectionManager;
                for (const el of sel.selectedElements) {
                    if (el.cellSize !== undefined) {
                        el.cellSize = val;
                        el._updateSize();
                    }
                }
                this.app.renderer.markDirty();
            });
        }

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

        // Font family selector (for text elements)
        const fontSelect = document.getElementById('prop-font-family');
        if (fontSelect) {
            fontSelect.addEventListener('change', () => {
                const val = fontSelect.value;
                const sel = this.app.selectionManager;
                for (const el of sel.selectedElements) {
                    if (el.fontFamily !== undefined) {
                        const old = el.fontFamily;
                        el.fontFamily = val;
                        this.app.history.pushPropertyChange(el, 'fontFamily', old, val);
                    }
                }
                this.app.renderer.markDirty();
            });
        }
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

        // Draw style row: show only for shape elements
        const drawStyleRow = document.getElementById('draw-style-row');
        const drawStyleSelect = document.getElementById('prop-draw-style');
        if (drawStyleRow && drawStyleSelect) {
            if (el.drawStyle !== undefined) {
                drawStyleRow.style.display = '';
                drawStyleSelect.value = el.drawStyle;
            } else {
                drawStyleRow.style.display = 'none';
            }
        }

        // Cell size row: show only for matrix elements
        const cellSizeRow = document.getElementById('cell-size-row');
        const cellSizeInput = document.getElementById('prop-cell-size');
        const cellSizeValSpan = document.getElementById('prop-cell-size-val');
        if (cellSizeRow) {
            if (el.cellSize !== undefined) {
                cellSizeRow.style.display = '';
                if (cellSizeInput) cellSizeInput.value = el.cellSize;
                if (cellSizeValSpan) cellSizeValSpan.textContent = el.cellSize;
            } else {
                cellSizeRow.style.display = 'none';
            }
        }

        this._updateColorSelection(el.color);

        // Font family row: show only for text elements
        const fontFamilyRow = document.getElementById('font-family-row');
        const fontSelect = document.getElementById('prop-font-family');
        if (fontFamilyRow) {
            if (el.fontFamily !== undefined) {
                fontFamilyRow.style.display = '';
                if (fontSelect) {
                    // Match current value (may not be in list — fallback gracefully)
                    const opts = Array.from(fontSelect.options).map(o => o.value);
                    fontSelect.value = opts.includes(el.fontFamily) ? el.fontFamily : opts[0];
                }
            } else {
                fontFamilyRow.style.display = 'none';
            }
        }
    }
}
