import { ColorPicker, PALETTE_COLORS } from './ColorPicker.js';

/**
 * PropertyPanel — right-side panel for editing element properties.
 */
const EMPTY_CELL = '\u3000';
const isBlankCell = value => value == null || String(value).trim() === '' || value === EMPTY_CELL;
const fmt = n => n.toLocaleString('en-US');
const editableSelection = selectionManager => selectionManager.selectedElements.filter(el => !el.locked);

export class PropertyPanel {
    constructor(app) {
        this.app = app;
        this._panel = document.getElementById('property-panel');
        this._colorGrid = document.getElementById('color-grid');
        this._hint = document.getElementById('prop-range-hint');
        this._invalidFields = new Map();   // input -> message while its value is out of range
        this._bindInputs();
        this._buildColorGrid();
        this._bindSelectionActions();
    }

    /** Shared preset palette (see ColorPicker.js) + the custom "+" swatch. */
    static COLORS = PALETTE_COLORS;

    /** Tools that do not create anything; the colour-only panel is hidden for them. */
    static NON_DRAWING_TOOLS = ['select', 'pan'];

    /** Colour-only mode: only the colour section is shown (see css `#property-panel.color-only`). */
    _setColorOnly(on) {
        this._panel.classList.toggle('color-only', on);
        const title = document.getElementById('property-panel-title');
        if (title) title.textContent = on ? '色彩' : '屬性';
    }

    /** Show / clear the valid-range helper text for a numeric field. */
    _markInvalid(input, invalid, message = '') {
        input.setAttribute('aria-invalid', String(invalid));
        if (invalid) this._invalidFields.set(input, message);
        else this._invalidFields.delete(input);
        if (!this._hint) return;
        const last = [...this._invalidFields.values()].at(-1);
        this._hint.textContent = last || '';
        this._hint.hidden = !last;
    }

    /** Show or hide a property row (rows use the `hidden` attribute, not inline styles). */
    _showRow(id, visible) {
        const row = document.getElementById(id);
        if (row) row.hidden = !visible;
    }

