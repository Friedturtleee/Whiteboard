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

    /** 14 muted colors + custom picker */
    static COLORS = [
        '#b34d4d', '#b3734d', '#b39b4d', '#8a9e4d',
        '#4d8a4d', '#4d8a7a', '#4d8a9e', '#4d6eb3',
        '#4d4db3', '#6b4db3', '#8a4db3', '#b34d8a',
        '#b0b0b0', '#e8e8e8'
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
                const sel = this.app.selectionManager;
                const oldVals = sel.selectedElements.map(e => ({ el: e, old: e.color }));
                sel.setProperty('color', color);
                
                if (oldVals.length > 0) {
                    this.app.history.push({
                        description: 'Change color',
                        undo: () => { oldVals.forEach(c => c.el.color = c.old); this.app.renderer.markDirty(); },
                        redo: () => { oldVals.forEach(c => c.el.color = color); this.app.renderer.markDirty(); }
                    });
                }
                this._updateColorSelection(color);
                this.app.renderer.markDirty();
            });
            this._colorGrid.appendChild(swatch);
        }
        // Custom "+" swatch that opens dark popup
        const customBtn = document.createElement('div');
        customBtn.className = 'color-swatch color-swatch-custom';
        customBtn.textContent = '+';
        customBtn.title = '自訂顏色';
        customBtn.dataset.color = '#ffffff';
        customBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Import dynamically to avoid circular deps
            import('./ColorPicker.js').then(({ ColorPicker }) => {
                ColorPicker._openCustomPopup(customBtn, (c) => {
                    customBtn.style.background = c;
                    customBtn.dataset.color = c;
                    this._colorGrid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                    customBtn.classList.add('selected');
                    const sel = this.app.selectionManager;
                    const oldVals = sel.selectedElements.map(e => ({ el: e, old: e.color }));
                    sel.setProperty('color', c);
                    
                    if (oldVals.length > 0) {
                        this.app.history.push({
                            description: 'Change custom color',
                            undo: () => { oldVals.forEach(v => v.el.color = v.old); this.app.renderer.markDirty(); },
                            redo: () => { oldVals.forEach(v => v.el.color = c); this.app.renderer.markDirty(); }
                        });
                    }
                    this.app.renderer.markDirty();
                });
            });
        });
        this._colorGrid.appendChild(customBtn);
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
            let oldVals = null;

            const startEdit = () => {
                if (oldVals) return;
                const sel = this.app.selectionManager;
                oldVals = sel.selectedElements.map(e => ({ el: e, old: e[prop] }));
            };

            el.addEventListener('pointerdown', startEdit);
            el.addEventListener('focus', startEdit);

            el.addEventListener('input', () => {
                const val = transform(el.value);
                this.app.selectionManager.setProperty(prop, val);
            });

            el.addEventListener('change', () => {
                const val = transform(el.value);
                if (oldVals && oldVals.length > 0) {
                    const localOlds = [...oldVals];
                    this.app.history.push({
                        description: `Change ${prop}`,
                        undo: () => { localOlds.forEach(c => c.el[prop] = c.old); this.app.renderer.markDirty(); },
                        redo: () => { localOlds.forEach(c => c.el[prop] = val); this.app.renderer.markDirty(); }
                    });
                    oldVals = null;
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
            let oldCellSizeVals = null;
            const startCellSizeEdit = () => {
                if (oldCellSizeVals) return;
                const sel = this.app.selectionManager;
                oldCellSizeVals = sel.selectedElements.map(e => ({ el: e, old: e.cellSize }));
            };
            cellSizeInput.addEventListener('pointerdown', startCellSizeEdit);
            cellSizeInput.addEventListener('focus', startCellSizeEdit);

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

            cellSizeInput.addEventListener('change', () => {
                const val = Number(cellSizeInput.value);
                if (oldCellSizeVals && oldCellSizeVals.length > 0) {
                    const localOlds = [...oldCellSizeVals];
                    this.app.history.push({
                        description: 'Change cell size',
                        undo: () => { 
                            localOlds.forEach(c => { c.el.cellSize = c.old; c.el._updateSize(); });
                            this.app.renderer.markDirty(); 
                        },
                        redo: () => { 
                            localOlds.forEach(c => { c.el.cellSize = val; c.el._updateSize(); });
                            this.app.renderer.markDirty(); 
                        }
                    });
                    oldCellSizeVals = null;
                }
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
                        if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                        this.app.history.pushPropertyChange(el, 'fontFamily', old, val);
                    }
                }
                this.app.renderer.markDirty();
            });
        }

        // Text style toggles
        const bindTextStyle = (btnId, propName) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            btn.addEventListener('click', () => {
                const sel = this.app.selectionManager;
                // Determine new state based on first element
                let newState = true;
                if (sel.selectedElements.length > 0) {
                    newState = !sel.selectedElements[0][propName];
                }
                btn.classList.toggle('active', newState);
                
                for (const el of sel.selectedElements) {
                    if (el[propName] !== undefined) {
                        const old = el[propName];
                        el[propName] = newState;
                        if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                        this.app.history.pushPropertyChange(el, propName, old, newState);
                    }
                }
                this.app.renderer.markDirty();
            });
        };
        bindTextStyle('prop-bold', 'isBold');
        bindTextStyle('prop-italic', 'isItalic');
        bindTextStyle('prop-underline', 'isUnderline');
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

        // Stroke width row: hide for text elements
        const strokeWidthRow = document.getElementById('stroke-width-row');
        if (strokeWidthRow) {
            strokeWidthRow.style.display = el.type === 'text' ? 'none' : '';
        }

        // Font family & text styles: show only for text elements
        const fontFamilyRow = document.getElementById('font-family-row');
        const fontSelect = document.getElementById('prop-font-family');
        const textStylesRow = document.getElementById('text-styles-row');
        
        if (fontFamilyRow && textStylesRow) {
            if (el.type === 'text') {
                fontFamilyRow.style.display = '';
                textStylesRow.style.display = '';
                if (fontSelect) {
                    const opts = Array.from(fontSelect.options).map(o => o.value);
                    fontSelect.value = opts.includes(el.fontFamily) ? el.fontFamily : opts[0];
                }
                // Update button states
                const setBtn = (id, prop) => {
                    const btn = document.getElementById(id);
                    if (btn) btn.classList.toggle('active', !!el[prop]);
                };
                setBtn('prop-bold', 'isBold');
                setBtn('prop-italic', 'isItalic');
                setBtn('prop-underline', 'isUnderline');
            } else {
                fontFamilyRow.style.display = 'none';
                textStylesRow.style.display = 'none';
            }
        }
    }
}
