/**
 * app.js — Main application entry point.
 * Initialises all subsystems, wires up events, drives the whiteboard.
 */

// ── Canvas & Rendering ─────────────────────────────────
import { Camera } from './canvas/Camera.js';
import { Grid } from './canvas/Grid.js';
import { Renderer } from './canvas/Renderer.js';
import { HitTest } from './canvas/HitTest.js';
import { layoutCanvasCellText, clearCanvasTextCaches, getNodeTextBounds } from './core/CanvasTextFit.js';

// ── Core ────────────────────────────────────────────────
import { SelectionManager } from './core/SelectionManager.js';
import { LayerManager } from './core/LayerManager.js';
import { Transform } from './core/Transform.js';
import { History } from './core/History.js';
import { Serializer } from './core/Serializer.js?v=2';
import { formatDataToken, splitDataTokens } from './core/DataTokens.js?v=2';
import { MATRIX_CLIPBOARD_TYPE, encodeMatrixClipboard, planMatrixPaste } from './core/MatrixClipboard.js';
import { AutosaveStore } from './core/AutosaveStore.js';

// ── Elements ────────────────────────────────────────────
import { ShapeElement } from './elements/ShapeElement.js';
import { TextElement } from './elements/TextElement.js';
import { MatrixElement } from './elements/MatrixElement.js?v=5';
import { StackElement } from './elements/StackElement.js';
import { QueueElement } from './elements/QueueElement.js';
import { PenElement } from './elements/PenElement.js';
import { MermaidElement } from './elements/MermaidElement.js';
import { MarkdownElement } from './elements/MarkdownElement.js';
import { TreeElement } from './tree/TreeElement.js?v=2';
import { GraphElement } from './graph/GraphElement.js';

// ── UI ──────────────────────────────────────────────────
import { Toolbar } from './ui/Toolbar.js';
import { PropertyPanel } from './ui/PropertyPanel.js';
import { LayerPanel } from './ui/LayerPanel.js';
import { TextInputDialog } from './ui/TextInputDialog.js';
import { initInterface } from './ui/Interface.js';
import { bindModal } from './ui/Modal.js';
import { CloudBoards } from './network/CloudBoards.js?v=2';
import { i18n } from './ui/I18n.js';

// ── Tunables ────────────────────────────────────────────
const AUTOSAVE_DELAY_MS = 1200;            // debounce before writing the local snapshot
const CAMERA_CLOUD_SYNC_DELAY_MS = 1500;   // trailing cloud notification for camera-only changes
const CREATE_DRAG_THRESHOLD_PX = 8;        // pointer travel that turns a click into a sized drag
const RUBBER_BAND_CLICK_THRESHOLD_PX = 4;  // below this a rubber band is just a click
const DEFAULT_ZOOM = 1.5;                  // camera zoom displayed as "100%"
const PASTE_OFFSET = 20;                   // world-unit offset for paste / duplicate
const TOAST_DURATION_MS = 2000;
const TOAST_ERROR_MIN_DURATION_MS = 6000;
const DOUBLE_CLICK_CLEANUP_MS = 600;       // creations this recent belong to the double click
const WHEEL_ZOOM_K = 0.01;                 // exp(-delta * k) zoom factor (ctrl+wheel / pinch)
const WHEEL_ZOOM_MAX_DELTA_PX = 25;        // clamp one wheel event so a mouse notch is ~22%
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 200;

// Element type name -> constructor (used by paste and duplicate).
const ELEMENT_TYPE_MAP = {
    rectangle: ShapeElement, circle: ShapeElement, ellipse: ShapeElement,
    line: ShapeElement, arrow: ShapeElement,
    text: TextElement, matrix: MatrixElement, stack: StackElement,
    queue: QueueElement, mermaid: MermaidElement,
    pen: PenElement, tree: TreeElement, graph: GraphElement,
    markdown: MarkdownElement
};

const isEmptyDataStructureInput = value => {
    const text = String(value ?? '');
    return !text.includes('\u3000') && text.trim() === '';
};
const MAX_DATA_STRUCTURE_INPUT_LENGTH = 1_000_000;

function inlineDataInputLength(element, index, value) {
    if (element.type === 'matrix') {
        const data = element.data.map((row, rowIndex) => rowIndex === index.row
            ? row.map((item, colIndex) => colIndex === index.col ? value : item)
            : row);
        return element.getTextFromData(data).length;
    }
    return element.items.map((item, itemIndex) => formatDataToken(
        itemIndex === index ? value : item
    )).join(' ').length;
}

// ═════════════════════════════════════════════════════════
// Application Singleton
// ═════════════════════════════════════════════════════════
export class App {
    constructor() {
        // ── State ───────────────────────────────────────
        this.elements = [];
        this.currentColor = '#e0e0e0';
        this._edgePreview = null;      // { x1,y1,x2,y2 } for live graph-edge feedback
        this._isPanning = false;
        this._activePointerId = null;
        this._isCreating = false;      // drawing a new shape
        this._createStart = null;      // { wx, wy }
        this._creatingElement = null;
        this._lastPanScreen = null;    // { sx, sy }
        this._textEditing = null;      // element being text-edited
        this._inlineEdit = null;
        this._matrixCellSelection = null;
        this._markdownDialogCancel = null;
        this._markdownDialogConfirm = null;
        this._markdownDialogClose = null;
        this._pendingElementDialogElement = null;
        this._isPenDrawing = false;    // freehand pen drawing
        this._penElement   = null;     // pen element currently being drawn
        this._penLastPoint = null;     // last recorded world point
        this._snapPreview = null;      // connection-port snap while dragging a line endpoint
        this._creatingTool = null;     // tool of the shape currently being drag-created
        this._tempRightClickTool = null; // tool to restore after a right-button pan / select
        this._spaceHeld = false;       // Space held down = temporary pan tool
        this._prevTool = null;         // tool to restore when Space is released
        this._releaseSettingsModal = null;
        this._clipboard = null;        // copied element data for Ctrl+V
        this._ctxTarget = null;        // element under the open context menu
        this._pointerDownScreen = null; // { sx, sy } of the active pointer's pointerdown
        this._pointers = new Map();    // active touch pointers: id -> { sx, sy }
        this._pinch = null;            // two-finger pinch/pan gesture state
        this._ignoreLostCapture = new Set(); // pointer ids whose capture we released ourselves
        this._uiRefreshFrame = 0;      // pending rAF handle for throttled UI refresh
        this._recentCreations = [];    // { command, time } of tool-created elements (double-click cleanup)
        this._cameraCloudTimer = null;

        // ── Canvas Setup ────────────────────────────────
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        this._resizeCanvas();

        // ── Subsystems ──────────────────────────────────
        this.camera = new Camera();
        this.grid = new Grid();
        this.selectionManager = new SelectionManager(this);
        this.layerManager = new LayerManager(this);
        this.transform = new Transform(this);
        
        // Restore the local board before the cloud-board controller is attached.
        
        this.history = new History(this);
        this.renderer = new Renderer(this.canvas, this.ctx, this.camera, this.grid, this);

        // ── UI Components ───────────────────────────────
        this.toolbar = new Toolbar(this);
        this.propertyPanel = new PropertyPanel(this);
        this.layerPanel = new LayerPanel(this);
        this.textInputDialog = new TextInputDialog(this);
        initInterface();

        // ── Bind Events ─────────────────────────────────
        // ── Settings ────────────────────────────────────
        this.settings = {
            showGrid: true,
            gridSpacing: 40,
            defaultPenSize: 2,
            defaultPenSmoothing: 3,
            defaultStrokeWidth: 2
        };
        this._loadSettings();

        this._initCamera();
        
        window.appInstance = this;
        this._bindMouse();
        this._bindWheel();
        this._bindKeyboard();
        this._bindMatrixClipboard();
        
        // Ensure web fonts are fully loaded before rendering
        if (document.fonts?.ready) {
            const refreshFonts = () => {
                clearCanvasTextCaches();
                const resized = [];
                for (const el of this.elements) if (el.type === 'text') {
                    el.autoSize(this.ctx);
                    resized.push(el.id);
                }
                if (resized.length) this._updateConnectedLines(resized);
                if (this._textEditing) this._updateTextEditingOverlay();
                this.renderer.markDirty();
            };
            document.fonts.ready.then(refreshFonts);
            document.fonts.addEventListener('loadingdone', refreshFonts);
        }
        this._bindTopBar();
        this._bindContextMenu();
        this._bindResize();
        this._bindSettings();


        // ── Start Render Loop ───────────────────────────
        this.renderer.start();
        this._updateZoomDisplay();

        // ── Autosave ─────────────────────────────────────
        this._autosaveTimer = null;
        this._skipAutosave = false;
        this._autosaveFailed = false;
        this.autosaveStore = new AutosaveStore();
        this.autosaveKey = 'cp_whiteboard_autosave_whiteboard';
        this._tryLoadAutosave();
        this.cloudBoards = new CloudBoards(this);

        this._fetchGitHubVersion();
    }

    // ═════════════════════════════════════════════════════
    // Helpers
    // ═════════════════════════════════════════════════════
    // ═════════════════════════════════════════════════════
    // GitHub Version Tracking
    // ═════════════════════════════════════════════════════
    async _fetchGitHubVersion() {
        const display = document.getElementById('settings-version-display');
        if (!display) return;
        try {
            const response = await fetch('https://api.github.com/repos/Friedturtleee/Whiteboard/tags');
            if (response.ok) {
                const data = await response.json();
                if (data.length > 0) {
                    const latestTag = data[0].name;
                    display.textContent = `CP WhiteBoard ${latestTag}`;
                    
                    // Keep the GitHub URL for clicking
                    display.style.cursor = 'pointer';
                    display.style.textDecoration = 'underline';
                    display.addEventListener('click', () => {
                        window.open(`https://github.com/Friedturtleee/Whiteboard/releases/tag/${latestTag}`, '_blank', 'noopener,noreferrer');
                    });
                } else {
                    display.textContent = 'CP WhiteBoard (Local)';
                }
            } else {
                display.textContent = 'CP WhiteBoard (Local)';
            }
        } catch (e) {
            display.textContent = 'CP WhiteBoard (Local)';
        }
    }