    _buildColorGrid() {
        if (!this._colorGrid) return;
        this._colorGrid.innerHTML = '';
        for (const color of PALETTE_COLORS) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.setAttribute('aria-label', `顏色 ${color}`);
            swatch.setAttribute('aria-pressed', 'false');
            swatch.className = 'color-swatch';
            swatch.style.background = color;
            swatch.dataset.color = color;
            swatch.addEventListener('click', () => {
                this.app.currentColor = color;
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
        const customBtn = document.createElement('button');
        customBtn.type = 'button';
        customBtn.setAttribute('aria-label', '自訂顏色');
        customBtn.setAttribute('aria-pressed', 'false');
        customBtn.className = 'color-swatch color-swatch-custom';
        customBtn.textContent = '+';
        customBtn.title = '自訂顏色';
        customBtn.dataset.color = '#ffffff';
        customBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ColorPicker._openCustomPopup(customBtn, (c) => {
                this.app.currentColor = c;
                customBtn.style.background = c;
                customBtn.style.color = ColorPicker._contrastColor(c);
                customBtn.dataset.color = c;
                this._updateColorSelection(c);
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
        this._colorGrid.appendChild(customBtn);
    }

    _updateColorSelection(activeColor) {
        this._colorGrid.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('selected', s.dataset.color === activeColor);
            s.setAttribute('aria-pressed', String(s.dataset.color === activeColor));
        });
    }

    _bindSelectionActions() {
        const getElement = () => {
            const selected = editableSelection(this.app.selectionManager);
            return selected.length === 1 && !this.app.cloudBoards?.isReadOnly ? selected[0] : null;
        };
        document.getElementById('edit-element-data')?.addEventListener('click', () => {
            const el = getElement();
            if (!el) return;
            if (el.type === 'tree') this.app._showTreeDialog(el);
            else if (el.type === 'graph') this.app._showGraphDialog(el);
            else if (el.type === 'markdown') this.app._showMarkdownDialog(el);
            else if (['matrix', 'stack', 'queue'].includes(el.type)) this.app._showDataStructureDialog(el);
        });
        document.getElementById('edit-selected-cells')?.addEventListener('click', () => {
            const el = getElement();
            if (el?.type !== 'matrix' || !el.selectedCells.size) return;
            if (el.selectedCells.size > 1) this.app._editSelectedMatrixCells(el);
            else {
                const [row, col] = [...el.selectedCells][0].split(',').map(Number);
                this.app._editMatrixCell(el, row, col);
            }
        });
        document.getElementById('clear-selected-cells')?.addEventListener('click', () => {
            const el = getElement();
            if (el?.type !== 'matrix') return;
            // Clearing is undoable, but wiping filled cells by a stray tap deserves a confirmation.
            const filled = [...(el.selectedCells || [])].filter(key => {
                const [row, col] = String(key).split(',').map(Number);
                return !isBlankCell(el.data?.[row]?.[col]);
            }).length;
            if (filled > 0 && !confirm(`清空 ${filled} 個有內容的儲存格？（可用 Ctrl+Z 復原）`)) return;
            this.app._deleteSelectedMatrixCells(el);
            this.app._refreshUI();
        });
    }

    _updateSelectionActions(selected) {
        const section = document.getElementById('selection-actions');
        if (!section) return;
        const el = selected[0];
        const editable = selected.length === 1 && ['matrix', 'stack', 'queue', 'tree', 'graph', 'markdown'].includes(el.type);
        section.hidden = !editable;
        const cells = document.getElementById('matrix-selection-actions');
        cells.hidden = !editable || el.type !== 'matrix';
        if (cells.hidden) return;
        const count = el.selectedCells?.size || 0;
        document.getElementById('selected-cells-status').textContent = count ? `已選取 ${count} 格` : '尚未選取儲存格';
        document.getElementById('edit-selected-cells').disabled = count === 0;
        document.getElementById('clear-selected-cells').disabled = count === 0;
    }

    _bindInputs() {
        const FIELD_LABELS = {
            'prop-x': 'X', 'prop-y': 'Y', 'prop-w': '寬度', 'prop-h': '高度', 'prop-rot': '旋轉角度'
        };
        const bind = (id, prop, transform = v => v) => {
            const el = document.getElementById(id);
            if (!el) return;
            let oldVals = null;
            const fieldLabel = FIELD_LABELS[id] || '數值';
            /** Human-readable valid range, shown as the field tooltip and as helper text when invalid. */
            const rangeMessage = () => {
                if (prop === 'x' || prop === 'y') return `${fieldLabel} 需介於 ${fmt(-100_000_000)} ～ ${fmt(100_000_000)}（含物件${prop === 'x' ? '寬' : '高'}度）`;
                if (prop === 'width' || prop === 'height') {
                    const signed = editableSelection(this.app.selectionManager)
                        .every(item => item.type === 'line' || item.type === 'arrow');
                    return signed
                        ? `${fieldLabel} 絕對值不可超過 ${fmt(10_000_000)}`
                        : `${fieldLabel} 需介於 1 ～ ${fmt(10_000_000)}`;
                }
                if (prop === 'rotation') return `${fieldLabel} 需介於 -360 ～ 360 度`;
                if (prop === 'strokeWidth') return `${fieldLabel} 需介於 0 ～ ${fmt(10_000)}`;
                return `${fieldLabel} 超出允許範圍`;
            };
            if (FIELD_LABELS[id]) el.title = rangeMessage();
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

            const cancelEdit = () => {
                const entries = (oldVals || []).filter(item => !item.el.locked);
                for (const item of entries) {
                    item.el[prop] = item.old;
                    if (prop === 'width' || prop === 'height') {
                        Object.assign(item.el, item.bounds);
                        if (item.points && Array.isArray(item.el.points)) {
                            item.el.points = item.points.map(point => ({ ...point }));
                        }
                        if (item.resizeState && typeof item.el.restoreResizeState === 'function') {
                            item.el.restoreResizeState(item.resizeState);
                        } else item.el.onResize?.(item.bounds.width, item.bounds.height);
                    }
                }
                if (geometryProp) this.app._updateConnectedLines(entries.map(item => item.el.id));
                oldVals = null;
                this._markInvalid(el, false);
                this.app.renderer.markDirty();
                this.update();
            };
            el.addEventListener('pointerdown', startEdit);
            el.addEventListener('focus', startEdit);

            el.addEventListener('input', () => {
                startEdit();
                const val = transform(el.value);
                const empty = el.value.trim() === '';
                const valid = !empty && isValidValue(val);
                this._markInvalid(el, !valid, empty ? `${fieldLabel} 不可留空。${rangeMessage()}` : rangeMessage());
                if (!valid) return;
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
                if (el.value.trim() === '' || !isValidValue(val)) {
                    cancelEdit();
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
                this._markInvalid(el, false);
            });
            // A focus with no value change does not emit change on blur.
            // Release that snapshot before the next object is selected.
            el.addEventListener('blur', () => { oldVals = null; this._markInvalid(el, false); });
            el.addEventListener('keydown', event => {
                if (event.isComposing) return;
                if (event.key === 'Enter') { event.preventDefault(); el.blur(); }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelEdit();
                    el.blur();
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
                btn.setAttribute('aria-pressed', String(newState));
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

    update({ selectionOnly = false } = {}) {
        const sel = this.app.selectionManager;
        const selected = editableSelection(sel);
        this._updateSelectionActions(selected);
        if (selectionOnly) return;
        // Field values are rewritten below, so any stale "out of range" state no longer applies.
        for (const input of this._invalidFields.keys()) input.setAttribute('aria-invalid', 'false');
        this._invalidFields.clear();
        if (this._hint) this._hint.hidden = true;
        if (selected.length === 0) {
            // With a drawing tool active the colour picker stays visible (colour-only mode) so the
            // colour of the next shape can be chosen before drawing. Select / pan hide the panel.
            const tool = this.app.toolbar?.currentTool;
            const drawing = Boolean(tool) && !PropertyPanel.NON_DRAWING_TOOLS.includes(tool);
            this._setColorOnly(drawing);
            this._panel.classList.toggle('visible', drawing);
            if (drawing) this._updateColorSelection(this.app.currentColor);
            return;
        }
        this._setColorOnly(false);
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
            drawStyleRow.hidden = el.drawStyle === undefined;
            if (el.drawStyle !== undefined) drawStyleSelect.value = el.drawStyle;
        }

        // Cell size row: show only for matrix elements
        const cellSizeRow = document.getElementById('cell-size-row');
        const cellSizeInput = document.getElementById('prop-cell-size');
        const cellSizeValSpan = document.getElementById('prop-cell-size-val');
        if (cellSizeRow) {
            cellSizeRow.hidden = el.cellSize === undefined;
            if (el.cellSize !== undefined) {
                if (cellSizeInput) cellSizeInput.value = el.cellSize;
                if (cellSizeValSpan) cellSizeValSpan.textContent = el.cellSize;
            }
        }

        // Font size row: show for text and markdown
        const fontSizeRow = document.getElementById('font-size-row');
        const fontSizeInput = document.getElementById('prop-font-size');
        const fontSizeValSpan = document.getElementById('prop-font-size-val');
        if (fontSizeRow) {
            fontSizeRow.hidden = el.fontSize === undefined;
            if (el.fontSize !== undefined) {
                if (fontSizeInput) fontSizeInput.value = el.fontSize;
                if (fontSizeValSpan) fontSizeValSpan.textContent = el.fontSize;
            }
        }

        this._updateColorSelection(el.color);

        // Stroke width row: hide for text elements
        const strokeWidthRow = document.getElementById('stroke-width-row');
        if (strokeWidthRow) {
            strokeWidthRow.hidden = el.type === 'text';
        }

        // Font family & text styles: show only for text elements
        const fontFamilyRow = document.getElementById('font-family-row');
        const fontSelect = document.getElementById('prop-font-family');
        const textStylesRow = document.getElementById('text-styles-row');
        
        if (fontFamilyRow && textStylesRow) {
            fontFamilyRow.hidden = el.type !== 'text';
            textStylesRow.hidden = el.type !== 'text';
            if (el.type === 'text') {
                if (fontSelect) {
                    const opts = Array.from(fontSelect.options).map(o => o.value);
                    fontSelect.value = opts.includes(el.fontFamily) ? el.fontFamily : opts[0];
                }
                // Update button states
                const setBtn = (id, prop) => {
                    const btn = document.getElementById(id);
                    if (!btn) return;
                    btn.classList.toggle('active', !!el[prop]);
                    btn.setAttribute('aria-pressed', String(!!el[prop]));
                };
                setBtn('prop-bold', 'isBold');
                setBtn('prop-italic', 'isItalic');
                setBtn('prop-underline', 'isUnderline');
            }
        }
    }
}
