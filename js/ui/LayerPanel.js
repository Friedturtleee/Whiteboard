import { elementsInFrontOrder } from '../core/ElementOrder.js';
import { i18n } from './I18n.js';

/** Friendly layer names (translated through the i18n dictionary, which has these tool labels). */
const TYPE_NAMES = {
    rectangle: '矩形', circle: '圓形', line: '線段', arrow: '箭頭', text: '文字', markdown: 'Markdown',
    pen: '畫筆', matrix: '矩陣', stack: '堆疊', queue: '佇列', tree: '樹', graph: '圖論'
};
const SNIPPET_LENGTH = 18;
/** Element.label starts out as the English type name; only a different value is a user's rename. */
const DEFAULT_LABELS = new Set(['rectangle', 'circle', 'ellipse', 'line', 'arrow', 'text', 'markdown', 'matrix',
    'pen', 'queue', 'stack', 'tree', 'graph']);
const customLabel = el => el.label && !DEFAULT_LABELS.has(String(el.label).toLowerCase()) ? el.label : '';

/** First non-empty line of text/markdown content, trimmed for the layer list. */
function contentSnippet(el) {
    const raw = el.type === 'text' ? el.text : el.type === 'markdown' ? el.markdownText : '';
    if (typeof raw !== 'string') return '';
    const line = raw.split(/\r?\n/).map(l => l.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean) || '';
    return line.length > SNIPPET_LENGTH ? `${line.slice(0, SNIPPET_LENGTH)}…` : line;
}

/**
 * Readable names for every layer: the user's own label, else the text content, else "<type> <n>"
 * where n counts layers of the same type from the back (only added when there are several).
 */
function buildLayerNames(elements) {
    const totals = new Map();
    const kind = el => el.shapeType || el.type;
    for (const el of elements) totals.set(kind(el), (totals.get(kind(el)) || 0) + 1);
    const seen = new Map();
    const names = new Map();
    for (const el of elements) {
        const k = kind(el);
        const n = (seen.get(k) || 0) + 1;
        seen.set(k, n);
        // I18n deliberately skips .layer-name (it may hold user text), so translate the type name here.
        const base = TYPE_NAMES[k] ? i18n.t(TYPE_NAMES[k]) : k;
        names.set(el, customLabel(el) || contentSnippet(el) || (totals.get(k) > 1 ? `${base} ${n}` : base));
    }
    return names;
}

/**
 * LayerPanel — bottom-right panel for z-order management.
 * Supports multi-select (Ctrl+click) and range-select (Shift+click).
 *
 * update() is called after almost every edit, so it reconciles a keyed row cache instead of rebuilding
 * the list: rows are created once per element, only changed fields touch the DOM, and rows are moved
 * only when the stacking order changed. Scroll position and keyboard focus survive naturally.
 */
export class LayerPanel {
    constructor(app) {
        this.app = app;
        this._list = document.getElementById('layer-list');
        this._panel = document.getElementById('layer-panel');
        this._upButton = document.getElementById('layer-up');
        this._downButton = document.getElementById('layer-down');
        this._rows = new Map();     // element id -> { el, item, parts, state }
        this._dragSrc = null;       // element being dragged (HTML5 DnD or pointer drag)
        this._pointerDrag = null;   // active touch/pen drag session
        this._lastClickedEl = null; // for shift-range select

        this._upButton?.addEventListener('click', () => this._moveSelection('up'));
        this._downButton?.addEventListener('click', () => this._moveSelection('down'));
    }

    // ── Reordering ────────────────────────────────────────────────

    /** Move every selected layer one step toward the front ("up") or back ("down"), keeping their relative order. */
    _moveSelection(direction) {
        const selected = new Set(this.app.selectionManager.selectedElements);
        const elements = this.app.elements;
        if (!selected.size || !elements.some(el => selected.has(el))) return;
        const oldArr = elements.slice();
        let moved = false;
        if (direction === 'up') {
            // Walk from the front so a selected block shifts as one unit and stops at the top.
            for (let i = elements.length - 2; i >= 0; i--) {
                if (selected.has(elements[i]) && !selected.has(elements[i + 1])) {
                    [elements[i], elements[i + 1]] = [elements[i + 1], elements[i]];
                    moved = true;
                }
            }
        } else {
            for (let i = 1; i < elements.length; i++) {
                if (selected.has(elements[i]) && !selected.has(elements[i - 1])) {
                    [elements[i], elements[i - 1]] = [elements[i - 1], elements[i]];
                    moved = true;
                }
            }
        }
        if (moved) {
            this.app.layerManager._reindex();
            this.app.layerManager._pushHistory?.(oldArr);
        }
        this.update();
    }