    // ═════════════════════════════════════════════════════
    // Canvas Sizing (HiDPI)
    // ═════════════════════════════════════════════════════
    _resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (w > 0 && h > 0) {
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
        }
    }

    _initCamera() {
        const hw = this.canvas.clientWidth / (2 * this.camera.zoom);
        const hh = this.canvas.clientHeight / (2 * this.camera.zoom);
        this.camera.x = -hw;
        this.camera.y = -hh;
    }

    _bindResize() {
        window.addEventListener('resize', () => {
            this._finishInlineEditing();
            this._resizeCanvas();
            if (this._textEditing) this._updateTextEditingOverlay();
            this.renderer.markDirty();
        });
    }

    // ═════════════════════════════════════════════════════
    // Helper – toast notification
    // ═════════════════════════════════════════════════════
    /**
     * Show a toast. Compatible call shapes:
     *   _toast(msg)  _toast(msg, durationMs)  _toast(msg, 'error')  _toast(msg, 'error', durationMs)
     * Errors use role="alert", stay at least TOAST_ERROR_MIN_DURATION_MS and get a close button.
     * durationMs = Infinity keeps the toast until it is dismissed. Returns the toast element.
     */
    _toast(msg, durationOrType = TOAST_DURATION_MS, typeOrDuration) {
        let type = 'info';
        let duration = TOAST_DURATION_MS;
        for (const arg of [durationOrType, typeOrDuration]) {
            if (typeof arg === 'string') type = arg;
            else if (typeof arg === 'number' && !Number.isNaN(arg)) duration = arg;
        }
        const isError = type === 'error';
        if (isError) duration = Math.max(duration, TOAST_ERROR_MIN_DURATION_MS);
        const persistent = !Number.isFinite(duration);

        let region = document.getElementById('toast-region');
        if (!region) {
            region = document.createElement('div');
            region.id = 'toast-region';
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            document.body.appendChild(region);
        }
        const t = document.createElement('div');
        t.className = isError ? 'toast toast-error' : 'toast';
        if (isError) t.setAttribute('role', 'alert');
        t.style.pointerEvents = 'auto';   // the region itself ignores the pointer
        t.style.cursor = 'pointer';
        const text = document.createElement('span');
        text.textContent = msg;
        t.appendChild(text);
        if (isError) {
            t.style.borderColor = '#e57373';
            const close = document.createElement('button');
            close.type = 'button';
            close.textContent = '×';
            close.setAttribute('aria-label', '關閉通知');
            close.style.cssText = 'margin-left:10px;background:none;border:0;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;';
            t.appendChild(close);
        }
        let timer = null;
        const dismiss = () => { clearTimeout(timer); t.remove(); };
        t.addEventListener('click', dismiss);
        if (persistent) t.style.animation = 'toastSlideIn 0.2s ease';
        else t.style.setProperty('--toast-duration', `${duration}ms`);
        region.appendChild(t);
        while (region.children.length > 3) region.firstElementChild.remove();
        if (!persistent) timer = setTimeout(dismiss, duration + 300);
        return t;
    }

    // ═════════════════════════════════════════════════════
    // Zoom Display
    // ═════════════════════════════════════════════════════
    _updateZoomDisplay() {
        const el = document.getElementById('zoom-display');
        // 150% 實際縮放展示為 100%
        const percent = this.camera.zoom / DEFAULT_ZOOM * 100;
        if (el) el.textContent = (percent < 1 ? percent.toPrecision(2) : Math.round(percent)) + '%';
    }

    _fitView(elements = this.elements) {
        this._finishInlineEditing();
        this._finishTextEditing();
        const present = new Set(this.elements);
        const bounds = elements.filter(el => !el.hidden && present.has(el)).map(el => el.getRotatedBounds());
        if (!bounds.length) return false;
        const minX = Math.min(...bounds.map(b => b.x)), minY = Math.min(...bounds.map(b => b.y));
        const maxX = Math.max(...bounds.map(b => b.x + b.w)), maxY = Math.max(...bounds.map(b => b.y + b.h));
        const viewport = this._getCanvasWorkArea();
        const changed = this.camera.fitBounds({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, viewport);
        if (changed) {
            this._updateZoomDisplay(); this.renderer.markDirty(); this._autosave({ camera: true });
        }
        return changed;
    }

    _getCanvasWorkArea() {
        const canvas = this.canvas.getBoundingClientRect();
        const toolbar = document.getElementById('toolbar').getBoundingClientRect();
        const panels = document.getElementById('right-panels').getBoundingClientRect();
        const topbar = document.getElementById('top-bar').getBoundingClientRect();
        const zoombar = document.getElementById('zoom-bar').getBoundingClientRect();
        const left = Math.max(24, toolbar.right - canvas.left + 20);
        const top = Math.max(24, topbar.bottom - canvas.top + 20);
        const right = Math.min(canvas.width - 24, panels.left - canvas.left - 20);
        const bottom = Math.min(canvas.height - 24, zoombar.top - canvas.top - 20);
        return { x: left, y: top, width: Math.max(24, right - left), height: Math.max(24, bottom - top) };
    }

    // ═════════════════════════════════════════════════════
    // Top Bar Buttons
    // ═════════════════════════════════════════════════════
    _bindTopBar() {
        const $ = id => document.getElementById(id);

        $('btn-undo')?.addEventListener('click', () => { this.history.undo(); this._refreshUI(); });
        $('btn-redo')?.addEventListener('click', () => { this.history.redo(); this._refreshUI(); });
        $('btn-fit-view')?.addEventListener('click', () => this._fitView());

        $('btn-zoom-in')?.addEventListener('click', () => {
            const cx = this.canvas.clientWidth / 2;
            const cy = this.canvas.clientHeight / 2;
            this.camera.zoomAt(1, cx, cy);
            this._updateZoomDisplay();
            this.renderer.markDirty();
            this._autosave({ camera: true });
        });
        $('btn-zoom-out')?.addEventListener('click', () => {
            const cx = this.canvas.clientWidth / 2;
            const cy = this.canvas.clientHeight / 2;
            this.camera.zoomAt(-1, cx, cy);
            this._updateZoomDisplay();
            this.renderer.markDirty();
            this._autosave({ camera: true });
        });
        $('zoom-display')?.addEventListener('click', () => {
            this._finishInlineEditing();
            this.camera.zoomTo(DEFAULT_ZOOM, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
            this._updateZoomDisplay();
            this.renderer.markDirty();
            this._autosave({ camera: true });
        });

        $('btn-export-json')?.addEventListener('click', () => Serializer.exportJSON(this));
        $('btn-export-png')?.addEventListener('click', () => Serializer.exportPNG(this));
        $('btn-cloud-boards')?.addEventListener('click', () => this.cloudBoards?.openPanel());
        $('btn-import-json')?.addEventListener('click', () => $('json-file-input').click());
        $('btn-settings')?.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (!modal) return;
            if (modal.classList.contains('open')) this._closeSettings();
            else {
                this._syncSettingsUI();
                modal.classList.add('open');
                this._releaseSettingsModal = bindModal(document.getElementById('settings-panel'), {
                    onCancel: () => this._closeSettings(),
                    initialFocus: document.getElementById('settings-close')
                });
            }
        });
        $('json-file-input')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (this.cloudBoards?.isCloudBoard) {
                this._toast('請先返回本機白板，再匯入 JSON，以免覆蓋尚未同步的內容。');
                e.target.value = '';
                return;
            }
            // Import replaces the whole board (and clears undo history).
            if (this.elements.length > 0 &&
                !confirm('匯入 JSON 會取代目前白板的所有內容，且無法復原。要繼續嗎？')) {
                e.target.value = '';
                return;
            }
            try {
                this._skipAutosave = true;  // prevent immediate re-save during import
                // loadJSONData validates off-canvas first, so a failure keeps the current board.
                await Serializer.importJSON(this, file);
            } catch (err) {
                this._skipAutosave = false;
                this._toast('匯入失敗：' + err.message, 'error');
                e.target.value = '';
                return;
            }
            this._skipAutosave = false;
            // Importing is an explicit user action: it may replace a locked (corrupt) autosave.
            this.autosaveStore.unlock(this.autosaveKey);
            this._refreshUI();
            // Overwrite the key in place (no removeItem first) so a failed write
            // leaves the previous autosave intact.
            const saved = this._flushAutosave();
            if (saved) this._toast('已匯入');
            else this._toast('匯入完成，但自動儲存失敗。請立即匯出 JSON。', 'error');
            e.target.value = '';
        });
    }

    // ═════════════════════════════════════════════════════
    // Refresh UI panels after state change
    // ═════════════════════════════════════════════════════
    _refreshUI() {
        if (this._uiRefreshFrame) {
            (globalThis.cancelAnimationFrame || clearTimeout)(this._uiRefreshFrame);
            this._uiRefreshFrame = 0;
        }
        this._updatePanels();
        this._autosave();
    }

    /** Refresh panels / zoom label / canvas without scheduling a save. */
    _updatePanels() {
        this.propertyPanel.update();
        this.layerPanel.update();
        this._updateZoomDisplay();
        this._updateHistoryButtons();
        this.renderer.markDirty();
    }

    /** rAF-throttled panel refresh for pointermove (drag / resize / rotate). Never saves. */
    _scheduleUIRefresh() {
        if (this._uiRefreshFrame) return;
        const raf = globalThis.requestAnimationFrame || (fn => setTimeout(fn, 16));
        this._uiRefreshFrame = raf(() => {
            this._uiRefreshFrame = 0;
            this._updatePanels();
        });
    }

    _updateHistoryButtons() {
        // Cloud boards drive these buttons from the shared undo manager.
        if (this.cloudBoards?.isCloudBoard || !this.history) return;
        const readOnly = Boolean(this.cloudBoards?.isReadOnly);
        const undo = document.getElementById('btn-undo');
        const redo = document.getElementById('btn-redo');
        if (undo) undo.disabled = readOnly || this.history.undoStack.length === 0;
        if (redo) redo.disabled = readOnly || this.history.redoStack.length === 0;
    }

    // ═════════════════════════════════════════════════════
    // Screen ↔ World helpers
    // ═════════════════════════════════════════════════════
    _screenPos(e) {
        const r = this.canvas.getBoundingClientRect();
        return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    }

    _worldPos(e) {
        const { sx, sy } = this._screenPos(e);
        return this.camera.screenToWorld(sx, sy);
    }

    // ═════════════════════════════════════════════════════
    // Mouse Events
    // ═════════════════════════════════════════════════════
    _bindMouse() {
        this.canvas.addEventListener('pointerdown', e => this._onPointerDown(e));
        this.canvas.addEventListener('pointermove', e => this._onPointerMove(e));
        this.canvas.addEventListener('pointerup',   e => this._onPointerUp(e));
        this.canvas.addEventListener('pointercancel', e => {
            this._endTouchPointer(e.pointerId);
            this._cancelPointerInteraction(e.pointerId);
        });
        this.canvas.addEventListener('lostpointercapture', e => {
            // Capture we released ourselves on pointerup/cancel is not a lost drag.
            if (this._ignoreLostCapture.delete(e.pointerId)) return;
            this._cancelPointerInteraction(e.pointerId);
        });
        this.canvas.addEventListener('dblclick',     e => this._onDoubleClick(e));

        // Custom context menu (replaces browser default)
        this.canvas.addEventListener('contextmenu', e => this._showContextMenu(e));
    }

    // ────────── Pointer Down ────────────────────────────
    _onPointerDown(e) {
        // Two touch pointers = pinch zoom + pan (allowed on read-only boards too).
        if (e.pointerType === 'touch') {
            const { sx, sy } = this._screenPos(e);
            this._pointers.set(e.pointerId, { sx, sy });
            if (this._pointers.size >= 2) {
                this._beginPinch();
                return;
            }
        }
        if (this._pinch) return;
        if (this.cloudBoards?.isReadOnly && this.toolbar.currentTool !== 'pan' && e.button !== 1) return;
        if (this._activePointerId !== null) return;
        this._activePointerId = e.pointerId;
        try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        const { sx, sy } = this._screenPos(e);
        this._pointerDownScreen = { sx, sy };
        const { x: wx, y: wy } = this._worldPos(e);
        const tool = this.toolbar.currentTool;

        // ── Finish any text editing ────────────────
        this._finishTextEditing();

        // ── Pan tool or middle button ──────────────
        if (tool === 'pan' || e.button === 1) {
            this._isPanning = true;
            this._lastPanScreen = { sx, sy };
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        // ── Right click context ────────────────────
        if (e.button === 2) {
            const hit = HitTest.hitTestAll(this.elements, wx, wy, this.camera);
            if (!hit) {
                // Right click on empty canvas: temporarily toggle between Select and Pan
                this._tempRightClickTool = tool;
                if (tool === 'select') {
                    this.toolbar.setTool('pan');
                    this._isPanning = true;
                    this._lastPanScreen = { sx, sy };
                    this.canvas.style.cursor = 'grabbing';
                } else if (tool === 'pan') {
                    this.toolbar.setTool('select');
                    // Immediately start rubber band for selection
                    this.selectionManager.clear();
                    this.selectionManager.startRubberBand(wx, wy);
                    this._refreshUI();
                }
                return;
            }
            // If hit an element, do nothing here and let contextmenu event handle it
            return;
        }

        // ── Select tool ────────────────────────────
        if (tool === 'select') {
            this._handleSelectDown(wx, wy, e);
            return;
        }

        // ── Drawing tools: shapes / lines / arrows ─
        if (['rectangle', 'circle', 'line', 'arrow'].includes(tool)) {
            this._startCreating(tool, wx, wy, sx, sy);
            return;
        }

        // ── Text tool ──────────────────────────────
        if (tool === 'text') {
            this._createTextAt(wx, wy);
            this.toolbar.setTool('select');
            return;
        }

        // ── Markdown tool ───────────────────────────
        if (tool === 'markdown') {
            this._createMarkdown(wx, wy);
            return;
        }

        // ── Data structures: drag to size ──
        if (['matrix', 'stack', 'queue'].includes(tool)) {
            this._startCreating(tool, wx, wy, sx, sy);
            return;
        }

        // ── Tree/Graph tool: open their native dialogs ──
        if (tool === 'tree') {
            this._createTree(wx, wy);
            return;
        }
        if (tool === 'graph') {
            this._createGraph(wx, wy);
            return;
        }

        // ── Pen tool: freehand drawing ────────────────
        if (tool === 'pen') {
            const penEl = new PenElement(wx, wy);
            this._applyInheritedColor(penEl);
            penEl.strokeWidth = this.settings.defaultPenSize || 2;
            penEl.addPoint(wx, wy);
            this.elements.push(penEl);
            this._isPenDrawing = true;
            this._penElement   = penEl;
            this._penLastPoint = { wx, wy };
            this.renderer.markDirty();
            return;
        }
    }

    // ────────── Pointer Move ────────────────────────────
    _onPointerMove(e) {
        if (e.pointerType === 'touch' && this._pointers.has(e.pointerId)) {
            this._pointers.set(e.pointerId, this._screenPos(e));
            if (this._pinch) {
                this._updatePinch();
                return;
            }
        }
        if (this._pinch) return;
        if (this._activePointerId !== null && e.pointerId !== this._activePointerId) return;
        const { sx, sy } = this._screenPos(e);
        const { x: wx, y: wy } = this._worldPos(e);

        // ── Panning (saved once on pointerup, not per move) ──
        if (this._isPanning) {
            const dx = sx - this._lastPanScreen.sx;
            const dy = sy - this._lastPanScreen.sy;
            this.camera.pan(dx, dy);
            this._lastPanScreen = { sx, sy };
            this._updateZoomDisplay();
            this.renderer.markDirty();
            return;
        }

        // ── Pen drawing ──────────────────────────────
        if (this._isPenDrawing && this._penElement) {
            const minDist = (this.settings.defaultPenSmoothing || 3) / this.camera.zoom;
            const last = this._penLastPoint;
            if (Math.hypot(wx - last.wx, wy - last.wy) >= minDist) {
                this._penElement.addPoint(wx, wy);
                this._penLastPoint = { wx, wy };
                this.renderer.markDirty();
            }
            return;
        }

        // ── Creating shape ─────────────────────────
        if (this._isCreating && this._creatingElement) {
            this.canvas.style.cursor = 'crosshair';
            this._updateCreating(wx, wy, e.shiftKey);
            return;
        }

        // ── Transform (drag / resize / rotate) ─────
        if (this._matrixCellSelection) {
            this._updateMatrixCellSelection(wx, wy);
            return;
        }
        if (this.transform.mode) {
            this.transform.update(wx, wy, e.shiftKey);
            // Compute snap preview for endpoint drag
            if (this.transform.mode === 'endpoint') {
                this._snapPreview = this._findSnapPort(wx, wy, this.transform.targetElement);
                this.renderer.markDirty();
            }
            // Panels refresh at most once per frame; the save happens on pointerup.
            this._scheduleUIRefresh();
            return;
        }

        // ── Rubber-band selection ──────────────────
        if (this.selectionManager.rubberBand) {
            this.selectionManager.updateRubberBand(wx, wy);
            return;
        }

        // ── Edge preview for graph ─────────────────
        if (this._edgePreview) {
            this._edgePreview.x2 = wx;
            this._edgePreview.y2 = wy;
            this.renderer.markDirty();
            return;
        }

        // ── Cursor hint (hover) ────────────────────
        this._updateCursorHover(wx, wy);
    }

    // ────────── Pointer Up ──────────────────────────────
    _onPointerUp(e) {
        if (e.pointerType === 'touch') {
            const wasPinching = Boolean(this._pinch);
            this._endTouchPointer(e.pointerId);
            if (wasPinching) return;
        }
        if (this._activePointerId !== null && e.pointerId !== this._activePointerId) return;
        try {
            this._finishPointerUp(e);
        } finally {
            if (this._activePointerId === e.pointerId) this._activePointerId = null;
        }
    }

    _finishPointerUp(e) {
        const { x: wx, y: wy } = this._worldPos(e);
        if (this._matrixCellSelection) {
            this._updateMatrixCellSelection(wx, wy);
            this._matrixCellSelection = null;
            this.canvas.style.cursor = '';
        }
        this._releaseCapture(e.pointerId);

        // ── Revert temporary right-click tool toggle ──
        if (e.button === 2 && this._tempRightClickTool) {
            this.toolbar.setTool(this._tempRightClickTool);
            this._tempRightClickTool = null;
            if (this._isPanning) {
                this._isPanning = false;
                this._lastPanScreen = null;
                this.canvas.style.cursor = '';
                this._autosave({ camera: true });
            }
            if (this.selectionManager.rubberBand) {
                this._finishRubberBand(e);
                this._refreshUI();
                this.canvas.style.cursor = '';
            }
            return;
        }

        // ── Finish panning ─────────────────────────
        if (this._isPanning) {
            this._isPanning = false;
            this._lastPanScreen = null;
            this.canvas.style.cursor = '';
            this._autosave({ camera: true });
            return;
        }

        // ── Finish pen drawing ─────────────────────
        if (this._isPenDrawing && this._penElement) {
            const el = this._penElement;
            el.addPoint(wx, wy); // capture final position
            if (el.points.length >= 2) {
                if (el.optimize) el.optimize(2 / this.camera.zoom);
                this.layerManager._reindex();
                this._pushCreation(el);
                // A finished stroke is not selected: no handles/box get in the way of the next stroke.
                this.selectionManager.clear();
            } else {
                // Too few points — discard ghost element
                const idx = this.elements.indexOf(el);
                if (idx >= 0) this.elements.splice(idx, 1);
            }
            this._isPenDrawing = false;
            this._penElement   = null;
            this._penLastPoint = null;
            this._refreshUI();
            return;
        }

        // ── Finish creating shape ──────────────────
        if (this._isCreating && this._creatingElement) {
            const { sx, sy } = this._screenPos(e);
            this._finishCreating(wx, wy, e.shiftKey, sx, sy);
            return;
        }

        // ── Finish transform ───────────────────────
        if (this.transform.mode) {
            const info = this.transform.finish();
            if (info) {
                if (info.mode === 'endpoint') {
                    const el = info.element;
                    const snap = this._snapPreview;
                    const originalEndpoint = info._worldEndpoints[info.epIndex];
                    if (snap) {
                        // Snap endpoint to connection port
                        const ep = info._ep;
                        if (typeof el.setEndpointWorld === 'function') {
                            el.setEndpointWorld(info.epIndex, snap);
                        } else if (info.epIndex === 0) {
                            el.x = snap.x; el.y = snap.y;
                            el.width  = ep.p2x - snap.x;
                            el.height = ep.p2y - snap.y;
                        } else {
                            el.x = ep.p1x; el.y = ep.p1y;
                            el.width  = snap.x - ep.p1x;
                            el.height = snap.y - ep.p1y;
                        }
                        el.connections[info.epIndex === 0 ? 'p1' : 'p2'] = {
                            elementId: snap.elementId, portId: snap.portId
                        };
                    } else {
                        const currentEndpoint = el.getEndpointWorld?.(info.epIndex) ??
                            (info.epIndex === 0
                                ? { x: el.x, y: el.y }
                                : { x: el.x + el.width, y: el.y + el.height });
                        el.connections[info.epIndex === 0 ? 'p1' : 'p2'] = null;
                        if (Math.hypot(currentEndpoint.x - originalEndpoint.x,
                            currentEndpoint.y - originalEndpoint.y) < 1e-7) {
                            el.connections.p1 = info._connections.p1 ? { ...info._connections.p1 } : null;
                            el.connections.p2 = info._connections.p2 ? { ...info._connections.p2 } : null;
                        }
                    }

                    const fromState = {
                        x: info._ep.p1x,
                        y: info._ep.p1y,
                        width: info._ep.p2x - info._ep.p1x,
                        height: info._ep.p2y - info._ep.p1y,
                        connections: info._connections
                    };
                    const toState = {
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height,
                        connections: {
                            p1: el.connections.p1 ? { ...el.connections.p1 } : null,
                            p2: el.connections.p2 ? { ...el.connections.p2 } : null
                        }
                    };
                    const sameConnection = (a, b) => a === b || Boolean(a && b &&
                        a.elementId === b.elementId && a.portId === b.portId);
                    const changed = fromState.x !== toState.x || fromState.y !== toState.y ||
                        fromState.width !== toState.width || fromState.height !== toState.height ||
                        !sameConnection(fromState.connections.p1, toState.connections.p1) ||
                        !sameConnection(fromState.connections.p2, toState.connections.p2);
                    const applyEndpoint = state => {
                        el.x = state.x;
                        el.y = state.y;
                        el.width = state.width;
                        el.height = state.height;
                        el.connections.p1 = state.connections.p1 ? { ...state.connections.p1 } : null;
                        el.connections.p2 = state.connections.p2 ? { ...state.connections.p2 } : null;
                        this._updateConnectedLines([el.id]);
                    };
                    if (changed) {
                        this.history.push({
                            description: 'Move line endpoint',
                            undo: () => applyEndpoint(fromState),
                            redo: () => applyEndpoint(toState)
                        });
                    }
                    this._snapPreview = null;
                    this._updateConnectedLines([el.id]);
                    this.renderer.markDirty();
                }
                if (info.mode === 'drag') {
                    const moves = info.elements.filter(m =>
                        m.fromX !== m.toX || m.fromY !== m.toY
                    );
                    if (moves.length) {
                        const movedIds = moves.map(move => move.el.id);
                        this.history.pushMove(moves, () => this._updateConnectedLines(movedIds));
                        // Update any lines connected to moved elements
                        this._updateConnectedLines(movedIds);
                    }
                }
                if (info.mode === 'resize') {
                    this.history.pushResize(
                        info.element,
                        info.fromBounds,
                        info.toBounds,
                        info.fromPoints,
                        info.toPoints,
                        () => this._updateConnectedLines([info.element.id]),
                        info.fromResizeState,
                        info.toResizeState
                    );
                    this._updateConnectedLines([info.element.id]);
                }
                if (info.mode === 'rotate') {
                    this.history.pushRotate(
                        info.element,
                        info.fromRotation,
                        info.toRotation,
                        () => this._updateConnectedLines([info.element.id])
                    );
                    this._updateConnectedLines([info.element.id]);
                }
            }
            this._refreshUI();
            return;
        }

        // ── Finish rubber-band selection ───────────
        if (this.selectionManager.rubberBand) {
            this._finishRubberBand(e);
            this._refreshUI();
            return;
        }

        // ── Finish edge creation ───────────────────
        if (this._edgePreview) {
            this._finishEdgeCreation(wx, wy);
            return;
        }
    }

    // ═════════════════════════════════════════════════════
    // Double Click
    // ═════════════════════════════════════════════════════
    _cancelPointerInteraction(pointerId = null, { preserveCreatedElements = false } = {}) {
        if (pointerId !== null && this._activePointerId !== null &&
            pointerId !== this._activePointerId) return;
        const hasActiveInteraction = this._isPanning || this._isPenDrawing || this._isCreating ||
            this.transform.mode || this.selectionManager.rubberBand || this._edgePreview ||
            this._tempRightClickTool || this._matrixCellSelection;
        if (!hasActiveInteraction) {
            const activePointerId = this._activePointerId;
            this._activePointerId = null;
            this._releaseCapture(activePointerId);
            return;
        }

        if (this._tempRightClickTool) {
            this.toolbar.setTool(this._tempRightClickTool);
            this._tempRightClickTool = null;
        }
        this._isPanning = false;
        this._lastPanScreen = null;
        this.canvas.style.cursor = '';

        if (this._isPenDrawing && this._penElement && !preserveCreatedElements) {
            const index = this.elements.indexOf(this._penElement);
            if (index >= 0) this.elements.splice(index, 1);
        }
        this._isPenDrawing = false;
        this._penElement = null;
        this._penLastPoint = null;

        if (this._isCreating && this._creatingElement && !preserveCreatedElements) {
            const index = this.elements.indexOf(this._creatingElement);
            if (index >= 0) this.elements.splice(index, 1);
        }
        this._isCreating = false;
        this._creatingElement = null;
        this._createStart = null;
        this._creatingTool = null;

        this.transform.cancel();
        if (this.selectionManager.rubberBand) this.selectionManager.rubberBand = null;
        this._edgePreview = null;
        this._matrixCellSelection = null;
        this._snapPreview = null;
        const activePointerId = this._activePointerId;
        this._activePointerId = null;
        this._releaseCapture(activePointerId);
        this.layerManager._reindex();
        this._refreshUI();
    }

    /** Release pointer capture, remembering it was us so lostpointercapture is not a cancel. */
    _releaseCapture(pointerId) {
        if (pointerId === undefined || pointerId === null) return;
        try {
            const held = this.canvas.hasPointerCapture(pointerId);
            this.canvas.releasePointerCapture(pointerId);
            if (held) this._ignoreLostCapture.add(pointerId);
        } catch { /* pointer already gone */ }
    }

    /** A rubber band shorter than the click threshold is a click: clear selection only. */
    _finishRubberBand(e) {
        const sel = this.selectionManager;
        const start = this._pointerDownScreen;
        const { sx, sy } = this._screenPos(e);
        const moved = start ? Math.hypot(sx - start.sx, sy - start.sy) : Infinity;
        if (moved < RUBBER_BAND_CLICK_THRESHOLD_PX) {
            sel.rubberBand = null;
            if (!e.shiftKey) sel.clear();
            this.renderer.markDirty();
        } else {
            sel.finishRubberBand(e.shiftKey);
        }
    }

    // ═════════════════════════════════════════════════════
    // Touch: two-finger pinch zoom + pan
    // ═════════════════════════════════════════════════════
    _pinchMetrics() {
        const ids = this._pinch.ids;
        const a = this._pointers.get(ids[0]);
        const b = this._pointers.get(ids[1]);
        if (!a || !b) return null;
        return {
            mx: (a.sx + b.sx) / 2,
            my: (a.sy + b.sy) / 2,
            dist: Math.max(1, Math.hypot(a.sx - b.sx, a.sy - b.sy))
        };
    }

    _beginPinch() {
        if (this._pinch) return;
        // Drop whatever the first finger had started (drag, pen stroke, creation…).
        this._cancelPointerInteraction();
        this._finishTextEditing();
        const ids = [...this._pointers.keys()].slice(0, 2);
        this._pinch = { ids, mx: 0, my: 0, dist: 1 };
        const m = this._pinchMetrics();
        if (m) Object.assign(this._pinch, m);
    }

    _updatePinch() {
        const m = this._pinchMetrics();
        if (!m) return;
        const p = this._pinch;
        this.camera.pan(m.mx - p.mx, m.my - p.my);
        this._zoomByFactor(m.dist / p.dist, m.mx, m.my);
        Object.assign(p, m);
        this._updateZoomDisplay();
        this.renderer.markDirty();
    }

    _endTouchPointer(pointerId) {
        if (!this._pointers.delete(pointerId)) return;
        if (this._pinch && (this._pinch.ids.includes(pointerId) || this._pointers.size < 2)) {
            this._pinch = null;
            this._autosave({ camera: true });
        }
    }

    /** Multiply the zoom by `factor` keeping the screen point (sx, sy) fixed. */
    _zoomByFactor(factor, sx, sy) {
        if (!Number.isFinite(factor) || factor <= 0) return;
        if (typeof this.camera.zoomByFactor === 'function') this.camera.zoomByFactor(factor, sx, sy);
        else this.camera.zoomTo(this.camera.zoom * factor, sx, sy);
    }

    /** Add the freshly pushed "Add" history record to the double-click cleanup list. */
    _pushCreation(el, options) {
        this.history.pushAdd(this, el, options);
        const stack = this.history.undoStack;
        const now = Date.now();
        this._recentCreations = this._recentCreations
            .filter(record => now - record.time < DOUBLE_CLICK_CLEANUP_MS)
            .concat({ command: stack[stack.length - 1], time: now });
    }

    _onDoubleClick(e) {
        if (this.cloudBoards?.isReadOnly) return;
        if (this.toolbar && this.toolbar.currentTool !== 'select') {
            this.toolbar.setTool('select');
            
            // Undo only the creations made by the clicks of this double-click.
            const now = Date.now();
            const recent = new Set(this._recentCreations
                .filter(record => now - record.time < DOUBLE_CLICK_CLEANUP_MS)
                .map(record => record.command));
            this._recentCreations = [];
            const { undoStack, redoStack } = this.history;
            while (undoStack.length > 0) {
                const cmd = undoStack[undoStack.length - 1];
                if (!recent.has(cmd)) break;
                const before = undoStack.length;
                this.history.undo();
                if (undoStack.length === before) break;   // undo was redirected (cloud) or failed
                if (redoStack[redoStack.length - 1] === cmd) redoStack.pop();   // drop it completely
                recent.delete(cmd);
            }

            // Close dialogs if they were opened by the first click
            if (this.textInputDialog) this.textInputDialog.close();
            this._finishTextEditing();

            this.renderer.markDirty();
            this._refreshUI();
            return;
        }

        const { x: wx, y: wy } = this._worldPos(e);
        const hit = HitTest.hitTestAll(this.elements, wx, wy, this.camera);
        if (!hit) return;

        // ── Text element → inline edit ─────────────
        if (hit.type === 'text') {
            this._startTextEditing(hit);
            return;
        }

        // ── Matrix / Stack / Queue → input dialog ──
        if (['matrix', 'stack', 'queue'].includes(hit.type)) {
            // For matrix: check if a specific cell was double-clicked
            if (hit.type === 'matrix' && hit.hitTestCell) {
                const cell = hit.hitTestCell(wx, wy);
                if (cell) {
                    const key = `${cell.row},${cell.col}`;
                    if (hit.selectedCells?.size > 1 && hit.selectedCells.has(key)) {
                        this._editSelectedMatrixCells(hit);
                        return;
                    }
                    this._editMatrixCell(hit, cell.row, cell.col);
                    return;
                }
            }
            // Stack and queue cells can be edited in place without reopening
            // the full data input dialog.
            if ((hit.type === 'stack' || hit.type === 'queue') && hit.hitTestItem) {
                const index = hit.hitTestItem(wx, wy);
                if (index >= 0) {
                    this._editSequenceItem(hit, index);
                    return;
                }
            }
            this._showDataStructureDialog(hit);
            return;
        }

        // ── Tree → check if node hit first for inline edit, else input dialog ────
        if (hit.type === 'tree') {
            if (hit.root) {
                const treeNode = hit.hitTestNode(wx, wy);
                if (treeNode) {
                    this._editTreeNodeValue(hit, treeNode, wx, wy);
                    return;
                }
                const edgeNode = hit.hitTestEdgeNode(wx, wy);
                if (edgeNode) {
                    this._editTreeEdgeWeight(hit, edgeNode);
                    return;
                }
            }
            this._showTreeDialog(hit);
            return;
        }

        // ── Graph → input dialog ───────────────────
        if (hit.type === 'graph') {
            this._showGraphDialog(hit);
            return;
        }

        // ── Markdown → edit dialog ─────────────────
        if (hit.type === 'markdown') {
            this._showMarkdownDialog(hit);
            return;
        }
    }

    // ═════════════════════════════════════════════════════
    // Select Tool – mousedown logic
    // ═════════════════════════════════════════════════════
    _handleSelectDown(wx, wy, e) {
        const sel = this.selectionManager;

        // 1) Check handle hit on currently selected single element
        if (sel.selectedElements.length === 1) {
            const el = sel.selectedElements[0];
            const handle = HitTest.hitTestHandles(el, wx, wy, this.camera);
            if (handle) {
                if (handle.type === 'endpoint') {
                    this.transform.startEndpoint(wx, wy, handle.index, el);
                    // Disconnect this endpoint while it is being moved.
                    if (handle.index === 0) el.connections.p1 = null;
                    else                    el.connections.p2 = null;
                    this.canvas.style.cursor = 'crosshair';
                    return;
                }
                if (handle.type === 'resize') {
                    this.transform.startResize(wx, wy, handle.index, el);
                } else if (handle.type === 'rotate') {
                    this.transform.startRotate(wx, wy, el);
                }
                this.canvas.style.cursor = handle.cursor || 'crosshair';
                return;
            }
        }

        // 2) Hit test world elements
        const hit = HitTest.hitTestAll(this.elements, wx, wy, this.camera);

        if (hit) {
            // A cell click should select its matrix and the cell in one step.
            // Otherwise the first click only selects/drags the matrix, which
            // makes Ctrl/Shift multi-cell selection appear broken.
            if (hit.type === 'matrix' && !hit.locked && typeof hit.hitTestCell === 'function') {
                const cell = hit.hitTestCell(wx, wy);
                if (cell) {
                    if (!sel.isSelected(hit)) {
                        if (e.shiftKey || e.ctrlKey || e.metaKey) sel.addToSelection(hit);
                        else {
                            this._clearAllCellSelections();
                            sel.select(hit);
                        }
                    }

                    const key = `${cell.row},${cell.col}`;
                    const initialCells = new Set(hit.selectedCells);
                    const anchor = e.shiftKey && hit._lastCellKey
                        ? hit._lastCellKey.split(',').map(Number) : [cell.row, cell.col];
                    if (e.ctrlKey || e.metaKey) {
                        if (hit.selectedCells.has(key)) hit.selectedCells.delete(key);
                        else hit.selectedCells.add(key);
                    } else if (e.shiftKey && hit._lastCellKey) {
                        const [r0, c0] = hit._lastCellKey.split(',').map(Number);
                        for (let r = Math.min(r0, cell.row); r <= Math.max(r0, cell.row); r++) {
                            for (let c = Math.min(c0, cell.col); c <= Math.max(c0, cell.col); c++) {
                                hit.selectedCells.add(`${r},${c}`);
                            }
                        }
                    } else {
                        // Preserve an existing multi-selection when clicking
                        // inside it, so a double-click can open batch editing.
                        if (!hit.selectedCells.has(key)) hit.selectedCells.clear();
                        hit.selectedCells.add(key);
                    }
                    if (!e.shiftKey || !hit._lastCellKey) hit._lastCellKey = key;
                    hit._activeCellKey = key;
                    this._matrixCellSelection = {
                        element: hit, row: anchor[0], col: anchor[1], endKey: key,
                        baseCells: e.ctrlKey || e.metaKey || e.shiftKey ? initialCells : new Set()
                    };
                    this.canvas.style.cursor = 'cell';
                    this._refreshUI();
                    return;
                }
            }

            // ── Cell / item selection for already-selected data structures ──
            if (sel.isSelected(hit) && ['matrix', 'stack', 'queue'].includes(hit.type)) {
                if ((hit.type === 'stack' || hit.type === 'queue') && typeof hit.hitTestItem === 'function') {
                    const idx = hit.hitTestItem(wx, wy);
                    if (idx >= 0) {
                        if (e.ctrlKey || e.metaKey) {
                            if (hit.selectedIndices.has(idx)) hit.selectedIndices.delete(idx);
                            else hit.selectedIndices.add(idx);
                        } else if (e.shiftKey && hit._lastItemIdx >= 0) {
                            for (let i = Math.min(hit._lastItemIdx, idx); i <= Math.max(hit._lastItemIdx, idx); i++) {
                                hit.selectedIndices.add(i);
                            }
                        } else {
                            hit.selectedIndices.clear();
                            hit.selectedIndices.add(idx);
                        }
                        hit._lastItemIdx = idx;
                        this.renderer.markDirty();
                        return; // Don't start drag
                    }
                }
            }

            // ── Graph node drag or edge creation ───
            if (hit.type === 'graph' && hit.hitTestNode) {
                const node = hit.hitTestNode(wx, wy);
                if (node) {
                    if (e.altKey) {
                        // Start edge creation
                        const source = hit.toWorldPoint(
                            hit.x + 20 + node.x,
                            hit.y + 20 + node.y
                        );
                        this._edgePreview = {
                            graphElement: hit,
                            sourceNode: node,
                            x1: source.x,
                            y1: source.y,
                            x2: wx, y2: wy
                        };
                        return;
                    }
                    // Single node drag (handled by transform as drag on the element)
                }
            }

            // ── Tree node click → toggle selection state ─
            if (hit.type === 'tree' && hit.root) {
                const treeNode = hit.hitTestNode(wx, wy);
                if (treeNode) {
                    if (!treeNode.meta) treeNode.meta = {};
                    treeNode.meta.selected = !treeNode.meta.selected;
                    this.renderer.markDirty();
                }
            }

            // Clear cell selections when switching to a different element
            if (!sel.isSelected(hit) && !e.shiftKey) {
                this._clearAllCellSelections();
            }

            // Shift = add to selection; otherwise replace
            if (e.shiftKey) {
                sel.toggleSelect(hit);
            } else if (!sel.isSelected(hit)) {
                sel.select(hit);
            }

            // Start drag
            this.transform.startDrag(wx, wy);
            this.canvas.style.cursor = 'move';
        } else {
            // Click on empty space → clear cell selections and start rubber-band
            this._clearAllCellSelections();
            if (!e.shiftKey) sel.clear();
            sel.startRubberBand(wx, wy);
        }

        this._refreshUI();
    }

    // ═════════════════════════════════════════════════════
    // Cursor hover hint
    // ═════════════════════════════════════════════════════
    _updateCursorHover(wx, wy) {
        if (this.toolbar.currentTool !== 'select') return;

        // Handle hover
        if (this.selectionManager.selectedElements.length === 1) {
            const el = this.selectionManager.selectedElements[0];
            const handle = HitTest.hitTestHandles(el, wx, wy, this.camera);
            if (handle) {
                this.canvas.style.cursor = handle.cursor || 'crosshair';
                return;
            }
        }

        const hit = HitTest.hitTestAll(this.elements, wx, wy, this.camera);
        this.canvas.style.cursor = hit ? 'move' : 'default';
    }

    // ═════════════════════════════════════════════════════
    // Shape Creation (rectangle / circle / line / arrow / matrix / stack / queue / tree / graph)
    // ═════════════════════════════════════════════════════
    _startCreating(tool, wx, wy, screenX = null, screenY = null) {
        this._isCreating = true;
        const screenStart = Number.isFinite(screenX) && Number.isFinite(screenY)
            ? { x: screenX, y: screenY }
            : this.camera.worldToScreen(wx, wy);
        this._createStart = { wx, wy, sx: screenStart.x, sy: screenStart.y };
        this._creatingTool = tool;

        // Build a preview ghost element
        let el;
        if (tool === 'matrix') {
            el = new MatrixElement(wx, wy);
            el.rows = 1; el.cols = 1;
            el._initData(); // resets data and calls _updateSize
        } else if (tool === 'stack') {
            el = new StackElement(wx, wy);
        } else if (tool === 'queue') {
            el = new QueueElement(wx, wy);
        } else if (tool === 'tree') {
            el = new TreeElement(wx, wy);
        } else if (tool === 'graph') {
            el = new GraphElement(wx, wy);
        } else {
            el = new ShapeElement(tool, wx, wy, 0, 0);
        }

        this._applyInheritedColor(el);
        if (el.type !== 'text' && el.type !== 'markdown') {
            el.strokeWidth = this.settings.defaultStrokeWidth || 2;
        }
        this._creatingElement = el;
        this.elements.push(el);
        this.renderer.markDirty();
    }

    _updateCreating(wx, wy, shiftKey = false) {
        const el = this._creatingElement;
        const start = this._createStart;
        const tool = this._creatingTool;

        let rawW = wx - start.wx;
        let rawH = wy - start.wy;

        if (tool === 'line' || tool === 'arrow') {
            el.width = rawW;
            el.height = rawH;
            this.renderer.markDirty();
            return;
        }

        // For all other tools: compute bounding rect
        let w = Math.abs(rawW);
        let h = Math.abs(rawH);

        // Shift → force square (or for matrix: snap to equal aspect)
        if (shiftKey && tool !== 'matrix') {
            const side = Math.max(w, h);
            w = side; h = side;
        }

        // Minimum viable size
        const minSize = 20;
        w = Math.max(minSize, w);
        h = Math.max(minSize, h);

        el.x = rawW >= 0 ? start.wx : start.wx - w;
        el.y = rawH >= 0 ? start.wy : start.wy - h;

        if (tool === 'matrix') {
            // Determine rows/cols from drag size, cell size ~40px
            const cellMin = 28, cellMax = 80, cellIdeal = 40;
            el.cols = Math.max(1, Math.round(w / cellIdeal));
            el.rows = Math.max(1, Math.round(h / cellIdeal));
            if (shiftKey) {
                const side = Math.max(el.rows, el.cols);
                el.rows = side; el.cols = side;
            }
            el.cellSize = Math.max(cellMin, Math.min(cellMax,
                Math.min(Math.floor(w / el.cols), Math.floor(h / el.rows))
            ));
            el._initData(); // resizes data array and calls _updateSize
            // Move the element so top-left stays anchored
            el.x = rawW >= 0 ? start.wx : start.wx - el.width;
            el.y = rawH >= 0 ? start.wy : start.wy - el.height;
        } else if (tool === 'stack') {
            el.width = w;
            el.cellHeight = Math.max(24, w - 8);
            el.height = h;
        } else if (tool === 'queue') {
            el.height = h;
            el.cellWidth = Math.max(24, h - 16);
            el.width = w;
        } else if (tool === 'tree' || tool === 'graph') {
            el.width = w;
            el.height = h;
        } else {
            // Shape (rectangle, circle, ellipse)
            el.width = w;
            el.height = h;
        }

        this.renderer.markDirty();
    }

    _finishCreating(endWx, endWy, shiftKey = false, screenX = null, screenY = null) {
        const el = this._creatingElement;
        const tool = this._creatingTool;
        const startWx = this._createStart.wx;
        const startWy = this._createStart.wy;

        // Preview elements have minimum/default dimensions before the pointer
        // moves, so their bounds cannot distinguish a click from a drag.
        const screenEnd = Number.isFinite(screenX) && Number.isFinite(screenY)
            ? { x: screenX, y: screenY }
            : this.camera.worldToScreen(endWx, endWy);
        const isDrag = Math.hypot(
            screenEnd.x - this._createStart.sx,
            screenEnd.y - this._createStart.sy
        ) > CREATE_DRAG_THRESHOLD_PX;

        if (!isDrag) {
            // Point click: use default sizes
            if (tool === 'line' || tool === 'arrow') {
                el.x = startWx; el.y = startWy;
                el.width = 150; el.height = 0;
            } else if (tool === 'matrix') {
                el.x = startWx; el.y = startWy;
                el.rows = 3; el.cols = 3; el.cellSize = 42;
                el._initData(); // resets data and calls _updateSize
            } else if (tool === 'stack') {
                el.x = startWx; el.y = startWy;
                el.width = 80; el.height = 200; el.cellHeight = 72;
            } else if (tool === 'queue') {
                el.x = startWx; el.y = startWy;
                el.width = 300; el.height = 60; el.cellWidth = 44;
            } else if (tool === 'tree') {
                el.x = startWx; el.y = startWy;
                el.width = 300; el.height = 200;
            } else if (tool === 'graph') {
                el.x = startWx; el.y = startWy;
                el.width = 400; el.height = 350;
            } else {
                el.x = startWx; el.y = startWy;
                el.width = 120; el.height = 80;
            }
        }

        this.layerManager._reindex();
        const opensDataStructureDialog = ['matrix', 'stack', 'queue', 'tree', 'graph'].includes(tool);
        this._pushCreation(el, { discardable: opensDataStructureDialog });
        // Plain shapes stay unselected after drawing; only elements that open an edit dialog are
        // selected (the dialog and property actions operate on the selection).
        if (opensDataStructureDialog) this.selectionManager.select(el);
        else this.selectionManager.clear();
        this._isCreating = false;
        this._creatingElement = null;
        this._createStart = null;
        this._creatingTool = null;

        // For data structures: open dialog after creation
        if (['matrix', 'stack', 'queue', 'tree', 'graph'].includes(tool)) {
            // Force size to 0 so there is no empty collision box visible while typing for the first time
            if (!el.inputText) {
                if (tool === 'tree' || tool === 'graph') {
                    el.buildFromText('', tool === 'graph' ? false : 'values');
                } else {
                    el.setFromText('');
                }
            }
            if (tool === 'tree') this._showTreeDialog(el, true);
            else if (tool === 'graph') this._showGraphDialog(el, true);
            else this._showDataStructureDialog(el, true);
        } else {
            // Keep current tool
        }
        this._refreshUI();
    }

    _deleteElement(el) {
        const idx = this.elements.indexOf(el);
        if (idx >= 0) this.elements.splice(idx, 1);
        this.selectionManager.selectedElements = this.selectionManager.selectedElements.filter(e => e !== el);
        this.layerManager._reindex();
    }

    _discardPendingElementCreation(el) {
        this._deleteElement(el);
        this.history?.discardAdd?.(el);
        this.renderer.markDirty();
    }

    _restoreElementSnapshot(el, snapshot, index) {
        if (!this.elements.includes(el)) {
            this.elements.splice(Math.max(0, Math.min(index, this.elements.length)), 0, el);
        }
        el.deserialize(JSON.parse(JSON.stringify(snapshot)));
        this.layerManager._reindex();
        this._updateConnectedLines([el.id]);
    }

    // ═════════════════════════════════════════════════════
    // Data Structure Cell Selection Helpers
    // ═════════════════════════════════════════════════════

    /** Clear all cell/item selections from every data structure element. */
    _clearAllCellSelections() {
        let dirty = false;
        for (const el of this.elements) {
            if (el.selectedCells && el.selectedCells.size > 0) { el.selectedCells.clear(); dirty = true; }
            if (el.selectedCells) el._lastCellKey = el._activeCellKey = null;
            if (el.selectedIndices && el.selectedIndices.size > 0) { el.selectedIndices.clear(); dirty = true; }
        }
        if (dirty) this.renderer.markDirty();
    }

    _getInheritedColor() {
        const selected = this.selectionManager?.selectedElements || [];
        for (let index = selected.length - 1; index >= 0; index--) {
            const color = selected[index]?.color;
            if (typeof color === 'string' && color) return color;
        }
        return this.currentColor || '#e0e0e0';
    }

    _updateMatrixCellSelection(wx, wy) {
        const drag = this._matrixCellSelection;
        if (!drag) return;
        const el = drag.element;
        if (el.locked || el.hidden || !this.elements.includes(el) || !el.rows || !el.cols) {
            this._matrixCellSelection = null;
            return;
        }
        const point = el.toLocalPoint(wx, wy);
        const row = Math.max(0, Math.min(el.rows - 1, Math.floor((point.y - el.y - 10) / el.cellSize)));
        const col = Math.max(0, Math.min(el.cols - 1, Math.floor((point.x - el.x - 10) / el.cellSize)));
        const key = `${row},${col}`;
        if (key === drag.endKey) return;
        drag.endKey = key;
        el.selectedCells = new Set(drag.baseCells);
        for (let r = Math.min(drag.row, row); r <= Math.max(drag.row, row); r++) {
            for (let c = Math.min(drag.col, col); c <= Math.max(drag.col, col); c++) {
                el.selectedCells.add(`${r},${c}`);
            }
        }
        el._lastCellKey = `${drag.row},${drag.col}`;
        el._activeCellKey = key;
        this.propertyPanel.update({ selectionOnly: true });
        this.renderer.markDirty();
    }

    _applyInheritedColor(element) {
        if (!element) return;
        element.color = this._getInheritedColor();
        this.currentColor = element.color;
    }

    _deleteSelectedMatrixCells(el) {
        if (!el || el.locked) return;
        if (!el.selectedCells || el.selectedCells.size === 0) return;
        const selectedKeys = [...el.selectedCells].filter(key => {
            const [row, col] = String(key).split(',').map(Number);
            return Number.isInteger(row) && Number.isInteger(col) &&
                row >= 0 && row < el.rows && col >= 0 && col < el.cols &&
                Array.isArray(el.data[row]) && col < el.data[row].length;
        });
        if (selectedKeys.length === 0) {
            el.selectedCells.clear();
            return;
        }
        
        const oldData = el.data.map(row => [...row]);
        const oldHighlights = { ...el.highlights };

        // Delete clears only the selected values. Row and column removal is
        // reserved for the explicit grid controls so an empty cell never
        // changes the shape of the matrix.
        for (const key of selectedKeys) {
            const [r, c] = key.split(',').map(Number);
            el.data[r][c] = '';
        }
        el.selectedCells.clear();
        el._lastCellKey = null;
        el.updateTextFromData();

        const newData = el.data.map(row => [...row]);
        const applyMatrixState = (data, highlights) => {
            el.data = data.map(row => [...row]);
            el.highlights = { ...highlights };
            el.selectedCells.clear();
            el._lastCellKey = null;
            el.updateTextFromData();
        };

        this.history.push({
            description: 'Delete matrix cells',
            undo: () => {
                applyMatrixState(oldData, oldHighlights);
                this.renderer.markDirty();
            },
            redo: () => {
                applyMatrixState(newData, oldHighlights);
                this.renderer.markDirty();
            }
        });
        this._refreshUI();
    }

    _editSelectedMatrixCells(el) {
        if (!el || el.type !== 'matrix' || el.locked || this.cloudBoards?.isReadOnly ||
            !el.selectedCells || el.selectedCells.size < 2) return;

        const cells = [...el.selectedCells]
            .map(key => String(key).split(',').map(Number))
            .filter(([row, col]) => Number.isInteger(row) && Number.isInteger(col) &&
                row >= 0 && row < el.rows && col >= 0 && col < el.cols && el.data[row]?.[col] !== undefined)
            .sort(([rowA, colA], [rowB, colB]) => rowA - rowB || colA - colB);
        if (cells.length < 2) return;

        this.textInputDialog.show({
            element: el,
            title: `編輯選取的 ${cells.length} 格`,
            placeholder: `單一值填滿所有選取格；或輸入 ${cells.length} 個值。\n例：1 2 3`,
            onConfirm: text => {
                if (text.length > MAX_DATA_STRUCTURE_INPUT_LENGTH) {
                    return '輸入資料不得超過 1 MB。';
                }
                const values = splitDataTokens(text, { multiline: true });
                if (values.length !== 1 && values.length !== cells.length) {
                    return `輸入 1 個值套用全部，或輸入 ${cells.length} 個值。`;
                }

                return this._applyMatrixCellValues(el, cells, values);
            }
        });
    }

    _applyMatrixCellValues(el, cells, values) {
        const oldData = el.data.map(row => [...row]);
        const newData = oldData.map(row => [...row]);
        cells.forEach(([row, col], index) => {
            newData[row][col] = values.length === 1 ? values[0] : values[index];
        });
        if (cells.every(([row, col]) => oldData[row][col] === newData[row][col])) return null;
        const newText = el.getTextFromData(newData);
        if (newText.length > MAX_DATA_STRUCTURE_INPUT_LENGTH) return '輸入資料不得超過 1 MB。已保留原值。';
        const apply = data => {
            el.data = data.map(row => [...row]); el.updateTextFromData(); this.renderer.markDirty();
        };
        apply(newData);
        this.history.push({
            description: 'Batch Edit Matrix Cells',
            undo: () => apply(oldData), redo: () => apply(newData)
        });
        return null;
    }

    _selectedMatrixWithCells() {
        const selected = this.selectionManager.selectedElements;
        const el = selected.length === 1 ? selected[0] : null;
        if (el?.type !== 'matrix' || el.locked || el.hidden || !el.selectedCells?.size) return null;
        return el;
    }

    _matrixClipboardTarget() {
        const el = this._selectedMatrixWithCells();
        if (!el) return null;
        const cells = [...el.selectedCells].map(key => key.split(',').map(Number))
            .filter(([row, col]) => Number.isInteger(row) && Number.isInteger(col) &&
                row >= 0 && col >= 0 && row < el.rows && col < el.cols)
            .sort(([r1, c1], [r2, c2]) => r1 - r2 || c1 - c2);
        return cells.length ? { el, cells } : null;
    }

    _bindMatrixClipboard() {
        const target = event => {
            if (event.defaultPrevented || this._pendingElementDialogElement ||
                event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return null;
            return this._matrixClipboardTarget();
        };
        for (const type of ['copy', 'cut']) document.addEventListener(type, event => {
            const selected = target(event);
            if (!selected || !event.clipboardData || (type === 'cut' && this.cloudBoards?.isReadOnly)) return;
            const data = encodeMatrixClipboard(selected.el, selected.cells);
            event.clipboardData.setData('text/plain', data.text);
            event.clipboardData.setData(MATRIX_CLIPBOARD_TYPE, data.structured);
            this._clipboard = null;
            event.preventDefault();
            if (type === 'cut') this._deleteSelectedMatrixCells(selected.el);
        });
        document.addEventListener('paste', event => {
            const selected = target(event);
            if (!selected || !event.clipboardData || this.cloudBoards?.isReadOnly) return;
            event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            if (!text) return;
            if (text.length > MAX_DATA_STRUCTURE_INPUT_LENGTH) {
                this._toast('貼上資料不得超過 1 MB。'); return;
            }
            const { el } = selected;
            const plan = planMatrixPaste(el, selected.cells, text, event.clipboardData.getData(MATRIX_CLIPBOARD_TYPE));
            if (plan.error) { this._toast(plan.error); return; }
            const { cells, values } = plan;
            if (!values.length) return;
            const error = this._applyMatrixCellValues(el, cells, values);
            if (error) { this._toast(error); return; }
            el.selectedCells = new Set(cells.map(([r, c]) => `${r},${c}`));
            el._lastCellKey = el._activeCellKey = `${cells[0][0]},${cells[0][1]}`;
            this._refreshUI();
        });
    }

    _navigateMatrixCells(el, event) {
        const deltas = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
        if (!deltas[event.key] && !['Home', 'End', 'Tab'].includes(event.key)) return false;
        const focusKey = [el._activeCellKey, el._lastCellKey].find(key => el.selectedCells.has(key)) || el.selectedCells.values().next().value;
        let [row, col] = focusKey.split(',').map(Number);
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= el.rows || col >= el.cols) return false;
        const previousKey = `${row},${col}`;
        const jump = event.ctrlKey || event.metaKey;
        if (jump && event.key === 'Tab') return false;
        if (deltas[event.key]) {
            const [dr, dc] = deltas[event.key];
            row = jump && dr ? (dr < 0 ? 0 : el.rows - 1) : Math.max(0, Math.min(el.rows - 1, row + dr));
            col = jump && dc ? (dc < 0 ? 0 : el.cols - 1) : Math.max(0, Math.min(el.cols - 1, col + dc));
        } else if (event.key === 'Tab') {
            const index = row * el.cols + col + (event.shiftKey ? -1 : 1);
            if (index < 0 || index >= el.rows * el.cols) return false;
            row = Math.floor(index / el.cols); col = index % el.cols;
        } else {
            col = event.key === 'Home' ? 0 : el.cols - 1;
            if (jump) row = event.key === 'Home' ? 0 : el.rows - 1;
        }
        event.preventDefault();
        const key = `${row},${col}`;
        if (event.shiftKey && event.key !== 'Tab') {
            const anchorKey = el._lastCellKey && el.selectedCells.has(el._lastCellKey) ? el._lastCellKey : previousKey;
            const [anchorRow, anchorCol] = anchorKey.split(',').map(Number);
            el._lastCellKey = anchorKey;
            el.selectedCells.clear();
            for (let r = Math.min(anchorRow, row); r <= Math.max(anchorRow, row); r++) {
                for (let c = Math.min(anchorCol, col); c <= Math.max(anchorCol, col); c++) el.selectedCells.add(`${r},${c}`);
            }
        } else {
            el.selectedCells = new Set([key]); el._lastCellKey = key;
        }
        el._activeCellKey = key;
        const panned = this._revealMatrixCell(el, row, col);
        this.propertyPanel.update({ selectionOnly: true });
        this.renderer.markDirty();
        if (panned) this._autosave();
        return true;
    }

    _revealMatrixCell(el, row, col) {
        const x = el.x + 10 + col * el.cellSize, y = el.y + 10 + row * el.cellSize;
        const points = [[x, y], [x + el.cellSize, y], [x, y + el.cellSize], [x + el.cellSize, y + el.cellSize]]
            .map(([px, py]) => el.toWorldPoint(px, py)).map(p => this.camera.worldToScreen(p.x, p.y));
        const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
        const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
        const area = this._getCanvasWorkArea();
        const shift = (min, max, start, size) => max - min > size ? start + size / 2 - (min + max) / 2
            : min < start ? start - min : max > start + size ? start + size - max : 0;
        const dx = shift(left, right, area.x, area.width), dy = shift(top, bottom, area.y, area.height);
        if (dx || dy) this.camera.pan(dx, dy);
        return Boolean(dx || dy);
    }

    _deleteSelectedItems(el) {
        if (!el || el.locked) return;
        if (!el.selectedIndices || el.selectedIndices.size === 0) return;
        
        const oldItems = [...el.items];
        const oldText = el.inputText;
        const oldHighlights = { ...el.highlights };
        const oldElementIndex = this.elements.indexOf(el);

        // Sort descending so splicing doesn't shift indices
        const indices = [...el.selectedIndices]
            .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < el.items.length)
            .sort((a, b) => b - a);
        if (indices.length === 0) {
            el.selectedIndices.clear();
            el._lastItemIdx = -1;
            return;
        }
        for (const idx of indices) {
            el.items.splice(idx, 1);
        }
        const removed = new Set(indices);
        const nextHighlights = {};
        for (const [key, color] of Object.entries(oldHighlights)) {
            const index = Number(key);
            if (!Number.isInteger(index) || index < 0 || removed.has(index)) continue;
            const shift = indices.reduce((count, removedIndex) =>
                count + (removedIndex < index ? 1 : 0), 0);
            nextHighlights[index - shift] = color;
        }
        el.highlights = nextHighlights;
        el.selectedIndices.clear();
        el._lastItemIdx = -1;
        el._updateSize();
        if (typeof el.updateTextFromData === 'function') {
            el.updateTextFromData();
        } else {
            el.inputText = el.items.join(' ');
        }
        
        const newItems = [...el.items];
        const newText = el.inputText;
        const newHighlights = { ...el.highlights };
        const newPresent = newItems.length > 0;
        const applyItemState = (items, text, highlights, present) => {
            if (present && !this.elements.includes(el)) {
                const index = Math.max(0, Math.min(oldElementIndex, this.elements.length));
                this.elements.splice(index, 0, el);
                this.layerManager._reindex();
            }
            el.items = [...items];
            el.inputText = text;
            el.highlights = { ...highlights };
            el.selectedIndices.clear();
            el._lastItemIdx = -1;
            el._updateSize();
            if (!present) this._deleteElement(el);
        };
        
        this.history.push({
            description: 'Delete items',
            undo: () => {
                applyItemState(oldItems, oldText, oldHighlights, true);
                this.renderer.markDirty();
            },
            redo: () => {
                applyItemState(newItems, newText, newHighlights, newPresent);
                this.renderer.markDirty();
            }
        });
        // Auto-delete element if completely empty
        if (!newPresent) {
            this._deleteElement(el);
            this.selectionManager.selectedElements = this.selectionManager.selectedElements.filter(e => e !== el);
        }
        this.renderer.markDirty();
    }



    // ═════════════════════════════════════════════════════
    // Text Element Creation
    // ═════════════════════════════════════════════════════
    _createTextAt(wx, wy) {
        const el = new TextElement(wx, wy);
        this._applyInheritedColor(el);
        el.autoSize(this.ctx);
        this.elements.push(el);
        this.layerManager._reindex();
        this._pushCreation(el, { discardable: true });
        this.selectionManager.select(el);
        this._startTextEditing(el);
        this._refreshUI();
    }


    // ═════════════════════════════════════════════════════
    // Inline Text Editing
    // ═════════════════════════════════════════════════════
    _updateTextEditingOverlay() {
        if (!this._textEditing) return;
        const el = this._textEditing;
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        const scaleX = (el._baseWidth && el._baseWidth > 0) ? el.width / el._baseWidth : 1;
        const scaleY = (el._baseHeight && el._baseHeight > 0) ? el.height / el._baseHeight : 1;
        const screenTL = this.camera.worldToScreen(el.x, el.y);
        const canvasRect = this.canvas.getBoundingClientRect();
        const zoom = this.camera.zoom;
        const rawLeft = canvasRect.left + screenTL.x;
        const rawTop = canvasRect.top + screenTL.y;
        const baseWidth = el._baseWidth || el.width;
        const baseHeight = el._baseHeight || el.height;
        const sx = scaleX * zoom, sy = scaleY * zoom;
        const cos = Math.cos(el.rotation || 0), sin = Math.sin(el.rotation || 0);
        const a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy;
        const cx = el.width * zoom / 2, cy = el.height * zoom / 2;
        const originX = rawLeft + cx - cos * cx + sin * cy;
        const originY = rawTop + cy - sin * cx - cos * cy;
        // Find the visible text coordinates even when the first line is offscreen
        // and the element is rotated. Moving and scrolling by the same local
        // offset keeps native glyphs aligned with the canvas.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const x of [16, Math.max(16, window.innerWidth - 24)]) {
            for (const y of [16, Math.max(16, window.innerHeight - 24)]) {
                const dx = x - originX, dy = y - originY;
                const localX = (cos * dx + sin * dy) / sx;
                const localY = (-sin * dx + cos * dy) / sy;
                minX = Math.min(minX, localX); maxX = Math.max(maxX, localX);
                minY = Math.min(minY, localY); maxY = Math.max(maxY, localY);
            }
        }
        // Keep native text metrics in the element's unscaled coordinate system.
        // The same transform as the canvas also preserves nonuniform resizing.
        const editorHeight = Math.min(baseHeight + 2, Math.max(el.fontSize * 1.3,
            maxY - Math.max(0, minY)));
        const editorWidth = Math.min(baseWidth + 2, Math.max(el.fontSize * 2,
            maxX - Math.max(0, minX)));
        const cropX = Math.min(Math.max(0, minX), Math.max(0, baseWidth - editorWidth));
        const cropY = Math.min(Math.max(0, minY), Math.max(0, baseHeight - editorHeight));

        overlay.style.left = (originX + a * cropX + c * cropY) + 'px';
        overlay.style.top = (originY + b * cropX + d * cropY) + 'px';
        overlay.style.width = editorWidth + 'px';
        overlay.style.height = editorHeight + 'px';
        overlay.style.fontSize = el.fontSize + 'px';
        overlay.style.lineHeight = '1.3';
        overlay.style.transformOrigin = '0 0';
        overlay.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
        const nextCrop = { x: cropX, y: cropY };
        const previousCrop = this._textEditorViewportOffset || { x: 0, y: 0 };
        overlay.scrollLeft += nextCrop.x - previousCrop.x;
        overlay.scrollTop += nextCrop.y - previousCrop.y;
        this._textEditorViewportOffset = nextCrop;
    }

    _startTextEditing(el) {
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        this._textEditing = el;
        this._textEditorViewportOffset = null;
        el.isEditing = true;

        overlay.style.cssText = '';
        overlay.className = 'text-element-editor';
        overlay.style.display = 'block';
        
        overlay.style.fontFamily = el.fontFamily;
        overlay.style.textAlign = 'left';
        overlay.style.whiteSpace = 'pre';
        overlay.style.color = el.getEffectiveColor(el.color);
        overlay.style.opacity = el.opacity;
        overlay.style.overflow = 'auto';
        overlay.style.overflowWrap = 'normal';
        overlay.style.wordBreak = 'normal';
        overlay.style.letterSpacing = '0px';
        overlay.style.fontKerning = 'auto';
        overlay.style.caretColor = el.color || 'var(--text-primary)';
        
        overlay.style.fontWeight = el.isBold ? 'bold' : 'normal';
        overlay.style.fontStyle = el.isItalic ? 'italic' : 'normal';
        overlay.style.textDecoration = el.isUnderline ? 'underline' : 'none';

        overlay.value = el.text;
        overlay.maxLength = MAX_DATA_STRUCTURE_INPUT_LENGTH;
        this._updateTextEditingOverlay();
        overlay.setAttribute('aria-label', '編輯文字');
        overlay.title = 'Enter 換行 · Ctrl / ⌘ + Enter 完成 · Esc 取消';
        overlay.focus({ preventScroll: true });
        overlay.select();
        overlay.scrollLeft = this._textEditorViewportOffset.x;
        overlay.scrollTop = this._textEditorViewportOffset.y;
        this.renderer.markDirty();

        // Save old text for undo
        this._textEditOld = el.text;

        this._textInputHandler = () => {
            if (this._textEditing) {
                if (overlay.value.length > MAX_DATA_STRUCTURE_INPUT_LENGTH) {
                    overlay.value = overlay.value.slice(0, MAX_DATA_STRUCTURE_INPUT_LENGTH);
                }
                this._textEditing.text = overlay.value;
                this._textEditing.autoSize(this.ctx);
                this._updateConnectedLines([this._textEditing.id]);
                
                this._updateTextEditingOverlay();
                
                this.renderer.markDirty();
            }
        };
        overlay.addEventListener('input', this._textInputHandler);

        overlay.onblur = () => this._finishTextEditing();
        overlay.onkeydown = event => {
            if (event.isComposing) return;
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                this._finishTextEditing();
                this.canvas.focus({ preventScroll: true });
                return;
            }
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            this._finishTextEditing(true);
            overlay.blur();
        };
    }

    _finishTextEditing(cancel = false, preserveEmptyElement = false) {
        if (!this._textEditing) return;
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) {
            this._textEditing.isEditing = false;
            this._textEditing = null;
            this._textInputHandler = null;
            return;
        }

        overlay.removeEventListener('input', this._textInputHandler);

        const el = this._textEditing;
        const newText = overlay.value.slice(0, MAX_DATA_STRUCTURE_INPUT_LENGTH);
        const oldText = this._textEditOld;
        const discardingNewBlankText = el.type === 'text' && !oldText.trim() && !newText.trim();
        const deletesExistingText = el.type === 'text' && !newText.trim() && oldText !== newText;

        if (!cancel && el.text !== newText) {
            el.text = newText;
            el.autoSize(this.ctx);
        }

        if (cancel) {
            el.text = oldText;
            el.autoSize(this.ctx);
        } else if (oldText !== newText && !discardingNewBlankText) {
            const applyText = value => {
                el.text = value;
                el.autoSize(this.ctx);
                this._updateConnectedLines([el.id]);
            };
            if (deletesExistingText) {
                const oldIndex = this.elements.indexOf(el);
                this.history.push({
                    description: 'Delete text',
                    undo: () => {
                        if (!this.elements.includes(el)) {
                            this.elements.splice(Math.max(0, Math.min(oldIndex, this.elements.length)), 0, el);
                            this.layerManager._reindex();
                        }
                        applyText(oldText);
                        this.selectionManager.select(el);
                    },
                    redo: () => {
                        applyText('');
                        this._deleteElement(el);
                    }
                });
            } else {
                this.history.push({
                    description: 'Edit text',
                    undo: () => applyText(oldText),
                    redo: () => applyText(newText)
                });
            }
        }

        overlay.style.display = 'none';
        overlay.onblur = null;
        overlay.onkeydown = null;
        if (document.activeElement === overlay) overlay.blur();
        el.isEditing = false;
        this._textEditing = null;
        this._textInputHandler = null;

        if (!preserveEmptyElement && !el.text.trim() && el.type === 'text') {
            this._deleteElement(el);
            if (!oldText.trim()) this.history.discardAdd?.(el);
        }

        this._updateConnectedLines([el.id]);

        this.propertyPanel?.update();
        this.renderer.markDirty();
        this._autosave();
    }

    // ═════════════════════════════════════════════════════
    // Data Structure Creation & Dialog
    // ═════════════════════════════════════════════════════
    /** Programmatically create a matrix/stack/queue and open its input dialog (also used by browser tests). */
    _createDataStructure(type, wx, wy) {
        let el;
        if (type === 'matrix') el = new MatrixElement(wx, wy);
        else if (type === 'stack') el = new StackElement(wx, wy);
        else el = new QueueElement(wx, wy);
        this._applyInheritedColor(el);
        el.strokeWidth = this.settings.defaultStrokeWidth || 2;
        this.elements.push(el);
        this.layerManager._reindex();
        this._pushCreation(el, { discardable: true });
        this.selectionManager.select(el);
        this._showDataStructureDialog(el, true);
        this._refreshUI();
    }

    _showDataStructureDialog(el, isNew = false) {
        const typeLabel = { matrix: '矩陣', stack: '堆疊', queue: '佇列' }[el.type] || el.type;
        const placeholder = el.type === 'matrix'
            ? '輸入矩陣資料；單一字元會填滿全部格子。'
            : '數值以空格或換行分隔。\n例：1 2 3 4 5';
        const oldText = el.inputText || '';
        const originalState = JSON.parse(JSON.stringify(el.serialize()));
        const originalIndex = this.elements.indexOf(el);
        const restoreOriginal = () => this._restoreElementSnapshot(el, originalState, originalIndex);
        this.textInputDialog.show({
            element: el,
            title: `編輯${typeLabel}`,
            placeholder,
            defaultText: oldText,
            onInput: (text) => {
                if (isEmptyDataStructureInput(text)) return;
                const error = el.setFromText(text);
                if (!error) this._updateConnectedLines([el.id]);
                return error;
            },
            onCancel: () => {
                if (isNew) {
                    this._discardPendingElementCreation(el);
                } else {
                    restoreOriginal();
                    this.selectionManager.clear();
                }
                this.renderer.markDirty();
                this._refreshUI();
            },
            onConfirm: (text) => {
                if (!isNew && text === oldText) {
                    restoreOriginal();
                    this.toolbar.setTool('select');
                    this.renderer.markDirty();
                    this._refreshUI();
                    this._fitView([el]);
                    return;
                }
                const error = el.setFromText(text);
                if (error) {
                    return error;
                }
                if (isEmptyDataStructureInput(text) || (el.width === 0 && el.height === 0)) {
                    if (isNew) {
                        this._discardPendingElementCreation(el);
                    } else {
                        this.history.push({
                            description: `Delete ${el.type}`,
                            undo: restoreOriginal,
                            redo: () => this._deleteElement(el)
                        });
                    }
                    this._deleteElement(el);
                    this.renderer.markDirty();
                    this._refreshUI();
                    return;
                }
                this.toolbar.setTool('select');
                this._updateConnectedLines([el.id]);
                if (oldText !== text) {
                    const newState = JSON.parse(JSON.stringify(el.serialize()));
                    this.history.push({
                        description: `Edit ${el.type}`,
                        undo: restoreOriginal,
                        redo: () => this._restoreElementSnapshot(el, newState, originalIndex)
                    });
                }
                this.renderer.markDirty();
                this._refreshUI();
                this._fitView([el]);
            }
        });
    }

    // ═════════════════════════════════════════════════════
    // Tree Creation & Dialog
    // ═════════════════════════════════════════════════════
    _createTree(wx, wy) {
        const el = new TreeElement(wx, wy);
        this._applyInheritedColor(el);
        el.strokeWidth = this.settings.defaultStrokeWidth || 2;
        this.elements.push(el);
        this.layerManager._reindex();
        this._pushCreation(el, { discardable: true });
        this.selectionManager.select(el);
        this._showTreeDialog(el, true);
        this._refreshUI();
    }

    _showTreeDialog(el, isNew = false) {
        const originalText = el.inputText || '';
        const originalType = el.treeType;
        const originalMode = el.inputMode || 'auto';
        const originalZeroBased = el.zeroBased;
        const originalState = JSON.parse(JSON.stringify(el.serialize()));
        const originalIndex = this.elements.indexOf(el);
        const restoreOriginal = () => this._restoreElementSnapshot(el, originalState, originalIndex);
        this.textInputDialog.show({
            element: el,
            title: '編輯樹',
            placeholder: 'N 後接 N−1 行：u v [w]\n編號預設從 1 起始；0 起始請勾選。單節點亦須指定。\n例：\n4\n1 2\n1 3\n3 4',
            getPlaceholder: ({ mode }) => ({
                rooted: 'N 後接 N−1 行：父節點 子節點 [w]\n例：\n4\n1 2\n1 3\n3 4',
                parent: '每行填父節點編號；根填 0。\n例：\n0\n1\n1\n2',
                edge: '每行輸入 u v [w]；不含節點數。\n例：\n1 2\n1 3\n2 4',
                values: '依序輸入數值，以空格或換行分隔。\n例：5 2 8 1 3 7 9'
            })[mode],
            defaultText: originalText,
            showTypeSelect: true,
            showZeroBasedCheckbox: true,
            zeroBasedModes: ['auto'],
            zeroBased: originalZeroBased,
            types: [
                { value: 'tree', label: '一般樹', selected: el.treeType === 'tree' },
                { value: 'binary', label: '二元樹', selected: el.treeType === 'binary' },
                { value: 'bst', label: 'BST', selected: el.treeType === 'bst' },
                { value: 'avl', label: 'AVL', selected: el.treeType === 'avl' },
                { value: 'rb', label: '紅黑樹', selected: el.treeType === 'rb' },
                ...(el.treeType === 'red-black'
                    ? [{ value: 'red-black', label: '紅黑樹（舊版）', selected: true }]
                    : []),
                { value: 'euler', label: 'Euler Tour', selected: el.treeType === 'euler' }
            ],
            showModeSelect: true,
            mode: el.inputMode || 'auto',
            onInput: (text, type, mode, _directed, zeroBased) => {
                if (!text.trim()) return;
                const prevType = el.treeType;
                if (type) el.treeType = type;
                const error = el.buildFromText(text, mode || 'auto', zeroBased);
                if (!type || error) el.treeType = prevType;
                if (!error) this._updateConnectedLines([el.id]);
                this.renderer.markDirty();
                return error;
            },
            onCancel: () => {
                if (isNew) {
                    this._discardPendingElementCreation(el);
                } else {
                    restoreOriginal();
                    this.selectionManager.clear();
                }
                this.renderer.markDirty();
                this._refreshUI();
            },
            onConfirm: (text, type, mode, _directed, zeroBased) => {
                if (!isNew && originalText === text && originalType === (type || originalType) &&
                    originalMode === (mode || 'auto') &&
                    (originalMode !== 'auto' || originalZeroBased === zeroBased)) {
                    restoreOriginal();
                    this.toolbar.setTool('select');
                    this.renderer.markDirty();
                    this._refreshUI();
                    this._fitView([el]);
                    return;
                }
                const prevType = el.treeType;
                if (type) el.treeType = type;
                const error = text.trim() ? el.buildFromText(text, mode || 'auto', zeroBased) : null;
                if (error) {
                    el.treeType = prevType;
                    return error;
                }
                if (!text.trim() || (el.width === 0 && el.height === 0)) {
                    if (isNew) {
                        this._discardPendingElementCreation(el);
                    } else {
                        this.history.push({
                            description: 'Delete Tree',
                            undo: restoreOriginal,
                            redo: () => this._deleteElement(el)
                        });
                    }
                    this._deleteElement(el);
                    this.renderer.markDirty();
                    this._refreshUI();
                    return;
                }
                this.toolbar.setTool('select');
                const changed = originalText !== text || originalType !== el.treeType ||
                    originalMode !== el.inputMode || originalZeroBased !== el.zeroBased;
                // Preview parsing rebuilds the tree and clears inline overrides.
                // Confirming the original input must retain those edits.
                if (!isNew && !changed) restoreOriginal();
                this._updateConnectedLines([el.id]);
                if (changed) {
                    const newState = JSON.parse(JSON.stringify(el.serialize()));
                    this.history.push({
                        description: 'Edit Tree',
                        undo: restoreOriginal,
                        redo: () => this._restoreElementSnapshot(el, newState, originalIndex)
                    });
                }
                this.renderer.markDirty();
                this._refreshUI();
                this._fitView([el]);
            }
        });
    }

    // ═════════════════════════════════════════════════════
    // Graph Creation & Dialog
    // ═════════════════════════════════════════════════════
    _createGraph(wx, wy) {
        const el = new GraphElement(wx, wy);
        this._applyInheritedColor(el);
        el.strokeWidth = this.settings.defaultStrokeWidth || 2;
        this.elements.push(el);
        this.layerManager._reindex();
        this._pushCreation(el, { discardable: true });
        this.selectionManager.select(el);
        this._showGraphDialog(el, true);
        this._refreshUI();
    }

    _showGraphDialog(el, isNew = false) {
        const originalText = el.inputText || '';
        const originalDirected = el.directed;
        const originalZeroBased = el.zeroBased;
        const originalGraphMode = el.graphMode;
        const originalState = JSON.parse(JSON.stringify(el.serialize()));
        const originalIndex = this.elements.indexOf(el);
        const restoreOriginal = () => this._restoreElementSnapshot(el, originalState, originalIndex);

        this.textInputDialog.show({
            element: el,
            title: '編輯圖',
            placeholder: 'N M 後接 M 行邊：u v [w]\n例：\n4 3\n1 2\n2 3 7\n3 4',
            getPlaceholder: ({ graphMode, zeroBased }) => {
                if (graphMode === 'adj-list') {
                    return 'N 後接 N 行：每行先填 M，再填 M 個鄰點編號。\n例：\n4\n' +
                        (zeroBased ? '2 1 2\n1 0\n2 0 3\n1 2' : '2 2 3\n1 1\n2 1 4\n1 3');
                }
                return 'N M 後接 M 行邊：u v [w]\n例：\n4 3\n' +
                    (zeroBased ? '0 1\n1 2 7\n2 3' : '1 2\n2 3 7\n3 4');
            },
            defaultText: originalText,
            showDirectedCheckbox: true,
            showZeroBasedCheckbox: true,
            showGraphModeSelect: true,
            directed: originalDirected,
            zeroBased: originalZeroBased,
            graphMode: originalGraphMode,
            onInput: (text, _type, _mode, directed, zeroBased, graphMode) => {
                if (!text.trim()) return;
                const error = el.buildFromText(text, directed, zeroBased, graphMode);
                if (!error) this._updateConnectedLines([el.id]);
                this.renderer.markDirty();
                return error;
            },
            onCancel: () => {
                if (isNew) {
                    this._discardPendingElementCreation(el);
                } else {
                    restoreOriginal();
                    this.selectionManager.clear();
                }
                this.renderer.markDirty();
                this._refreshUI();
            },
            onConfirm: (text, _type, _mode, directed, zeroBased, graphMode) => {
                if (!isNew && originalText === text && originalDirected === directed &&
                    originalZeroBased === zeroBased && originalGraphMode === graphMode) {
                    restoreOriginal();
                    this.toolbar.setTool('select');
                    this.renderer.markDirty();
                    this._refreshUI();
                    this._fitView([el]);
                    return;
                }
                const error = el.buildFromText(text, directed, zeroBased, graphMode);
                if (error) return error;
                
                if (!text.trim() || (el.width === 0 && el.height === 0)) {
                    if (isNew) {
                        this._discardPendingElementCreation(el);
                    } else {
                        this.history.push({
                            description: 'Delete Graph',
                            undo: restoreOriginal,
                            redo: () => this._deleteElement(el)
                        });
                    }
                    this._deleteElement(el);
                    this.renderer.markDirty();
                    this._refreshUI();
                    return;
                }
                this.toolbar.setTool('select');
                
                const changed = originalText !== text ||
                    originalDirected !== directed ||
                    originalZeroBased !== zeroBased ||
                    originalGraphMode !== graphMode;
                if (!isNew && !changed) restoreOriginal();
                this._updateConnectedLines([el.id]);
                if (changed) {
                    const newState = JSON.parse(JSON.stringify(el.serialize()));
                    this.history.push({
                        description: 'Edit Graph',
                        undo: restoreOriginal,
                        redo: () => this._restoreElementSnapshot(el, newState, originalIndex)
                    });
                }
                this.renderer.markDirty();
                this._refreshUI();
                this._fitView([el]);
            }
        });
    }

    // ═════════════════════════════════════════════════════
    // Matrix Cell Inline Edit
    // ═════════════════════════════════════════════════════
    _fitCellEditor(overlay, element, width, height, baseFontSize) {
        overlay.setAttribute('aria-label', '編輯儲存格內容');
        overlay.title = 'Enter 完成 · Shift + Enter 換行 · Esc 取消';
        const fit = () => {
            this.ctx.save();
            this.ctx.font = `${baseFontSize}px Consolas, monospace`;
            const layout = layoutCanvasCellText(this.ctx, overlay.value, baseFontSize,
                typeof width === 'function' ? width() : width, typeof height === 'function' ? height() : height);
            this.ctx.restore();
            const zoom = this.camera.zoom;
            overlay.style.fontSize = `${layout.fontSize * zoom}px`;
            overlay.style.lineHeight = `${layout.lineHeight * zoom}px`;
            const editorHeight = Number.parseFloat(overlay.style.height);
            const borders = (Number.parseFloat(overlay.style.borderTopWidth) || 0) +
                (Number.parseFloat(overlay.style.borderBottomWidth) || 0);
            overlay.style.paddingTop = `${Math.max(0, (editorHeight - borders - layout.height * zoom) / 2)}px`;
            overlay.style.paddingBottom = '0';
            overlay.scrollLeft = overlay.scrollTop = 0;
        };
        overlay.style.whiteSpace = 'pre';
        overlay.style.overflowWrap = 'normal';
        overlay.style.color = element.getEffectiveColor(element.color);
        overlay.style.opacity = element.opacity;
        overlay.oninput = fit;
        fit();
        return fit;
    }

    _editMatrixCell(matrixEl, row, col) {
        if (!matrixEl || matrixEl.locked || this.cloudBoards?.isReadOnly ||
            !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= matrixEl.rows || col >= matrixEl.cols) return;
        if (this._inlineEdit) this._inlineEdit.finish();
        matrixEl.selectedCells = new Set([`${row},${col}`]);
        matrixEl._lastCellKey = matrixEl._activeCellKey = `${row},${col}`;
        if (this._revealMatrixCell(matrixEl, row, col)) this._autosave();
        this.propertyPanel.update({ selectionOnly: true });
        this.renderer.markDirty();
        const pad = 10;
        const cellCenter = matrixEl.toWorldPoint(
            matrixEl.x + pad + (col + 0.5) * matrixEl.cellSize,
            matrixEl.y + pad + (row + 0.5) * matrixEl.cellSize
        );
        const cellScreen = this.camera.worldToScreen(cellCenter.x, cellCenter.y);
        const cellSizeScreen = matrixEl.cellSize * this.camera.zoom;

        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        overlay.style.cssText = '';
        overlay.className = '';
        
        // Style to match the matrix cell exactly (no visible "floating" box)
        const cellColor = matrixEl.color || '#e0e0e0';
        overlay.style.display = 'block';
        const canvasRect = this.canvas.getBoundingClientRect();
        overlay.style.left = `${canvasRect.left + cellScreen.x - cellSizeScreen / 2}px`;
        overlay.style.top = `${canvasRect.top + cellScreen.y - cellSizeScreen / 2}px`;
        overlay.style.width = cellSizeScreen + 'px';
        overlay.style.height = cellSizeScreen + 'px';
        overlay.style.fontSize = (matrixEl.fontSize * this.camera.zoom) + 'px';
        overlay.style.textAlign = 'center';
        overlay.style.lineHeight = cellSizeScreen + 'px';
        overlay.style.padding = '0';
        overlay.style.background = 'rgba(50,50,50,0.98)';
        overlay.style.color = cellColor;
        overlay.style.fontFamily = 'Consolas, monospace';
        overlay.style.border = `1.5px solid ${cellColor}`;
        overlay.style.boxSizing = 'border-box';
        overlay.style.transformOrigin = 'center center';
        const textAngle = Math.abs(Math.sin(matrixEl.rotation)) > Math.abs(Math.cos(matrixEl.rotation))
            ? Math.PI / 2 : 0;
        overlay.style.transform = `rotate(${textAngle}rad)`;
        overlay.maxLength = MAX_DATA_STRUCTURE_INPUT_LENGTH;
        // Strip full-width space sentinel when entering edit mode
        const rawVal = String(matrixEl.data[row]?.[col] ?? '');
        overlay.value = (rawVal === '' || rawVal === '\u3000') ? '' : rawVal;
        this._fitCellEditor(overlay, matrixEl, matrixEl.cellSize - 8, matrixEl.cellSize - 8, matrixEl.fontSize);
        overlay.focus();
        overlay.select();

        const oldValue = matrixEl.data[row]?.[col];

        const resetOverlayStyle = () => {
            overlay.style.lineHeight = '';
            overlay.style.padding = '';
            overlay.style.background = '';
            overlay.style.color = '';
            overlay.style.fontFamily = '';
            overlay.style.border = '';
            overlay.style.boxSizing = '';
            overlay.style.textAlign = '';
            overlay.style.transformOrigin = '';
            overlay.style.transform = '';
        };

        let finished = false;
        const finishEdit = (cancelled = false) => {
            if (finished) return;
            finished = true;
            if (this._inlineEdit?.overlay === overlay) this._inlineEdit = null;
            const editedValue = overlay.value;
            const originalValue = oldValue == null || oldValue === '\u3000'
                ? ''
                : String(oldValue);
            let newValue = cancelled || originalValue === editedValue ? oldValue : editedValue;
            if (newValue !== oldValue && inlineDataInputLength(
                matrixEl, { row, col }, newValue
            ) > MAX_DATA_STRUCTURE_INPUT_LENGTH) {
                this._toast('輸入資料不得超過 1 MB。已保留原值。', 4000);
                newValue = oldValue;
            }
            if (matrixEl.data[row]) {
                matrixEl.data[row][col] = newValue;
                if (matrixEl.updateTextFromData) matrixEl.updateTextFromData();
            }
            overlay.style.display = 'none';
            resetOverlayStyle();
            overlay.onblur = null;
            overlay.oninput = null;
            overlay.onkeydown = null;
            if (document.activeElement === overlay) overlay.blur();
            if (oldValue !== newValue) {
                const applyValue = value => {
                    if (!matrixEl.data[row]) return;
                    matrixEl.data[row][col] = value;
                    matrixEl.updateTextFromData();
                    matrixEl._updateSize();
                };
                this.history.push({
                    description: 'Edit Matrix Cell',
                    undo: () => { applyValue(oldValue); this.renderer.markDirty(); },
                    redo: () => { applyValue(newValue); this.renderer.markDirty(); }
                });
            }
            this.renderer.markDirty();
        };

        this._inlineEdit = {
            element: matrixEl,
            overlay,
            finish: finishEdit,
            cancel: () => finishEdit(true)
        };

        // The browser passes a FocusEvent to onblur; do not let it be treated
        // as the boolean cancellation flag accepted by finishEdit.
        overlay.onblur = () => finishEdit(false);
        overlay.onkeydown = (e) => {
            if (e.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); overlay.blur(); }
            if (e.key === 'Escape') { e.preventDefault(); finishEdit(true); }
            // Tab to next cell
            if (e.key === 'Tab') {
                e.preventDefault();
                finishEdit();
                let nextCol = col + (e.shiftKey ? -1 : 1);
                let nextRow = row;
                if (nextCol >= matrixEl.cols) { nextCol = 0; nextRow++; }
                if (nextCol < 0) { nextCol = matrixEl.cols - 1; nextRow--; }
                if (nextRow >= 0 && nextRow < matrixEl.rows) {
                    this._editMatrixCell(matrixEl, nextRow, nextCol);
                }
            }
        };
    }

    // ═════════════════════════════════════════════════════
    // Stack / Queue Item Inline Edit
    // ═════════════════════════════════════════════════════
    _editSequenceItem(element, index) {
        if (!element || !['stack', 'queue'].includes(element.type) ||
            !Number.isInteger(index) || index < 0 || index >= element.items.length) return;
        if (this._inlineEdit) this._inlineEdit.finish();

        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        let cell;
        if (element.type === 'stack') {
            const visibleCount = Math.min(element.items.length, element.maxDisplay);
            const firstVisibleIndex = element.items.length - visibleCount;
            const slot = index - firstVisibleIndex;
            if (slot < 0 || slot >= visibleCount) return;
            cell = {
                x: element.x + 8,
                y: element.y + element.height - 8 - (slot + 1) * element.cellHeight,
                width: element.width - 16,
                height: element.cellHeight
            };
        } else {
            if (index >= element.maxDisplay) return;
            cell = {
                x: element.x + 8 + index * element.cellWidth,
                y: element.y + 8,
                width: element.cellWidth,
                height: element.cellWidth
            };
        }

        const center = element.toWorldPoint(
            cell.x + cell.width / 2,
            cell.y + cell.height / 2
        );
        const screen = this.camera.worldToScreen(center.x, center.y);
        const canvasRect = this.canvas.getBoundingClientRect();
        const width = cell.width * this.camera.zoom;
        const height = cell.height * this.camera.zoom;
        const oldValue = element.items[index];
        const oldText = oldValue == null || oldValue === '\u3000' ? '' : String(oldValue);

        overlay.style.cssText = '';
        overlay.className = '';
        overlay.style.display = 'block';
        overlay.style.left = `${canvasRect.left + screen.x - width / 2}px`;
        overlay.style.top = `${canvasRect.top + screen.y - height / 2}px`;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;
        overlay.style.boxSizing = 'border-box';
        overlay.style.padding = '0 3px';
        overlay.style.textAlign = 'center';
        overlay.style.lineHeight = `${height}px`;
        overlay.style.fontFamily = 'Consolas, monospace';
        overlay.style.fontSize = `${Math.max(8, element.fontSize * this.camera.zoom)}px`;
        overlay.style.background = 'rgba(50,50,50,0.98)';
        overlay.style.color = element.color || '#e0e0e0';
        overlay.style.border = `1.5px solid ${element.color || '#e0e0e0'}`;
        overlay.style.outline = 'none';
        overlay.style.transformOrigin = 'center center';
        overlay.style.transform = element.rotation ? `rotate(${element.rotation}rad)` : 'none';
        overlay.maxLength = MAX_DATA_STRUCTURE_INPUT_LENGTH;
        overlay.value = oldText;
        const innerWidth = cell.width - (element.type === 'queue' ? 6 : 0);
        const innerHeight = cell.height - (element.type === 'stack' ? 6 : 0);
        const baseSize = Math.max(8, Math.min(element.fontSize, innerWidth * 0.6, innerHeight * 0.5, 36));
        this._fitCellEditor(overlay, element, innerWidth, innerHeight, baseSize);
        overlay.focus();
        overlay.select();

        const applyValue = value => {
            if (index >= element.items.length) return;
            element.items[index] = value;
            element.updateTextFromData();
            element._updateSize();
        };
        let cancelled = false;
        let finished = false;
        const finishEdit = () => {
            if (finished) return;
            finished = true;
            if (this._inlineEdit?.overlay === overlay) this._inlineEdit = null;
            const enteredValue = overlay.value;
            let newValue = cancelled || enteredValue === oldText ? oldValue : enteredValue;
            if (newValue !== oldValue && inlineDataInputLength(element, index, newValue) >
                MAX_DATA_STRUCTURE_INPUT_LENGTH) {
                this._toast('輸入資料不得超過 1 MB。已保留原值。', 4000);
                newValue = oldValue;
            }
            applyValue(newValue);
            overlay.style.display = 'none';
            overlay.style.transform = '';
            overlay.onblur = null;
            overlay.oninput = null;
            overlay.onkeydown = null;
            if (document.activeElement === overlay) overlay.blur();
            if (oldValue !== newValue) {
                this.history.push({
                    description: `Edit ${element.type} Item`,
                    undo: () => { applyValue(oldValue); this.renderer.markDirty(); },
                    redo: () => { applyValue(newValue); this.renderer.markDirty(); }
                });
                this._autosave();
            }
            this.renderer.markDirty();
        };

        this._inlineEdit = {
            element,
            overlay,
            finish: finishEdit,
            cancel: () => {
                cancelled = true;
                overlay.value = oldText;
                finishEdit();
            }
        };
        overlay.onblur = finishEdit;
        overlay.onkeydown = event => {
            if (event.isComposing) return;
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                overlay.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelled = true;
                overlay.value = oldText;
                overlay.blur();
            } else if (event.key === 'Tab') {
                event.preventDefault();
                const nextIndex = index + (event.shiftKey ? -1 : 1);
                finishEdit();
                if (nextIndex >= 0 && nextIndex < element.items.length) {
                    this._editSequenceItem(element, nextIndex);
                }
            }
        };
    }

    // ═════════════════════════════════════════════════════
    // Tree Node Inline Value Edit
    // ═════════════════════════════════════════════════════
    _editTreeNodeValue(treeEl, treeNode, wx, wy) {
        if (this._inlineEdit) this._inlineEdit.finish();
        const nodePath = treeEl.getNodePath(treeNode);
        if (!nodePath) return;
        const { offsetX, offsetY } = treeEl._getCurrentOffsets();
        const nodeWorldPos = treeEl.toWorldPoint(
            treeNode.x + offsetX,
            treeNode.y + offsetY
        );
        const nodeScreenPos = this.camera.worldToScreen(nodeWorldPos.x, nodeWorldPos.y);
        const canvasRect = this.canvas.getBoundingClientRect();
        const r = treeEl.nodeRadius * this.camera.zoom;
        const fontSize = 13 * this.camera.zoom;

        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        treeEl.isEditingNode = true;
        treeEl._editingNodeReference = treeNode;
        overlay.style.cssText = '';
        overlay.className = '';
        
        overlay.style.display = 'block';
        overlay.style.left = (canvasRect.left + nodeScreenPos.x - r) + 'px';
        overlay.style.top = (canvasRect.top + nodeScreenPos.y - r) + 'px';
        overlay.style.width = (r * 2) + 'px';
        overlay.style.height = (r * 2) + 'px';
        overlay.style.boxSizing = 'border-box';
        overlay.style.padding = '0';
        overlay.style.fontFamily = 'Consolas, monospace';
        overlay.style.fontSize = fontSize + 'px';
        overlay.style.lineHeight = '1.3';
        overlay.style.textAlign = 'center';
        overlay.style.background = 'transparent';
        overlay.style.color = 'transparent';
        overlay.style.caretColor = 'var(--text-primary, #fff)';
        overlay.style.border = 'none';
        overlay.style.outline = 'none';
        overlay.style.transformOrigin = 'center center';
        overlay.style.transform = treeEl.rotation ? `rotate(${treeEl.rotation}rad)` : 'none';
        overlay.maxLength = MAX_DATA_STRUCTURE_INPUT_LENGTH;
        overlay.value = String(treeNode.value);
        const fitEditor = this._fitCellEditor(overlay, treeEl,
            () => getNodeTextBounds(overlay.value, treeEl.nodeRadius).width,
            () => getNodeTextBounds(overlay.value, treeEl.nodeRadius).height, 13);
        overlay.focus({ preventScroll: true });
        overlay.select();
        this.renderer.markDirty();

        const oldValue = treeNode.value;
        const oldOverrides = { ...treeEl._nodeValueOverrides };
        let cancelled = false;
        let finished = false;
        const applyNodeValue = value => {
            const currentNode = treeEl.getNodeAtPath(nodePath);
            if (currentNode) treeEl.setNodeValue(currentNode, value);
        };
        const updatePreview = () => {
            if (overlay.value.length > MAX_DATA_STRUCTURE_INPUT_LENGTH) {
                overlay.value = overlay.value.slice(0, MAX_DATA_STRUCTURE_INPUT_LENGTH);
            }
            applyNodeValue(overlay.value);
            fitEditor();
            this.renderer.markDirty();
        };

        const finishEdit = () => {
            if (finished) return;
            finished = true;
            if (this._inlineEdit?.overlay === overlay) this._inlineEdit = null;
            const newValue = cancelled || !overlay.value.trim() || overlay.value === String(oldValue) ? oldValue : overlay.value;
            applyNodeValue(newValue);
            if (oldValue === newValue) treeEl._nodeValueOverrides = { ...oldOverrides };
            const newOverrides = { ...treeEl._nodeValueOverrides };
            treeEl.isEditingNode = false;
            treeEl._editingNodeReference = null;
            overlay.style.display = 'none';
            overlay.onblur = null;
            overlay.oninput = null;
            overlay.onkeydown = null;
            if (document.activeElement === overlay) overlay.blur();
            if (oldValue !== newValue) {
                this.history.push({
                    description: 'Edit Tree Node',
                    undo: () => {
                        applyNodeValue(oldValue); treeEl._nodeValueOverrides = { ...oldOverrides }; this.renderer.markDirty();
                    },
                    redo: () => {
                        applyNodeValue(newValue); treeEl._nodeValueOverrides = { ...newOverrides }; this.renderer.markDirty();
                    }
                });
                this._autosave();
            }
            this.renderer.markDirty();
        };

        this._inlineEdit = {
            element: treeEl,
            overlay,
            finish: finishEdit,
            cancel: () => {
                cancelled = true;
                overlay.value = String(oldValue);
                finishEdit();
            }
        };

        overlay.oninput = updatePreview;
        overlay.onblur = finishEdit;
        overlay.onkeydown = (e) => {
            if (e.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); overlay.blur(); }
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelled = true;
                overlay.value = String(oldValue);
                overlay.blur();
            }
        };
    }

    _editTreeEdgeWeight(treeEl, edgeNode) {
        if (this._inlineEdit) this._inlineEdit.finish();
        const parentNode = edgeNode?.parent;
        if (!parentNode) return;
        const nodePath = treeEl.getNodePath(edgeNode);
        if (!nodePath || nodePath === 'r') return;

        const { offsetX, offsetY } = treeEl._getCurrentOffsets();
        const edgeMidpoint = treeEl.toWorldPoint(
            (parentNode.x + edgeNode.x) / 2 + offsetX,
            (parentNode.y + edgeNode.y) / 2 + offsetY
        );
        const screenPos = this.camera.worldToScreen(edgeMidpoint.x, edgeMidpoint.y);
        const canvasRect = this.canvas.getBoundingClientRect();
        const zoom = this.camera.zoom;
        const fontSize = 11 * zoom;
        const oldWeight = edgeNode.meta?.edgeWeight == null
            ? null
            : String(edgeNode.meta.edgeWeight);
        const oldHasWeights = treeEl.hasWeights;
        const oldWeightOverrides = { ...treeEl._edgeWeightOverrides };
        const applyEdgeWeight = value => {
            const currentNode = treeEl.getNodeAtPath(nodePath);
            if (currentNode) treeEl.setEdgeWeight(currentNode, value ?? '');
            this._updateConnectedLines([treeEl.id]);
        };
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        treeEl.isEditingEdge = true;
        treeEl.hasWeights = true;
        const getEditorWidth = value => Math.max(fontSize * 0.7, (value.length || 1) * fontSize * 0.7);
        const sizeEditor = value => {
            const width = getEditorWidth(value);
            overlay.style.left = `${canvasRect.left + screenPos.x - width / 2}px`;
            overlay.style.width = `${width}px`;
        };
        overlay.style.cssText = '';
        overlay.className = 'transparent-selection';
        overlay.style.display = 'block';
        overlay.style.top = `${canvasRect.top + screenPos.y - fontSize * 0.68}px`;
        overlay.style.height = `${fontSize * 1.36}px`;
        overlay.style.boxSizing = 'border-box';
        overlay.style.padding = '0';
        overlay.style.fontFamily = 'Consolas, monospace';
        overlay.style.fontSize = `${fontSize}px`;
        overlay.style.lineHeight = '1.3';
        overlay.style.textAlign = 'center';
        overlay.style.background = 'transparent';
        overlay.style.color = 'transparent';
        overlay.style.caretColor = 'var(--text-primary, #fff)';
        overlay.style.border = 'none';
        overlay.style.outline = 'none';
        overlay.style.transformOrigin = 'center center';
        overlay.style.transform = treeEl.rotation ? `rotate(${treeEl.rotation}rad)` : 'none';
        overlay.maxLength = 64;
        overlay.value = oldWeight ?? '';
        sizeEditor(overlay.value);

        let cancelled = false;
        let finished = false;
        const updatePreview = () => {
            const value = overlay.value.trim();
            const valid = value === '' || Number.isFinite(Number(value));
            sizeEditor(overlay.value);
            overlay.style.color = valid ? 'transparent' : 'var(--text-primary, #fff)';
            if (valid) applyEdgeWeight(value);
            this.renderer.markDirty();
        };

        const finishEdit = () => {
            if (finished) return;
            finished = true;
            if (this._inlineEdit?.overlay === overlay) this._inlineEdit = null;
            const value = overlay.value.trim();
            const valid = cancelled || value === '' || Number.isFinite(Number(value));
            const newWeight = cancelled ? oldWeight : (value === '' ? null : value);
            if (cancelled || !valid || oldWeight === newWeight) {
                edgeNode.meta ||= {};
                if (oldWeight === null) delete edgeNode.meta.edgeWeight;
                else edgeNode.meta.edgeWeight = oldWeight;
                treeEl._edgeWeightOverrides = { ...oldWeightOverrides };
                treeEl.hasWeights = oldHasWeights;
            } else {
                applyEdgeWeight(newWeight);
                treeEl.hasWeights = true;
            }
            const newWeightOverrides = { ...treeEl._edgeWeightOverrides };
            treeEl.isEditingEdge = false;
            treeEl._layoutTree();
            this._updateConnectedLines([treeEl.id]);
            overlay.style.display = 'none';
            overlay.onblur = null;
            overlay.oninput = null;
            overlay.onkeydown = null;
            if (document.activeElement === overlay) overlay.blur();

            if (!cancelled && !valid) this._toast('邊權重必須是有限數值。');
            if (oldWeight !== newWeight && valid) {
                this.history.push({
                    description: 'Edit Tree Edge Weight',
                    undo: () => {
                        applyEdgeWeight(oldWeight);
                        treeEl._edgeWeightOverrides = { ...oldWeightOverrides };
                        treeEl.hasWeights = oldHasWeights;
                        this.renderer.markDirty();
                    },
                    redo: () => {
                        applyEdgeWeight(newWeight);
                        treeEl._edgeWeightOverrides = { ...newWeightOverrides };
                        treeEl.hasWeights = true;
                        this.renderer.markDirty();
                    }
                });
                this._autosave();
            }
            this.renderer.markDirty();
        };

        this._inlineEdit = {
            element: treeEl,
            overlay,
            finish: finishEdit,
            cancel: () => {
                cancelled = true;
                overlay.value = oldWeight ?? '';
                finishEdit();
            }
        };

        overlay.oninput = updatePreview;
        overlay.onblur = finishEdit;
        overlay.onkeydown = event => {
            if (event.isComposing) return;
            if (event.key === 'Enter') {
                event.preventDefault();
                overlay.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelled = true;
                overlay.value = oldWeight ?? '';
                overlay.blur();
            }
        };

        this.renderer.markDirty();
        overlay.focus();
        if (oldWeight !== null) overlay.select();
    }

    // ═════════════════════════════════════════════════════
    // Markdown Element
    // ═════════════════════════════════════════════════════
    _createMarkdown(wx, wy) {
        const el = new MarkdownElement(wx, wy, '');
        this._applyInheritedColor(el);
        this._showMarkdownDialog(el, true);
    }

    _dismissPendingDialogs({ commitMarkdown = false, preservePreview = false } = {}) {
        if (preservePreview) {
            try {
                this.textInputDialog?.flushPreview?.();
            } catch (error) {
                console.warn('[Whiteboard draft] Unable to flush the last dialog preview.', error);
            } finally {
                this.textInputDialog?.close?.();
            }
        } else if (!this.textInputDialog?.cancel?.()) {
            this.textInputDialog?.close?.();
        }
        if (commitMarkdown) this._markdownDialogConfirm?.();
        else this._markdownDialogCancel?.();
        this._markdownDialogClose?.();
    }

    _clearPendingElementDialog(element) {
        if (this._pendingElementDialogElement === element) {
            this._pendingElementDialogElement = null;
        }
    }

    _cancelInlineEditForElement(element) {
        if (this._inlineEdit?.element !== element) return false;
        this._inlineEdit.cancel();
        return true;
    }

    _finishInlineEditing() {
        if (!this._inlineEdit) return false;
        this._inlineEdit.finish?.();
        return true;
    }

    _dismissPendingDialogsForElement(element) {
        if (!element || this._pendingElementDialogElement !== element) return false;
        this.textInputDialog?.close?.();
        this._markdownDialogClose?.();
        this._clearPendingElementDialog(element);
        return true;
    }

    /**
     * Show the split-pane Markdown editor dialog.
     * @param {MarkdownElement} el
     * @param {boolean} isNew - if true, element hasn't been added yet
     */
    _showMarkdownDialog(el, isNew = false) {
        this._markdownDialogCancel?.();
        this._pendingElementDialogElement = el;
        const oldText = el.markdownText;
        const originalState = JSON.parse(JSON.stringify(el.serialize()));
        const originalIndex = this.elements.indexOf(el);
        const restoreOriginal = () => this._restoreElementSnapshot(el, originalState, originalIndex);

        // ── Build overlay ───────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'markdown-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'markdown-dialog';

        // ── Header ──────────────────────────────────
        const header = document.createElement('div');
        header.className = 'markdown-dialog-header';
        const h3 = document.createElement('h3');
        h3.id = 'markdown-dialog-title';
        const markdownIcon = document.createElement('span');
        markdownIcon.className = 'md-icon';
        markdownIcon.textContent = 'MD';
        const markdownTitle = document.createElement('span');
        markdownTitle.textContent = 'Markdown 編輯器';
        h3.append(markdownIcon, markdownTitle);
        dialog.setAttribute('aria-labelledby', h3.id);
        header.appendChild(h3);
        dialog.appendChild(header);

        // ── Body (split pane) ───────────────────────
        const body = document.createElement('div');
        body.className = 'markdown-dialog-body';

        // Left: editor
        const editorPane = document.createElement('div');
        editorPane.className = 'markdown-editor-pane';
        const editorLabel = document.createElement('div');
        editorLabel.className = 'pane-label';
        editorLabel.textContent = '編輯';
        const textarea = document.createElement('textarea');
        textarea.setAttribute('aria-label', 'Markdown 原始碼');
        textarea.dataset.tabIndent = '';
        textarea.value = el.markdownText || '';
        textarea.maxLength = MarkdownElement.MAX_SOURCE_LENGTH;
        textarea.placeholder = '輸入 Markdown…\n\n# 標題\n\n- 清單項目\n- **粗體**、*斜體*';
        textarea.spellcheck = false;

        // Tab key inserts spaces
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                const s = textarea.selectionStart, end = textarea.selectionEnd;
                const available = Math.max(0, MarkdownElement.MAX_SOURCE_LENGTH -
                    (textarea.value.length - (end - s)));
                const indent = ' '.repeat(Math.min(4, available));
                textarea.value = textarea.value.substring(0, s) + indent + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = s + indent.length;
                textarea.dispatchEvent(new Event('input'));
            }
        });

        editorPane.appendChild(editorLabel);
        editorPane.appendChild(textarea);

        // Right: preview
        const previewPane = document.createElement('div');
        previewPane.className = 'markdown-preview-pane';
        const previewLabel = document.createElement('div');
        previewLabel.className = 'pane-label';
        previewLabel.textContent = '預覽';
        const previewContent = document.createElement('div');
        previewContent.className = 'markdown-preview-content';
        previewContent.setAttribute('aria-label', 'Markdown 預覽');
        previewContent.addEventListener('click', event => {
            // Preview links must not navigate away from an unfinished edit.
            if (event.target.closest('a')) event.preventDefault();
        });
        previewPane.appendChild(previewLabel);
        previewPane.appendChild(previewContent);

        body.appendChild(editorPane);
        body.appendChild(previewPane);
        dialog.appendChild(body);

        // ── Footer ──────────────────────────────────
        const footer = document.createElement('div');
        footer.className = 'markdown-dialog-footer';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'md-btn-cancel';
        cancelBtn.textContent = '取消';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'md-btn-confirm';
        confirmBtn.textContent = '確認';
        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // ── Live preview ────────────────────────────
        const updatePreview = () => {
            const md = textarea.value;
            try {
                const previewHTML = MarkdownElement.renderToHTML(md)
                    .replace('Markdown 預覽資料不得超過 1 MB。', i18n.t('Markdown 預覽資料不得超過 1 MB。'))
                    .replace('Markdown 預覽上限為 2,000 行；請縮短內容。', i18n.t('Markdown 預覽上限為 2,000 行；請縮短內容。'));
                previewContent.innerHTML = previewHTML;
            } catch (_) {
                previewContent.innerHTML = `<pre style="white-space:pre-wrap">${md.replace(/</g, '&lt;')}</pre>`;
            }
        };

        // Initial preview
        updatePreview();

        // Debounced preview updates
        let previewTimer = null;
        let releaseModal = null;
        textarea.addEventListener('input', () => {
            clearTimeout(previewTimer);
            previewTimer = setTimeout(updatePreview, 80);
        });

        // Focus textarea
        requestAnimationFrame(() => {
            if (!textarea.isConnected) return;
            textarea.focus();
            if (textarea.value) textarea.select();
        });

        // ── Close helper ────────────────────────────
        const closeDialog = () => {
            clearTimeout(previewTimer);
            releaseModal?.();
            releaseModal = null;
            this._markdownDialogCancel = null;
            this._markdownDialogConfirm = null;
            this._markdownDialogClose = null;
            this._clearPendingElementDialog(el);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
        this._markdownDialogClose = closeDialog;

        // ── Confirm ─────────────────────────────────
        const confirm = () => {
            const text = textarea.value.trim();
            if (!text) {
                // Empty text: if new, don't create; if existing, delete
                if (!isNew) {
                    if (oldText.trim()) {
                        this.history.push({
                            description: 'Delete Markdown',
                            undo: restoreOriginal,
                            redo: () => this._deleteElement(el)
                        });
                    }
                    this._deleteElement(el);
                    this.selectionManager.clear();
                }
                closeDialog();
                this.toolbar.setTool('select');
                this._refreshUI();
                return;
            }

            el.markdownText = text;
            el._render();
            const newState = JSON.parse(JSON.stringify(el.serialize()));

            if (isNew) {
                this.elements.push(el);
                this.layerManager._reindex();
                this._pushCreation(el);
            } else if (oldText !== text) {
                this.history.push({
                    description: 'Edit Markdown',
                    undo: restoreOriginal,
                    redo: () => this._restoreElementSnapshot(el, newState, originalIndex)
                });
            }

            this.selectionManager.select(el);
            closeDialog();
            this.toolbar.setTool('select');
            this._refreshUI();
        };

        // ── Cancel ──────────────────────────────────
        const cancel = () => {
            if (!isNew) {
                restoreOriginal();
            }
            this.selectionManager.clear();
            closeDialog();
            this.toolbar.setTool('select');
            this._refreshUI();
        };
        this._markdownDialogConfirm = confirm;
        this._markdownDialogCancel = cancel;

        confirmBtn.addEventListener('click', confirm);
        cancelBtn.addEventListener('click', cancel);

        // A backdrop click only cancels an untouched editor; edited text is never discarded silently.
        const initialMarkdown = textarea.value;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && textarea.value === initialMarkdown) cancel();
        });
        releaseModal = bindModal(dialog, {
            onCancel: cancel, onConfirm: confirm, initialFocus: textarea
        });
    }

    // ═════════════════════════════════════════════════════
    // Edge Creation (graph — Alt+click node, drag to another)
    // ═════════════════════════════════════════════════════
    _finishEdgeCreation(wx, wy) {
        const ep = this._edgePreview;
        if (!ep) return;
        this._edgePreview = null;

        const graph = ep.graphElement;
        const tgtNode = graph.hitTestNode(wx, wy);
        if (tgtNode && tgtNode !== ep.sourceNode) {
            const edge = {
                u: ep.sourceNode.id,
                v: tgtNode.id,
                w: null,
                directed: graph.directed
            };
            const edgeIndex = graph.edges.length;
            graph.edges.splice(edgeIndex, 0, edge);
            this.history.push({
                description: 'Add Edge',
                undo: () => {
                    const currentIndex = graph.edges.indexOf(edge);
                    if (currentIndex >= 0) graph.edges.splice(currentIndex, 1);
                    this.renderer.markDirty();
                },
                redo: () => {
                    if (!graph.edges.includes(edge)) {
                        graph.edges.splice(Math.min(edgeIndex, graph.edges.length), 0, edge);
                    }
                    this.renderer.markDirty();
                }
            });
        }
        this.renderer.markDirty();
    }

    // ═════════════════════════════════════════════════════
    // Wheel (Pan / Zoom)
    // ═════════════════════════════════════════════════════
    _bindWheel() {
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            if (e.deltaX === 0 && e.deltaY === 0) return;
            // Inline cell editors are absolutely positioned and do not follow the camera,
            // so close them (this is a no-op when nothing is being edited).
            this._finishInlineEditing();
            const { sx, sy } = this._screenPos(e);
            const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
            const dx = e.deltaX * unit, dy = e.deltaY * unit;

            if (e.ctrlKey) {
                // Pinch gesture (ctrlKey=true on trackpad pinch) or Ctrl+scroll → exponential ZOOM
                const delta = Math.max(-WHEEL_ZOOM_MAX_DELTA_PX, Math.min(WHEEL_ZOOM_MAX_DELTA_PX, dy));
                this._zoomByFactor(Math.exp(-delta * WHEEL_ZOOM_K), sx, sy);
                this._updateZoomDisplay();
            } else {
                // Regular scroll → PAN (反轉方向：向下滚 = 畫布向上移)
                this.camera.pan(-dx, -dy);
            }

            this.renderer.markDirty();
            this._autosave({ camera: true });
            
            if (this._textEditing) {
                this._updateTextEditingOverlay();
            }
        }, { passive: false });
    }

    // ═════════════════════════════════════════════════════
    // Keyboard Shortcuts
    // ═════════════════════════════════════════════════════
    _bindKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.defaultPrevented || e.isComposing || e.target.closest?.('[role="dialog"]')) return;
            // Ignore when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') &&
                e.target.closest?.('button, [role="button"], a')) return;
            if (this._pendingElementDialogElement) return;
            if (this.cloudBoards?.isReadOnly && e.key !== 'Escape') return;

            const ctrl = e.ctrlKey || e.metaKey;

            if (!ctrl && !e.altKey && e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
                e.preventDefault();
                this._fitView(e.code === 'Digit2' ? this.selectionManager.selectedElements : this.elements);
                return;
            }


            const boardKey = e.target === this.canvas || e.target === document || e.target === document.body || e.target === document.documentElement;
            const matrix = boardKey ? this._selectedMatrixWithCells() : null;
            if (matrix && !this._matrixCellSelection && !e.altKey && this._navigateMatrixCells(matrix, e)) return;
            if (boardKey && !ctrl && !e.altKey && (e.key === 'Enter' || e.key === 'F2')) {
                if (matrix) {
                    e.preventDefault();
                    this._cancelPointerInteraction();
                    if (matrix.selectedCells.size > 1) this._editSelectedMatrixCells(matrix);
                    else {
                        const [row, col] = [...matrix.selectedCells][0].split(',').map(Number);
                        this._editMatrixCell(matrix, row, col);
                    }
                    return;
                }
            }

            // ── Delete ─────────────────────────────
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // First check if any data structure has selected cells/items
                const dsEl = this.selectionManager.selectedElements.find(el =>
                    !el.locked && (
                        (el.type === 'matrix' && el.selectedCells && el.selectedCells.size > 0) ||
                        ((el.type === 'stack' || el.type === 'queue') &&
                            el.selectedIndices && el.selectedIndices.size > 0)
                    )
                );
                if (dsEl) {
                    if (dsEl.type === 'matrix') this._deleteSelectedMatrixCells(dsEl);
                    else this._deleteSelectedItems(dsEl);
                    return;
                }
                // Otherwise delete entire selected elements
                const toRemove = this.selectionManager.selectedElements.filter(el => !el.locked);
                if (toRemove.length) {
                    this.history.pushDelete(this, toRemove);
                    this.selectionManager.deleteSelected();
                    this._refreshUI();
                }
                return;
            }

            // ── Ctrl+Z  Undo ──────────────────────
            if (ctrl && !e.shiftKey && e.key === 'z') {
                e.preventDefault();
                this.history.undo();
                this._refreshUI();
                return;
            }

            // ── Ctrl+Shift+Z  Redo ────────────────
            if (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                this.history.redo();
                this._refreshUI();
                return;
            }

            // ── Ctrl+Y  Redo (alternative) ────────
            if (ctrl && e.key === 'y') {
                e.preventDefault();
                this.history.redo();
                this._refreshUI();
                return;
            }

            // ── Ctrl+A  Select All ────────────────
            if (ctrl && e.key === 'a') {
                e.preventDefault();
                this.selectionManager.selectAll();
                this._refreshUI();
                return;
            }

            const isCopy  = (e.code === 'KeyC' || e.key.toLowerCase() === 'c');
            const isCut   = (e.code === 'KeyX' || e.key.toLowerCase() === 'x');
            const isPaste = (e.code === 'KeyV' || e.key.toLowerCase() === 'v');
            const isSave  = (e.code === 'KeyS' || e.key.toLowerCase() === 's');
            const isDup   = (e.code === 'KeyD' || e.key.toLowerCase() === 'd');

            // ── Ctrl+C  Copy ──────────────────────
            if (ctrl && isCopy) {
                if (this._selectedMatrixWithCells()) return;
                e.preventDefault();
                this._copyToClipboard();
                return;
            }

            // ── Ctrl+X  Cut ───────────────────────
            if (ctrl && isCut) {
                if (this._selectedMatrixWithCells()) return;
                e.preventDefault();
                this._copyToClipboard();
                const toRemove = this.selectionManager.selectedElements.filter(el => !el.locked);
                if (toRemove.length) {
                    this.history.pushDelete(this, toRemove);
                    this.selectionManager.deleteSelected();
                    this._refreshUI();
                }
                return;
            }

            // ── Ctrl+V  Paste ─────────────────────
            if (ctrl && isPaste) {
                if (this._selectedMatrixWithCells()) return;
                e.preventDefault();
                this._pasteFromClipboard();
                return;
            }

            // ── Ctrl+S  Export JSON ───────────────
            if (ctrl && isSave) {
                e.preventDefault();
                Serializer.exportJSON(this);
                this._toast('已匯出 JSON');
                return;
            }

            // ── Ctrl+D  Duplicate ────────────────
            if (ctrl && isDup) {
                e.preventDefault();
                this._duplicateSelected();
                return;
            }

            // ── Ctrl+=  Zoom In / Ctrl+-  Zoom Out ─
            if (ctrl && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                this.camera.zoomAt(1, rect.width / 2, rect.height / 2);
                this._updateZoomDisplay();
                this.renderer.markDirty();
                this._autosave({ camera: true });
                return;
            }
            if (ctrl && e.key === '-') {
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                this.camera.zoomAt(-1, rect.width / 2, rect.height / 2);
                this._updateZoomDisplay();
                this.renderer.markDirty();
                this._autosave({ camera: true });
                return;
            }

            // ── Escape ──────────────────────────
            if (e.key === 'Escape') {
                this._closeSettings();
                this._clearAllCellSelections();
                this.selectionManager.clear();
                this._finishTextEditing();
                this._edgePreview = null;
                if (this._isCreating) {
                    // Cancel creation
                    const idx = this.elements.indexOf(this._creatingElement);
                    if (idx >= 0) this.elements.splice(idx, 1);
                    this._isCreating = false;
                    this._creatingElement = null;
                    this._createStart = null;
                    this._creatingTool = null;
                }
                this.transform.cancel();
                if (this.toolbar) this.toolbar.setTool('select');
                this._refreshUI();
                return;
            }

            // ── Space  Toggle pan mode (hold) ──
            if (e.key === ' ' && !e.repeat) {
                // Space must keep activating a focused button / link / field.
                if (e.target.closest?.('button, [role="button"], a, input, select, textarea, [contenteditable]')) return;
                e.preventDefault();
                this._spaceHeld = true;
                this._prevTool = this.toolbar.currentTool;
                this.toolbar.setTool('pan');
            }
        });

        document.addEventListener('keyup', e => {
            if (e.key === ' ' && this._spaceHeld) {
                this._spaceHeld = false;
                this.toolbar.setTool(this._prevTool || 'select');
            }
        });
    }

    // ═════════════════════════════════════════════════════
    // Connection Port Snap
    // ═════════════════════════════════════════════════════

    /**
     * Find the nearest connection port within snap radius.
     * excludeEl: the line being dragged (skip its own ports).
     * Returns { x, y, elementId, portId } or null.
     */
    _findSnapPort(wx, wy, excludeEl) {
        const SNAP_RADIUS = 24 / this.camera.zoom;
        let best = null, bestDist = Infinity;
        for (const el of this.elements) {
            if (el === excludeEl || el.hidden) continue;
            if (!el.findNearestConnectionPort) continue;
            const port = el.findNearestConnectionPort(wx, wy, SNAP_RADIUS);
            if (port && port.distance < bestDist) {
                bestDist = port.distance;
                best = { x: port.x, y: port.y, elementId: el.id, portId: port.id };
            }
        }
        return best;
    }

    /**
     * After a drag or resize, update all line/arrow endpoints that are
     * connected to any element in movedIds.
     */
    _updateConnectedLines(movedIds) {
        const idSet = new Set(movedIds);
        const portCache = new Map();
        let targets = null;
        const getPort = connection => {
            if (!portCache.has(connection.elementId)) {
                targets ||= new Map(this.elements.map(element => [element.id, element]));
                const target = targets.get(connection.elementId);
                portCache.set(connection.elementId,
                    new Map((target?.getConnectionPorts?.() || []).map(port => [port.id, port])));
            }
            return portCache.get(connection.elementId).get(connection.portId);
        };
        for (const el of this.elements) {
            if (el.shapeType !== 'line' && el.shapeType !== 'arrow') continue;
            let updated = false;
            for (const [index, endpoint] of ['p1', 'p2'].entries()) {
                const connection = el.connections?.[endpoint];
                if (!connection || !idSet.has(connection.elementId)) continue;
                const port = getPort(connection);
                if (!port) continue;
                if (typeof el.setEndpointWorld === 'function') el.setEndpointWorld(index, port);
                else if (index === 0) {
                    const endX = el.x + el.width, endY = el.y + el.height;
                    el.x = port.x; el.y = port.y;
                    el.width = endX - port.x; el.height = endY - port.y;
                } else {
                    el.width = port.x - el.x; el.height = port.y - el.y;
                }
                updated = true;
            }
            if (updated) portCache.delete(el.id);
        }
        this.renderer.markDirty();
    }

    // ═════════════════════════════════════════════════════
    // Focus Camera on Element
    // ═════════════════════════════════════════════════════
    _focusOnElement(el) {
        this._fitView([el]);
    }

    // ═════════════════════════════════════════════════════
    // Context Menu (Right-click)
    // ═════════════════════════════════════════════════════
    _showContextMenu(e) {
        e.preventDefault();
        if (this.cloudBoards?.isReadOnly) return;
        const { x: wx, y: wy } = this._worldPos(e);
        const hit = HitTest.hitTestAll(this.elements, wx, wy, this.camera);

        if (hit && !this.selectionManager.isSelected(hit)) {
            this.selectionManager.select(hit);
            this._refreshUI();
        }
        this._ctxTarget = hit;

        const menu = document.getElementById('context-menu');
        if (!menu) return;

        // Don't show menu on empty canvas
        if (!hit) { menu.style.display = 'none'; return; }

        // Show all element-specific items
        ['ctx-rename', 'ctx-duplicate', 'ctx-bring-front', 'ctx-send-back',
         'ctx-layer-up', 'ctx-layer-down',
         'ctx-delete', 'ctx-sep1', 'ctx-sep2'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = '';
        });
        document.querySelectorAll('#context-menu .ctx-separator').forEach(s => {
            s.style.display = '';
        });

        const mPrefix = document.getElementById('ctx-matrix-prefix');
        const mDiff = document.getElementById('ctx-matrix-diff');
        if (mPrefix) mPrefix.style.display = (hit.type === 'matrix') ? '' : 'none';
        if (mDiff) mDiff.style.display = (hit.type === 'matrix') ? '' : 'none';

        // Position (clamp inside viewport)
        menu.style.display = 'block';
        const bounds = menu.getBoundingClientRect();
        menu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - bounds.width - 4)) + 'px';
        menu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - bounds.height - 4)) + 'px';
        menu.querySelector('.ctx-item:not([style*="display: none"])')?.focus({ preventScroll: true });
    }

    _hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
        this._ctxTarget = null;
    }

    _startRename(el) {
        const inp = document.getElementById('rename-input');
        if (!inp) return;
        inp.maxLength = 1024;
        const b = el.getBounds ? el.getBounds() : { x: el.x, y: el.y, w: el.width || 60, h: el.height || 40 };
        const rect = this.canvas.getBoundingClientRect();
        const sp = this.camera.worldToScreen(b.x + b.w / 2, b.y + b.h / 2);
        inp.value = el.label || el.type;
        inp.style.left = Math.max(4, rect.left + sp.x - 80) + 'px';
        inp.style.top = Math.max(4, rect.top + sp.y - 16) + 'px';
        inp.style.display = 'block';
        const inputBounds = inp.getBoundingClientRect();
        inp.style.left = Math.max(4, Math.min(parseFloat(inp.style.left), innerWidth - inputBounds.width - 4)) + 'px';
        inp.style.top = Math.max(4, Math.min(parseFloat(inp.style.top), innerHeight - inputBounds.height - 4)) + 'px';
        inp.focus();
        inp.select();

        const oldLabel = el.label;
        const commit = () => {
            const newLabel = inp.value.trim() || oldLabel;
            inp.style.display = 'none';
            inp.onblur = null; inp.onkeydown = null;
            if (newLabel !== oldLabel) {
                el.label = newLabel;
                this.history.push({
                    description: 'Rename',
                    undo: () => { el.label = oldLabel; this._refreshUI(); },
                    redo: () => { el.label = newLabel; this._refreshUI(); }
                });
                this._refreshUI();
            }
        };
        inp.onblur = commit;
        inp.onkeydown = (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
            if (ev.key === 'Escape') { inp.value = oldLabel ?? ''; inp.blur(); }
        };
    }

    _bindContextMenu() {
        this._ctxTarget = null;
        document.getElementById('context-menu')?.addEventListener('keydown', event => {
            event.stopPropagation();
            const menu = event.currentTarget;
            const items = [...menu.querySelectorAll('.ctx-item')].filter(item => item.getClientRects().length);
            const index = items.indexOf(document.activeElement);
            let next = null;
            if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
            if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
            if (event.key === 'Home') next = items[0];
            if (event.key === 'End') next = items.at(-1);
            if (next) { event.preventDefault(); next.focus(); }
            if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                this._hideContextMenu();
                this.canvas.focus({ preventScroll: true });
            }
        });

        // Click outside menu → hide
        document.addEventListener('pointerdown', (e) => {
            const menu = document.getElementById('context-menu');
            if (menu && menu.style.display !== 'none' && !menu.contains(e.target)) {
                this._hideContextMenu();
            }
        }, { capture: true });

        document.getElementById('ctx-rename')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (el) this._startRename(el);
        });
        document.getElementById('ctx-duplicate')?.addEventListener('click', () => {
            this._hideContextMenu();
            this._duplicateSelected();
        });
        document.getElementById('ctx-matrix-prefix')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (el && el.type === 'matrix') this._duplicateAndTransformMatrix(el, 'prefix');
        });
        document.getElementById('ctx-matrix-diff')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (el && el.type === 'matrix') this._duplicateAndTransformMatrix(el, 'diff');
        });
        document.getElementById('ctx-bring-front')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (el) { this.layerManager.bringToFront(el); this._refreshUI(); }
        });
        document.getElementById('ctx-send-back')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (el) { this.layerManager.sendToBack(el); this._refreshUI(); }
        });
        document.getElementById('ctx-layer-up')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (el) { this.layerManager.moveUp(el); this._refreshUI(); }
        });
        document.getElementById('ctx-layer-down')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (el) { this.layerManager.moveDown(el); this._refreshUI(); }
        });
        document.getElementById('ctx-delete')?.addEventListener('click', () => {
            const el = this._ctxTarget;
            this._hideContextMenu();
            if (!el || el.locked) return;
            this.history.pushDelete(this, [el]);
            const idx = this.elements.indexOf(el);
            if (idx >= 0) this.elements.splice(idx, 1);
            this.layerManager._reindex();
            this.selectionManager.clear();
            this._refreshUI();
        });
    }

    // ═════════════════════════════════════════════════════
    // Clipboard (Copy / Paste)
    // ═════════════════════════════════════════════════════
    _copyToClipboard() {
        const sel = this.selectionManager.selectedElements;
        if (!sel.length) return;
        this._clipboard = sel.map(el => JSON.parse(JSON.stringify(el.serialize())));
    }

    _remapDuplicatedConnections(elements, idMap) {
        for (const el of elements) {
            if (el.shapeType !== 'line' && el.shapeType !== 'arrow') continue;
            for (const endpoint of ['p1', 'p2']) {
                const connection = el.connections?.[endpoint];
                const duplicateId = connection && idMap.get(connection.elementId);
                if (duplicateId) connection.elementId = duplicateId;
            }
        }
    }

    /** Offset serialized element data in place (pen strokes keep their geometry in `points`). */
    _shiftSerializedData(data, dx, dy) {
        if (Array.isArray(data.points)) {
            data.points = data.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }));
        }
        data.x += dx;
        data.y += dy;
    }

    /** Build a new element (fresh id) from serialized data, moved by (dx, dy). */
    _createOffsetCopy(source, dx, dy) {
        const data = JSON.parse(JSON.stringify(source));
        const Cls = ELEMENT_TYPE_MAP[data.type];
        if (!Cls) return null;
        delete data.id;                     // a new id is generated
        const isPen = data.type === 'pen';  // bounds are recalculated from points on deserialize
        if (!isPen) { data.x += dx; data.y += dy; }
        const element = Cls.fromData ? Cls.fromData(data) : new Cls();
        element.deserialize(data);
        if (isPen) {
            if (typeof element.translate === 'function') element.translate(dx, dy);
            else this._shiftSerializedData(element, dx, dy);   // same shape: points[] + x/y
        }
        return element;
    }

    _pasteFromClipboard() {
        if (!this._clipboard || !this._clipboard.length) return;
        const newEls = [];
        const idMap = new Map();
        for (const data of this._clipboard) {
            const newEl = this._createOffsetCopy(data, PASTE_OFFSET, PASTE_OFFSET);
            if (!newEl) continue;
            if (data.id) idMap.set(data.id, newEl.id);
            this.elements.push(newEl);
            newEls.push(newEl);

            // Also update the clipboard data so next paste offsets again!
            this._shiftSerializedData(data, PASTE_OFFSET, PASTE_OFFSET);
        }
        if (newEls.length) {
            this._remapDuplicatedConnections(newEls, idMap);
            this.history.pushAdd(this, newEls);
            this.selectionManager.clear();
            for (const n of newEls) this.selectionManager.select(n);
            this.layerManager._reindex();
            this._refreshUI();
        }
    }

    // ═════════════════════════════════════════════════════
    // Duplicate
    // ═════════════════════════════════════════════════════
    _duplicateSelected() {
        const sel = this.selectionManager.selectedElements.filter(el => !el.locked);
        if (!sel.length) return;
        const newEls = [];
        const idMap = new Map();
        for (const el of sel) {
            const data = el.serialize();
            const newEl = this._createOffsetCopy(data, PASTE_OFFSET, PASTE_OFFSET);
            if (!newEl) continue;
            if (data.id) idMap.set(data.id, newEl.id);
            this.elements.push(newEl);
            newEls.push(newEl);
        }
        if (newEls.length) {
            this._remapDuplicatedConnections(newEls, idMap);
            this.history.pushAdd(this, newEls);
        }
        this.selectionManager.selectedElements = newEls;
        this.layerManager._reindex();
        this._refreshUI();
    }

    _duplicateAndTransformMatrix(el, transformType) {
        if (!el || el.locked) return;
        const data = JSON.parse(JSON.stringify(el.serialize()));
        delete data.id;
        data.x += 50;
        data.y += 50;
        
        let matrixData = data.data.map(row => row.map(value => {
            if (value == null || String(value).trim() === '') return 0;
            return Number(value);
        }));
        if (matrixData.some(row => row.some(value => !Number.isFinite(value)))) {
            this._toast('前綴和與差分僅支援有限數值；空白格視為 0。');
            return;
        }
        let newMatrixData = [];
        
        if (transformType === 'prefix') {
            const R = matrixData.length;
            const C = (matrixData[0] || []).length;
            
            if (R === 1) {
                // 1D Row Prefix Sum
                const P = new Array(C + 1).fill(0);
                for (let j = 1; j <= C; j++) {
                    P[j] = P[j-1] + matrixData[0][j-1];
                }
                newMatrixData.push(P);
            } else if (C === 1) {
                // 1D Column Prefix Sum
                for (let i = 0; i <= R; i++) {
                    newMatrixData.push([0]);
                }
                for (let i = 1; i <= R; i++) {
                    newMatrixData[i][0] = newMatrixData[i-1][0] + matrixData[i-1][0];
                }
            } else {
                // 2D Prefix Sum: P[i][j] = A[i-1][j-1] + P[i-1][j] + P[i][j-1] - P[i-1][j-1]
                for (let i = 0; i <= R; i++) {
                    newMatrixData.push(new Array(C + 1).fill(0));
                }
                for (let i = 1; i <= R; i++) {
                    for (let j = 1; j <= C; j++) {
                        newMatrixData[i][j] = matrixData[i-1][j-1] 
                                            + newMatrixData[i-1][j] 
                                            + newMatrixData[i][j-1] 
                                            - newMatrixData[i-1][j-1];
                    }
                }
            }
        } else if (transformType === 'diff') {
            const R = matrixData.length;
            const C = (matrixData[0] || []).length;
            
            if (R === 1) {
                // 1D Row Difference Array
                const D = new Array(C).fill(0);
                for (let j = 0; j < C; j++) {
                    const left = j > 0 ? matrixData[0][j-1] : 0;
                    D[j] = matrixData[0][j] - left;
                }
                newMatrixData.push(D);
            } else if (C === 1) {
                // 1D Column Difference Array
                for (let i = 0; i < R; i++) {
                    const top = i > 0 ? matrixData[i-1][0] : 0;
                    newMatrixData.push([matrixData[i][0] - top]);
                }
            } else {
                // 2D Difference Array: D[i][j] = A[i][j] - A[i-1][j] - A[i][j-1] + A[i-1][j-1]
                for (let i = 0; i < R; i++) {
                    newMatrixData.push(new Array(C).fill(0));
                }
                for (let i = 0; i < R; i++) {
                    for (let j = 0; j < C; j++) {
                        const top = i > 0 ? matrixData[i-1][j] : 0;
                        const left = j > 0 ? matrixData[i][j-1] : 0;
                        const topLeft = (i > 0 && j > 0) ? matrixData[i-1][j-1] : 0;
                        newMatrixData[i][j] = matrixData[i][j] - top - left + topLeft;
                    }
                }
            }
        }

        if (newMatrixData.some(row => row.some(value => !Number.isFinite(value)))) {
            this._toast('數值超出範圍，未建立矩陣。');
            return;
        }
        const resultRows = newMatrixData.length;
        const resultCols = (newMatrixData[0] || []).length;
        if (resultRows > 200 || resultCols > 200 || resultRows * resultCols > 10000) {
            this._toast('結果超出矩陣尺寸上限。');
            return;
        }
        
        // Use the editor's format so negative and decimal one-cell rows remain intact.
        data.data = newMatrixData.map(row => row.map(String));
        data.inputText = el.getTextFromData(data.data);
        data.rows = newMatrixData.length;
        data.cols = (newMatrixData[0] || []).length;
        
        const newEl = MatrixElement.fromData(data);
        newEl.deserialize(data);
        
        newEl._updateSize();
        
        this.elements.push(newEl);
        this.history.pushAdd(this, newEl);
        this.selectionManager.clear();
        this.selectionManager.select(newEl);
        this.layerManager._reindex();
        this._refreshUI();
    }

    // ═════════════════════════════════════════════════════
    // Settings
    // ═════════════════════════════════════════════════════
    _bindSettings() {
        // Close on backdrop click
        document.getElementById('settings-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') {
                this._closeSettings();
            }
        });
        document.getElementById('settings-close')?.addEventListener('click', () => {
            this._closeSettings();
        });

        const $s = id => document.getElementById(id);

        $s('settings-show-grid')?.addEventListener('change', (e) => {
            this.settings.showGrid = e.target.checked;
            this.renderer.markDirty();
            this._saveSettings();
        });
        $s('settings-grid-spacing')?.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            this.settings.gridSpacing = v;
            const disp = $s('settings-grid-spacing-val');
            if (disp) disp.textContent = v;
            this.grid.baseSpacing = v;
            this.renderer.markDirty();
            this._saveSettings();
        });
        $s('settings-pen-size')?.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            this.settings.defaultPenSize = v;
            const disp = $s('settings-pen-size-val');
            if (disp) disp.textContent = v;
            this._saveSettings();
        });
        $s('settings-pen-smoothing')?.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            this.settings.defaultPenSmoothing = v;
            const disp = $s('settings-pen-smoothing-val');
            if (disp) disp.textContent = v;
            this._saveSettings();
        });
        $s('settings-stroke-width')?.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            this.settings.defaultStrokeWidth = v;
            const disp = $s('settings-stroke-width-val');
            if (disp) disp.textContent = v;
            this._saveSettings();
        });
    }

    _syncSettingsUI() {
        const s = this.settings;
        const $s = id => document.getElementById(id);
        const setCb = (id, val) => { const el = $s(id); if (el) el.checked = !!val; };
        const setRange = (id, val, dispId) => {
            const el = $s(id); if (el) el.value = val;
            const d  = $s(dispId); if (d) d.textContent = val;
        };
        setCb('settings-show-grid', s.showGrid !== false);
        setRange('settings-grid-spacing',  s.gridSpacing     || 40, 'settings-grid-spacing-val');
        setRange('settings-pen-size',      s.defaultPenSize  || 2,  'settings-pen-size-val');
        setRange('settings-pen-smoothing', s.defaultPenSmoothing || 3, 'settings-pen-smoothing-val');
        setRange('settings-stroke-width',  s.defaultStrokeWidth ?? 2, 'settings-stroke-width-val');
    }

    _closeSettings() {
        this._releaseSettingsModal?.();
        this._releaseSettingsModal = null;
        document.getElementById('settings-modal')?.classList.remove('open');
    }

    _saveSettings() {
        try { localStorage.setItem('wb_settings', JSON.stringify(this.settings)); } catch (_) {}
    }

    _loadSettings() {
        try {
            const raw = localStorage.getItem('wb_settings');
            if (raw) {
                const saved = JSON.parse(raw);
                if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
                    if (typeof saved.showGrid === 'boolean') this.settings.showGrid = saved.showGrid;
                    for (const [key, min, max, step] of [
                        ['gridSpacing', 20, 120, 10],
                        ['defaultPenSize', 1, 20, 1],
                        ['defaultPenSmoothing', 1, 10, 1],
                        ['defaultStrokeWidth', 1, 10, 1]
                    ]) {
                        const value = saved[key];
                        if (Number.isInteger(value) && value >= min && value <= max &&
                            (value - min) % step === 0) {
                            this.settings[key] = value;
                        }
                    }
                }
            }
        } catch (_) {}
        if (this.grid) this.grid.baseSpacing = this.settings.gridSpacing;
    }

    // ═════════════════════════════════════════════════════
    // localStorage Autosave (see core/AutosaveStore.js)
    // ═════════════════════════════════════════════════════
    _buildSnapshot() {
        return {
            version: 1,
            elements: this.elements.map(el => el.serialize()),
            camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }
        };
    }

    /**
     * Schedule a debounced local save (and a cloud-sync notification).
     * { camera: true } marks a view-only change (pan / zoom): it is still saved
     * locally but only notifies the cloud via a long trailing debounce.
     */
    _autosave({ camera = false } = {}) {
        this._updateHistoryButtons();
        if (this._skipAutosave) return;
        if (camera) {
            clearTimeout(this._cameraCloudTimer);
            this._cameraCloudTimer = setTimeout(() => {
                this._cameraCloudTimer = null;
                this.cloudBoards?.onLocalChange();
            }, CAMERA_CLOUD_SYNC_DELAY_MS);
        } else {
            this.cloudBoards?.onLocalChange();
        }
        if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
        const autosaveKey = this.autosaveKey;
        this._autosaveTimer = setTimeout(() => {
            this._autosaveTimer = null;
            // Read-only shared views are never restored from local storage;
            // avoid leaving a guest's private board copy on a shared device.
            if (this.cloudBoards?.isCloudBoard && this.cloudBoards.isReadOnly) return;
            // A delayed save must never write one board's snapshot under a
            // different board's key after the user switches boards.
            if (this.autosaveKey !== autosaveKey) return;
            this._writeAutosave(autosaveKey);
        }, AUTOSAVE_DELAY_MS);
    }

    /** Serialize and store the board under `key`; updates the "unsaved" indicator. */
    _writeAutosave(key) {
        let result;
        try {
            result = this.autosaveStore.save(key, this._buildSnapshot());
        } catch (error) {
            result = { ok: false, reason: 'error', error };
        }
        if (result.ok) {
            this._autosaveFailed = false;
            this._setAutosaveStatus(null);
            return true;
        }
        if (result.reason === 'locked') {
            this._setAutosaveStatus('locked');
        } else {
            console.warn('[Autosave]', result.reason, result.error);
            const firstFailure = !this._autosaveFailed;
            this._autosaveFailed = true;
            this._setAutosaveStatus('failed');
            if (firstFailure) {
                this._toast(result.reason === 'quota'
                    ? '自動儲存失敗：瀏覽器儲存空間不足，目前內容尚未儲存。請立即匯出 JSON 備份。'
                    : '自動儲存失敗，目前內容尚未儲存。請立即匯出 JSON 備份。', 'error', 12000);
            }
        }
        return false;
    }

    /** Immediate save (pagehide, import). Returns true when the snapshot was stored. */
    _flushAutosave() {
        if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
        this._autosaveTimer = null;
        if (this._skipAutosave || (this.cloudBoards?.isCloudBoard && this.cloudBoards.isReadOnly)) return false;
        return this._writeAutosave(this.autosaveKey);
    }

    _getAutosaveStatusEl() {
        let el = document.getElementById('autosave-status');
        if (el) return el;
        el = document.createElement('button');
        el.type = 'button';
        el.id = 'autosave-status';
        el.hidden = true;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:11000;display:none;' +
            'padding:6px 12px;border-radius:4px;border:1px solid #e57373;background:#3a2222;' +
            'color:#ffb4b4;font-size:12px;cursor:pointer;';
        el.addEventListener('click', () => this._onAutosaveStatusClick());
        document.body.appendChild(el);
        return el;
    }

    /** state: null (hide) | 'failed' | 'locked' */
    _setAutosaveStatus(state) {
        if (!state && !document.getElementById('autosave-status')) return;
        const el = this._getAutosaveStatusEl();
        el.dataset.state = state || '';
        el.hidden = !state;
        el.style.display = state ? '' : 'none';
        if (state === 'locked') {
            el.textContent = '未儲存（自動儲存已暫停）';
            el.title = '自動存檔損毀，已暫停寫入以保護原始資料。點擊可選擇是否覆寫。';
        } else if (state === 'failed') {
            el.textContent = '未儲存';
            el.title = '自動儲存失敗（可能是儲存空間不足）。點擊可匯出 JSON。';
        }
    }

    _onAutosaveStatusClick() {
        const state = this._getAutosaveStatusEl().dataset.state;
        if (state === 'locked') {
            if (confirm('要用目前白板內容覆寫損毀的自動存檔嗎？（損毀的原始資料已另外備份）')) {
                this._resumeAutosave(this.autosaveKey);
            }
        } else if (state === 'failed') {
            Serializer.exportJSON(this);
        }
    }

    /** Explicit user action: allow writing over the (backed-up) corrupt autosave again. */
    _resumeAutosave(key) {
        this.autosaveStore.unlock(key);
        this._setAutosaveStatus(null);
        if (key === this.autosaveKey) this._autosave();
    }

    _tryLoadAutosave() {
        const key = this.autosaveKey;
        const result = this.autosaveStore.load(key, data => this._restoreFromData(data));
        if (result.status === 'ok') {
            const previousSkipAutosave = this._skipAutosave;
            this._skipAutosave = true;   // restoring must not immediately re-save
            try { this._refreshUI(); } finally { this._skipAutosave = previousSkipAutosave; }
        } else if (result.status === 'corrupt') {
            console.error('[Autosave load ERROR]', result.error?.stack || result.error);
            this._handleCorruptAutosave(key, result);
        }
    }

    /** Validate and apply autosave data; throws (leaving the board untouched) when invalid. */
    _restoreFromData(data) {
        const previousSkipAutosave = this._skipAutosave;
        this._skipAutosave = true;
        try {
            Serializer.loadJSONData(this, data);
        } finally {
            this._skipAutosave = previousSkipAutosave;
        }
    }

    _handleCorruptAutosave(key, { backupKey, error }) {
        this._setAutosaveStatus('locked');
        // Translate each sentence separately: the dictionary matches whole lines only.
        const sep = i18n.locale === 'zh-TW' ? '' : ' ';
        this._toast(i18n.t(backupKey
            ? '自動存檔已損毀，原始資料已備份。'
            : '自動存檔已損毀，且無法建立備份（原資料仍保留在瀏覽器中）。') +
            sep + i18n.t('為避免覆蓋，自動儲存已暫停。') +
            (error?.message ? ` (${error.message})` : ''), 'error', 15000);
        // Deferred so the page can paint before the blocking prompt appears.
        setTimeout(() => {
            if (!this.autosaveStore.isLocked(key)) return;
            if (confirm('存檔損毀，已備份。是否從空白白板開始？\n\n「確定」：從空白開始並恢復自動儲存。\n「取消」：維持暫停，原始資料不會被覆寫。')) {
                this._resumeAutosave(key);
            }
        }, 0);
    }
}

// ── Boot ────────────────────────────────────────────────
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    i18n.start();
    const app = new App();

    // Expose for debugging
    window.__whiteboard = app;
}
