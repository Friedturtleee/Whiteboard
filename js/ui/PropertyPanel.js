/**
 * PropertyPanel — right-side panel for editing element properties.
 */
const editableSelection = selectionManager => selectionManager.selectedElements.filter(el => !el.locked);

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
                const oldVals = editableSelection(sel)
                    .filter(e => e.color !== color)
                    .map(e => ({ el: e, old: e.color }));
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
                    const oldVals = editableSelection(sel)
                        .filter(e => e.color !== c)
                        .map(e => ({ el: e, old: e.color }));
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
            const geometryProp = ['x', 'y', 'width', 'height', 'rotation'].includes(prop);
            const isValidValue = value => {
                if (!Number.isFinite(value)) return false;
                const selected = oldVals
                    ? oldVals.map(item => item.el).filter(item => !item.locked)
                    : editableSelection(this.app.selectionManager);
                if (prop === 'x' || prop === 'y') {
                    return Math.abs(value) <= 100_000_000 && selected.every(item => {
                        const end = value + (prop === 'x' ? item.width : item.height);
                        return Math.abs(end) <= 100_000_000;
                    });
                }
                if (prop === 'width' || prop === 'height') {
                    const signedBounds = selected.length > 0 && selected.every(item =>
                        item.type === 'line' || item.type === 'arrow');
                    return Math.abs(value) <= 10_000_000 && (signedBounds || value >= 1) &&
                        selected.every(item => Math.abs(
                            (prop === 'width' ? item.x : item.y) + value
                        ) <= 100_000_000);
                }
                if (prop === 'rotation') return Math.abs(value) <= Math.PI * 2;
                if (prop === 'opacity' || prop === 'saturation') return value >= 0 && value <= 1;
                if (prop === 'strokeWidth') return value >= 0 && value <= 10_000;
                return true;
            };

            const startEdit = () => {
                if (oldVals) return;
                const sel = this.app.selectionManager;
                const resizing = prop === 'width' || prop === 'height';
                const selected = editableSelection(sel);
                if (resizing) selected.forEach(item => item.onResizeStart?.());
                oldVals = selected.map(e => ({
                    el: e,
                    old: e[prop],
                    bounds: resizing
                        ? { x: e.x, y: e.y, width: e.width, height: e.height }
                        : null,
                    points: resizing && Array.isArray(e.points)
                        ? e.points.map(point => ({ ...point }))
                        : null,
                    resizeState: resizing ? e.captureResizeState?.() ?? null : null
                }));
            };

            el.addEventListener('pointerdown', startEdit);
            el.addEventListener('focus', startEdit);

            el.addEventListener('input', () => {
                const val = transform(el.value);
                if (!isValidValue(val)) return;
                const selected = oldVals
                    ? oldVals.map(item => item.el).filter(item => !item.locked)
                    : editableSelection(this.app.selectionManager);
                for (const item of selected) {
                    item[prop] = val;
                    if ((prop === 'width' || prop === 'height') && item.onResize) {
                        item.onResize(item.width, item.height);
                    }
                }
                if (geometryProp) this.app._updateConnectedLines(selected.map(item => item.id));
                this.app.renderer.markDirty();
            });

            el.addEventListener('change', () => {
                const val = transform(el.value);
                if (!isValidValue(val)) {
                    if (oldVals?.length) {
                        for (const item of oldVals.filter(item => !item.el.locked)) {
                            item.el[prop] = item.old;
                            if (prop === 'width' || prop === 'height') {
                                Object.assign(item.el, item.bounds);
                                if (item.points && Array.isArray(item.el.points)) {
                                    item.el.points = item.points.map(point => ({ ...point }));
                                }
                                if (item.resizeState && typeof item.el.restoreResizeState === 'function') {
                                    item.el.restoreResizeState(item.resizeState);
                                } else if (typeof item.el.onResize === 'function') {
                                    item.el.onResize(item.bounds.width, item.bounds.height);
                                }
                            }
                        }
                        if (geometryProp) {
                            this.app._updateConnectedLines(oldVals
                                .filter(item => !item.el.locked).map(item => item.el.id));
                        }
                        this.app.renderer.markDirty();
                    }
                    oldVals = null;
                    this.update();
                    return;
                }
                if (oldVals?.length) {
                    const localOlds = oldVals.filter(item => !item.el.locked);
                    if (!localOlds.length) {
                        oldVals = null;
                        return;
                    }
                    if (localOlds.every(item => Object.is(item.old, val))) {
                        oldVals = null;
                        return;
                    }
                    if (prop === 'width' || prop === 'height') {
                        const snapshots = localOlds.map(item => ({
                            el: item.el,
                            fromBounds: item.bounds,
                            toBounds: {
                                x: item.el.x, y: item.el.y,
                                width: item.el.width, height: item.el.height
                            },
                            fromPoints: item.points,
                            toPoints: Array.isArray(item.el.points)
                                ? item.el.points.map(point => ({ ...point }))
                                : null,
                            fromResizeState: item.resizeState,
                            toResizeState: item.el.captureResizeState?.() ?? null
                        }));
                        const applyResize = key => {
                            for (const snapshot of snapshots) {
                                const bounds = snapshot[key === 'from' ? 'fromBounds' : 'toBounds'];
                                const points = snapshot[key === 'from' ? 'fromPoints' : 'toPoints'];
                                const resizeState = snapshot[
                                    key === 'from' ? 'fromResizeState' : 'toResizeState'
                                ];
                                Object.assign(snapshot.el, bounds);
                                if (points && Array.isArray(snapshot.el.points)) {
                                    snapshot.el.points = points.map(point => ({ ...point }));
                                }
                                if (resizeState && typeof snapshot.el.restoreResizeState === 'function') {
                                    snapshot.el.restoreResizeState(resizeState);
                                } else if (typeof snapshot.el.onResize === 'function') {
                                    snapshot.el.onResize(bounds.width, bounds.height);
                                }
                            }
                            this.app._updateConnectedLines(snapshots.map(item => item.el.id));
                            this.app.renderer.markDirty();
                        };
                        this.app.history.push({
                            description: `Resize ${prop}`,
                            undo: () => applyResize('from'),
                            redo: () => applyResize('to')
                        });
                        oldVals = null;
                        return;
                    }
                    const applyValue = value => {
                        for (const item of localOlds) {
                            item.el[prop] = value;
                            if ((prop === 'width' || prop === 'height') && item.el.onResize) {
                                item.el.onResize(item.el.width, item.el.height);
                            }
                        }
                        if (geometryProp) {
                            this.app._updateConnectedLines(localOlds.map(item => item.el.id));
                        }
                        this.app.renderer.markDirty();
                    };
                    this.app.history.push({
                        description: `Change ${prop}`,
                        undo: () => {
                            for (const item of localOlds) {
                                item.el[prop] = item.old;
                                if ((prop === 'width' || prop === 'height') && item.el.onResize) {
                                    item.el.onResize(item.el.width, item.el.height);
                                }
                            }
                            if (geometryProp) {
                                this.app._updateConnectedLines(localOlds.map(item => item.el.id));
                            }
                            this.app.renderer.markDirty();
                        },
                        redo: () => applyValue(val)
                    });
                }
                oldVals = null;
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
                const changes = [];
                for (const el of editableSelection(sel)) {
                    if (el.drawStyle === undefined || el.drawStyle === val) continue;
                    changes.push({ el, old: el.drawStyle });
                    el.drawStyle = val;
                }
                if (changes.length) {
                    this.app.history.push({
                        description: 'Change draw style',
                        undo: () => {
                            changes.forEach(({ el, old }) => { el.drawStyle = old; });
                            this.app.renderer.markDirty();
                        },
                        redo: () => {
                            changes.forEach(({ el }) => { el.drawStyle = val; });
                            this.app.renderer.markDirty();
                        }
                    });
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
                oldCellSizeVals = editableSelection(sel)
                    .filter(e => e.cellSize !== undefined)
                    .map(e => ({ el: e, old: e.cellSize }));
            };
            cellSizeInput.addEventListener('pointerdown', startCellSizeEdit);
            cellSizeInput.addEventListener('focus', startCellSizeEdit);

            cellSizeInput.addEventListener('input', () => {
                const val = Number(cellSizeInput.value);
                if (cellSizeVal) cellSizeVal.textContent = val;
                const selected = oldCellSizeVals
                    ? oldCellSizeVals.map(item => item.el).filter(item => !item.locked)
                    : editableSelection(this.app.selectionManager);
                for (const el of selected) {
                    if (el.cellSize !== undefined) {
                        el.cellSize = val;
                        el._updateSize();
                    }
                }
                this.app._updateConnectedLines(selected.map(el => el.id));
                this.app.renderer.markDirty();
            });

            cellSizeInput.addEventListener('change', () => {
                const val = Number(cellSizeInput.value);
                if (oldCellSizeVals && oldCellSizeVals.length > 0) {
                    const localOlds = oldCellSizeVals.filter(item => !item.el.locked);
                    if (!localOlds.length) {
                        oldCellSizeVals = null;
                        return;
                    }
                    if (localOlds.every(item => Object.is(item.old, val))) {
                        oldCellSizeVals = null;
                        return;
                    }
                    const applyCellSize = value => {
                        localOlds.forEach(c => { c.el.cellSize = value; c.el._updateSize(); });
                        this.app._updateConnectedLines(localOlds.map(c => c.el.id));
                        this.app.renderer.markDirty();
                    };
                    this.app.history.push({
                        description: 'Change cell size',
                        undo: () => {
                            localOlds.forEach(c => { c.el.cellSize = c.old; c.el._updateSize(); });
                            this.app._updateConnectedLines(localOlds.map(c => c.el.id));
                            this.app.renderer.markDirty();
                        },
                        redo: () => applyCellSize(val)
                    });
                }
                oldCellSizeVals = null;
            });
        }

        // Font size slider (for text, markdown)
        const fontSizeInput = document.getElementById('prop-font-size');
        const fontSizeVal = document.getElementById('prop-font-size-val');
        if (fontSizeInput) {
            let oldFontSizeVals = null;
            const startFontSizeEdit = () => {
                if (oldFontSizeVals) return;
                const sel = this.app.selectionManager;
                oldFontSizeVals = editableSelection(sel)
                    .filter(e => e.fontSize !== undefined)
                    .map(e => ({ el: e, old: e.fontSize }));
            };
            fontSizeInput.addEventListener('pointerdown', startFontSizeEdit);
            fontSizeInput.addEventListener('focus', startFontSizeEdit);

            fontSizeInput.addEventListener('input', () => {
                const val = Number(fontSizeInput.value);
                if (fontSizeVal) fontSizeVal.textContent = val;
                const selected = oldFontSizeVals
                    ? oldFontSizeVals.map(item => item.el).filter(item => !item.locked)
                    : editableSelection(this.app.selectionManager);
                for (const el of selected) {
                    if (el.fontSize !== undefined) {
                        el.fontSize = val;
                        if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                        if (el.type === 'markdown') el._render();
                    }
                }
                this.app._updateConnectedLines(selected.map(el => el.id));
                this.app.renderer.markDirty();
            });

            fontSizeInput.addEventListener('change', () => {
                const val = Number(fontSizeInput.value);
                if (oldFontSizeVals && oldFontSizeVals.length > 0) {
                    const localOlds = oldFontSizeVals.filter(item => !item.el.locked);
                    if (!localOlds.length) {
                        oldFontSizeVals = null;
                        return;
                    }
                    if (localOlds.every(item => Object.is(item.old, val))) {
                        oldFontSizeVals = null;
                        return;
                    }
                    const applyFontSize = value => {
                        localOlds.forEach(c => {
                            c.el.fontSize = value;
                            if (c.el.type === 'text') c.el.autoSize(this.app.renderer.ctx);
                            if (c.el.type === 'markdown') c.el._render();
                        });
                        this.app._updateConnectedLines(localOlds.map(c => c.el.id));
                        this.app.renderer.markDirty();
                    };
                    this.app.history.push({
                        description: 'Change font size',
                        undo: () => {
                            localOlds.forEach(c => {
                                c.el.fontSize = c.old;
                                if (c.el.type === 'text') c.el.autoSize(this.app.renderer.ctx);
                                if (c.el.type === 'markdown') c.el._render();
                            });
                            this.app._updateConnectedLines(localOlds.map(c => c.el.id));
                            this.app.renderer.markDirty();
                        },
                        redo: () => applyFontSize(val)
                    });
                }
                oldFontSizeVals = null;
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
                const changes = [];
                for (const el of editableSelection(sel)) {
                    if (el.fontFamily === undefined || el.fontFamily === val) continue;
                    changes.push({ el, old: el.fontFamily });
                    el.fontFamily = val;
                    if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                }
                if (changes.length) {
                    const applyFontFamily = value => {
                        changes.forEach(({ el }) => {
                            el.fontFamily = value;
                            if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                        });
                        this.app._updateConnectedLines(changes.map(({ el }) => el.id));
                        this.app.renderer.markDirty();
                    };
                    this.app.history.push({
                        description: 'Change font family',
                        undo: () => {
                            changes.forEach(({ el, old }) => {
                                el.fontFamily = old;
                                if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                            });
                            this.app._updateConnectedLines(changes.map(({ el }) => el.id));
                            this.app.renderer.markDirty();
                        },
                        redo: () => applyFontFamily(val)
                    });
                }
                this.app._updateConnectedLines(changes.map(({ el }) => el.id));
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
                const selected = editableSelection(sel);
                if (selected.length > 0) {
                    newState = !selected[0][propName];
                }
                btn.classList.toggle('active', newState);
                const changes = [];
                for (const el of selected) {
                    if (el[propName] === undefined || el[propName] === newState) continue;
                    changes.push({ el, old: el[propName] });
                    el[propName] = newState;
                    if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                }
                if (changes.length) {
                    const applyTextStyle = value => {
                        changes.forEach(({ el }) => {
                            el[propName] = value;
                            if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                        });
                        this.app._updateConnectedLines(changes.map(({ el }) => el.id));
                        this.app.renderer.markDirty();
                    };
                    this.app.history.push({
                        description: `Change ${propName}`,
                        undo: () => {
                            changes.forEach(({ el, old }) => {
                                el[propName] = old;
                                if (el.type === 'text') el.autoSize(this.app.renderer.ctx);
                            });
                            this.app._updateConnectedLines(changes.map(({ el }) => el.id));
                            this.app.renderer.markDirty();
                        },
                        redo: () => applyTextStyle(newState)
                    });
                }
                this.app._updateConnectedLines(changes.map(({ el }) => el.id));
                this.app.renderer.markDirty();
            });
        };
        bindTextStyle('prop-bold', 'isBold');
        bindTextStyle('prop-italic', 'isItalic');
        bindTextStyle('prop-underline', 'isUnderline');
    }

    update() {
        const sel = this.app.selectionManager;
        const selected = editableSelection(sel);
        if (selected.length === 0) {
            this._panel.classList.remove('visible');
            return;
        }
        this._panel.classList.add('visible');

        const el = selected[0];

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

        // Font size row: show for text and markdown
        const fontSizeRow = document.getElementById('font-size-row');
        const fontSizeInput = document.getElementById('prop-font-size');
        const fontSizeValSpan = document.getElementById('prop-font-size-val');
        if (fontSizeRow) {
            if (el.fontSize !== undefined) {
                fontSizeRow.style.display = '';
                if (fontSizeInput) fontSizeInput.value = el.fontSize;
                if (fontSizeValSpan) fontSizeValSpan.textContent = el.fontSize;
            } else {
                fontSizeRow.style.display = 'none';
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