    /** Drop `source` onto `target`'s slot in the front-to-back list. */
    _reorder(source, target) {
        if (!source || !target || source === target) return;
        const elements = this.app.elements;
        const srcIdx = elements.indexOf(source);
        const dstIdx = elements.indexOf(target);
        if (srcIdx < 0 || dstIdx < 0) return;

        const oldArr = elements.slice();
        elements.splice(srcIdx, 1);
        const newDst = elements.indexOf(target);
        // The panel shows the topmost layer first, so dropping ON an item places the dragged
        // item above it (higher index) when it came from below.
        elements.splice(newDst + (srcIdx > dstIdx ? 1 : 0), 0, source);
        this.app.layerManager._reindex();
        this.app.layerManager._pushHistory?.(oldArr);
        this.update();
    }

    // ── Rendering ─────────────────────────────────────────────────

    update() {
        if (!this._list) return;
        const elements = this.app.elements;
        if (elements.length === 0) {
            if (this._panel) this._panel.style.display = 'none';
            for (const row of this._rows.values()) row.item.remove();
            this._rows.clear();
            return;
        }
        if (this._panel) this._panel.style.display = '';

        const selection = this.app.selectionManager;
        const focused = document.activeElement;
        const focusedInList = this._list.contains(focused) ? focused : null;

        // Front-most layer first.
        const sorted = elementsInFrontOrder(elements);
        const layerNames = buildLayerNames(elements);
        const next = new Map();
        for (const el of sorted) {
            let row = this._rows.get(el.id);
            if (!row || row.el !== el) {
                row?.item.remove();
                row = this._createRow(el);
            }
            this._syncRow(row, el, selection.isSelected(el), layerNames.get(el));
            next.set(el.id, row);
        }
        for (const [id, row] of this._rows) {
            if (next.get(id) !== row) row.item.remove();
        }
        this._rows = next;

        // Put rows in order, moving only the ones that are out of place.
        let cursor = this._list.firstElementChild;
        for (const el of sorted) {
            const item = next.get(el.id).item;
            if (item === cursor) cursor = cursor.nextElementSibling;
            else this._list.insertBefore(item, cursor);
        }
        if (focusedInList && document.activeElement !== focusedInList && focusedInList.isConnected) {
            focusedInList.focus({ preventScroll: true });
        }

        this._syncMoveButtons(elements, selection.selectedElements);
    }

    _syncMoveButtons(elements, selectedElements) {
        if (!this._upButton && !this._downButton) return;
        const selected = new Set(selectedElements);
        const indexes = elements.map((el, i) => selected.has(el) ? i : -1).filter(i => i >= 0);
        const none = indexes.length === 0;
        if (this._upButton) this._upButton.disabled = none || indexes.every((index, i) => index === elements.length - indexes.length + i);
        if (this._downButton) this._downButton.disabled = none || indexes.every((index, i) => index === i);
    }

    _syncRow(row, el, isSelected, layerName = el.label || el.type) {
        const state = row.state;
        const hidden = Boolean(el.hidden);
        const locked = Boolean(el.locked);
        const { item, name, vis, lock, colorDot } = row.parts;

        if (state.selected !== isSelected) {
            state.selected = isSelected;
            item.classList.toggle('selected', isSelected);
            name.setAttribute('aria-pressed', String(isSelected));
        }
        if (state.name !== layerName) {
            state.name = layerName;
            name.textContent = layerName;
            name.title = layerName;
            name.setAttribute('aria-label', `選取 ${layerName}`);
            vis.setAttribute('aria-label', `圖層可見 ${layerName}`);
            lock.setAttribute('aria-label', `圖層鎖定 ${layerName}`);
        }
        if (state.color !== el.color) {
            state.color = el.color;
            colorDot.style.background = el.color;
        }
        if (state.hidden !== hidden) {
            state.hidden = hidden;
            vis.classList.toggle('hidden', hidden);
            vis.textContent = hidden ? '◯' : '◉';
            vis.title = hidden ? '顯示圖層' : '隱藏圖層';
            vis.setAttribute('aria-pressed', String(!hidden));
        }
        if (state.locked !== locked) {
            state.locked = locked;
            lock.textContent = locked ? '🔒' : '🔓';
            lock.title = locked ? '解鎖圖層' : '鎖定圖層';
            lock.setAttribute('aria-pressed', String(locked));
        }
    }

    _createRow(el) {
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.draggable = true;
        item.dataset.elId = el.id;

        const dragHandle = document.createElement('span');
        dragHandle.className = 'layer-drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.title = '拖動排序';
        dragHandle.setAttribute('aria-hidden', 'true');

        const colorDot = document.createElement('span');
        colorDot.className = 'layer-color';

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'layer-name';

        const vis = document.createElement('button');
        vis.type = 'button';
        vis.className = 'layer-visibility';
        vis.addEventListener('click', (e) => {
            e.stopPropagation();
            const oldVal = el.hidden;
            el.hidden = !el.hidden;
            this.app.history.pushPropertyChange(el, 'hidden', oldVal, el.hidden);
            this.app.renderer.markDirty();
            this.update();
        });

        const lock = document.createElement('button');
        lock.type = 'button';
        lock.className = 'layer-lock';
        lock.addEventListener('click', (e) => {
            e.stopPropagation();
            const oldVal = el.locked;
            if (!oldVal) this._cancelEditsForLock(el);
            el.locked = !oldVal;
            if (el.locked) {
                this.app.selectionManager.selectedElements = this.app.selectionManager.selectedElements
                    .filter(selected => selected !== el);
                this.app.propertyPanel.update();
            }
            this.app.history.pushPropertyChange(el, 'locked', oldVal, el.locked);
            this.app.renderer.markDirty();
            this.update();
        });

        item.append(dragHandle, colorDot, name, vis, lock);

        // ── Click to select (with Ctrl/Shift multi-select) ─────────────────
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const sel = this.app.selectionManager;

            if (e.ctrlKey || e.metaKey) {
                // Ctrl+click: toggle this element in selection
                sel.toggleSelect(el);
            } else if (e.shiftKey && this._lastClickedEl) {
                // Shift+click: range select between lastClicked and this
                const allEls = elementsInFrontOrder(this.app.elements);
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

        // ── Drag-to-reorder (mouse: HTML5 drag and drop) ────────────────────
        item.addEventListener('dragstart', (e) => {
            this._dragSrc = el;
            e.dataTransfer.effectAllowed = 'move';
            item.style.opacity = '0.4';
        });
        item.addEventListener('dragend', () => {
            item.style.opacity = '';
            this._clearDragOver();
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this._clearDragOver();
            item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const source = this._dragSrc;
            this._dragSrc = null;
            this._reorder(source, el);
        });

        // ── Drag-to-reorder (touch / pen: pointer events on the handle) ─────
        // HTML5 drag and drop does not fire for touch, so the handle runs its own drag session.
        dragHandle.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' || e.button > 0) return;
            e.preventDefault();
            e.stopPropagation();
            dragHandle.setPointerCapture?.(e.pointerId);
            this._dragSrc = el;
            this._pointerDrag = { id: e.pointerId, target: null, handle: dragHandle };
            item.classList.add('dragging');
        });
        dragHandle.addEventListener('pointermove', (e) => {
            const drag = this._pointerDrag;
            if (!drag || drag.id !== e.pointerId) return;
            this._autoScroll(e.clientY);
            const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.layer-item');
            const target = under && this._list.contains(under)
                ? this._rowElement(under) : null;
            this._clearDragOver();
            drag.target = target && target !== el ? target : null;
            if (drag.target) this._rows.get(drag.target.id)?.item.classList.add('drag-over');
        });
        const finishPointerDrag = (e, commit) => {
            const drag = this._pointerDrag;
            if (!drag || drag.id !== e.pointerId) return;
            this._pointerDrag = null;
            this._dragSrc = null;
            dragHandle.releasePointerCapture?.(e.pointerId);
            item.classList.remove('dragging');
            this._clearDragOver();
            if (commit && drag.target) this._reorder(el, drag.target);
        };
        dragHandle.addEventListener('pointerup', (e) => finishPointerDrag(e, true));
        dragHandle.addEventListener('pointercancel', (e) => finishPointerDrag(e, false));
        dragHandle.addEventListener('click', (e) => e.stopPropagation());

        return {
            el, item,
            parts: { item, name, vis, lock, colorDot },
            state: {}
        };
    }

    _rowElement(itemNode) {
        for (const row of this._rows.values()) if (row.item === itemNode) return row.el;
        return null;
    }

    _clearDragOver() {
        this._list.querySelectorAll('.layer-item.drag-over').forEach(i => i.classList.remove('drag-over'));
    }

    /** Scroll the list while a pointer drag is held near its top or bottom edge. */
    _autoScroll(clientY) {
        const rect = this._list.getBoundingClientRect();
        const edge = 28;
        if (clientY < rect.top + edge) this._list.scrollTop -= 12;
        else if (clientY > rect.bottom - edge) this._list.scrollTop += 12;
    }

    _cancelEditsForLock(element) {
        const transform = this.app.transform;
        const transformTouchesElement = transform?.targetElement === element ||
            transform?.startPositions?.some(position => position.el === element);
        if (transform?.mode && transformTouchesElement) {
            this.app._cancelPointerInteraction?.(this.app._activePointerId ?? null);
        }

        if (this.app._textEditing === element) {
            this.app._finishTextEditing?.(true, true);
        }
        this.app._cancelInlineEditForElement?.(element);
    }
}
