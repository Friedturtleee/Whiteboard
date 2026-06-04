/**
 * app.js — Main application entry point.
 * Initialises all subsystems, wires up events, drives the whiteboard.
 */

// ── Canvas & Rendering ─────────────────────────────────
import { Camera } from './canvas/Camera.js';
import { Grid } from './canvas/Grid.js';
import { Renderer } from './canvas/Renderer.js';
import { HitTest } from './canvas/HitTest.js';

// ── Core ────────────────────────────────────────────────
import { SelectionManager } from './core/SelectionManager.js';
import { LayerManager } from './core/LayerManager.js';
import { Transform } from './core/Transform.js';
import { History } from './core/History.js';
import { Serializer } from './core/Serializer.js';
import { Element } from './core/Element.js';

// ── Elements ────────────────────────────────────────────
import { ShapeElement } from './elements/ShapeElement.js';
import { TextElement } from './elements/TextElement.js';
import { MatrixElement } from './elements/MatrixElement.js';
import { StackElement } from './elements/StackElement.js';
import { QueueElement } from './elements/QueueElement.js';
import { PenElement } from './elements/PenElement.js';
import { MermaidElement } from './elements/MermaidElement.js';
import { TreeElement } from './tree/TreeElement.js';
import { GraphElement } from './graph/GraphElement.js';

// ── UI ──────────────────────────────────────────────────
import { Toolbar } from './ui/Toolbar.js';
import { PropertyPanel } from './ui/PropertyPanel.js';
import { LayerPanel } from './ui/LayerPanel.js';
import { TextInputDialog } from './ui/TextInputDialog.js';

// ═════════════════════════════════════════════════════════
// Application Singleton
// ═════════════════════════════════════════════════════════
class App {
    constructor() {
        // ── State ───────────────────────────────────────
        this.elements = [];
        this._edgePreview = null;      // { x1,y1,x2,y2 } for live graph-edge feedback
        this._isPanning = false;
        this._isCreating = false;      // drawing a new shape
        this._createStart = null;      // { wx, wy }
        this._creatingElement = null;
        this._lastPanScreen = null;    // { sx, sy }
        this._textEditing = null;      // element being text-edited
        this._isPenDrawing = false;    // freehand pen drawing
        this._penElement   = null;     // pen element currently being drawn
        this._penLastPoint = null;     // last recorded world point

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
        this.history = new History(this);
        this.renderer = new Renderer(this.canvas, this.ctx, this.camera, this.grid, this);

        // ── UI Components ───────────────────────────────
        this.toolbar = new Toolbar(this);
        this.propertyPanel = new PropertyPanel(this);
        this.layerPanel = new LayerPanel(this);
        this.textInputDialog = new TextInputDialog(this);

        // ── Bind Events ─────────────────────────────────
        // ── Settings ────────────────────────────────────
        this.settings = { showGrid: true, gridSpacing: 40, defaultPenSize: 2, defaultPenSmoothing: 3 };
        this._loadSettings();

        this._initCamera();
        
        window.appInstance = this;
        this._bindMouse();
        this._bindWheel();
        this._bindKeyboard();
        
        // Ensure web fonts are fully loaded before rendering
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                this.renderer.markDirty();
            });
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
        this._tryLoadAutosave();

        this._fetchGitHubVersion();
    }

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
                        window.open(`https://github.com/Friedturtleee/Whiteboard/releases/tag/${latestTag}`, '_blank');
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
        const hw = this.canvas.width / 2;
        const hh = this.canvas.height / 2;
        this.camera.x = -hw;
        this.camera.y = -hh;
    }

    _bindResize() {
        window.addEventListener('resize', () => {
            this._resizeCanvas();
            this.renderer.markDirty();
        });
    }

    // ═════════════════════════════════════════════════════
    // Helper – toast notification
    // ═════════════════════════════════════════════════════
    _toast(msg, duration = 2000) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), duration + 300);
    }

    // ═════════════════════════════════════════════════════
    // Zoom Display
    // ═════════════════════════════════════════════════════
    _updateZoomDisplay() {
        const el = document.getElementById('zoom-display');
        // 150% 實際縮放展示為 100%
        if (el) el.textContent = Math.round(this.camera.zoom / 1.5 * 100) + '%';
    }

    // ═════════════════════════════════════════════════════
    // Top Bar Buttons
    // ═════════════════════════════════════════════════════
    _bindTopBar() {
        const $ = id => document.getElementById(id);

        $('btn-undo')?.addEventListener('click', () => { this.history.undo(); this._refreshUI(); });
        $('btn-redo')?.addEventListener('click', () => { this.history.redo(); this._refreshUI(); });

        $('btn-zoom-in')?.addEventListener('click', () => {
            const cx = this.canvas.clientWidth / 2;
            const cy = this.canvas.clientHeight / 2;
            this.camera.zoomAt(1, cx, cy);
            this._updateZoomDisplay();
            this.renderer.markDirty();
        });
        $('btn-zoom-out')?.addEventListener('click', () => {
            const cx = this.canvas.clientWidth / 2;
            const cy = this.canvas.clientHeight / 2;
            this.camera.zoomAt(-1, cx, cy);
            this._updateZoomDisplay();
            this.renderer.markDirty();
        });
        $('zoom-display')?.addEventListener('click', () => {
            this.camera.reset();
            this._updateZoomDisplay();
            this.renderer.markDirty();
        });

        $('btn-export-json')?.addEventListener('click', () => Serializer.exportJSON(this));
        $('btn-export-png')?.addEventListener('click', () => Serializer.exportPNG(this));
        $('btn-import-json')?.addEventListener('click', () => $('json-file-input').click());
        $('btn-settings')?.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) {
                modal.classList.toggle('open');
                if (modal.classList.contains('open')) this._syncSettingsUI();
            }
        });
        $('json-file-input')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                this._skipAutosave = true;  // prevent immediate re-save during import
                await Serializer.importJSON(this, file);
                localStorage.removeItem('wb_autosave'); // clear stale cache
                this._skipAutosave = false;
                this._refreshUI();
                this._toast('已匯入');
            } catch (err) {
                this._skipAutosave = false;
                this._toast('匯入失敗: ' + err.message);
            }
            e.target.value = '';
        });
    }

    // ═════════════════════════════════════════════════════
    // Refresh UI panels after state change
    // ═════════════════════════════════════════════════════
    _refreshUI() {
        this.propertyPanel.update();
        this.layerPanel.update();
        this._updateZoomDisplay();
        this.renderer.markDirty();
        this._autosave();
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
        this.canvas.addEventListener('dblclick',     e => this._onDoubleClick(e));

        // Custom context menu (replaces browser default)
        this.canvas.addEventListener('contextmenu', e => this._showContextMenu(e));
    }

    // ────────── Pointer Down ────────────────────────────
    _onPointerDown(e) {
        this.canvas.setPointerCapture(e.pointerId);
        const { sx, sy } = this._screenPos(e);
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
            this._startCreating(tool, wx, wy);
            return;
        }

        // ── Text tool ──────────────────────────────
        if (tool === 'text') {
            this._createTextAt(wx, wy);
            return;
        }

        // ── Data structures: drag to size ──
        if (['matrix', 'stack', 'queue'].includes(tool)) {
            this._startCreating(tool, wx, wy);
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
            penEl.color = '#e0e0e0';
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
        const { sx, sy } = this._screenPos(e);
        const { x: wx, y: wy } = this._worldPos(e);

        // ── Panning ────────────────────────────────
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
        if (this.transform.mode) {
            this.transform.update(wx, wy, e.shiftKey);
            // Compute snap preview for endpoint drag
            if (this.transform.mode === 'endpoint') {
                this._snapPreview = this._findSnapPort(wx, wy, this.transform.targetElement);
                this.renderer.markDirty();
            }
            this._refreshUI();
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
        if (e.pointerId) {
            try { this.canvas.releasePointerCapture(e.pointerId); } catch(err) {}
        }
        const { x: wx, y: wy } = this._worldPos(e);

        // ── Revert temporary right-click tool toggle ──
        if (e.button === 2 && this._tempRightClickTool) {
            this.toolbar.setTool(this._tempRightClickTool);
            this._tempRightClickTool = null;
            if (this._isPanning) {
                this._isPanning = false;
                this._lastPanScreen = null;
                this.canvas.style.cursor = '';
            }
            if (this.selectionManager.rubberBand) {
                this.selectionManager.finishRubberBand(e.shiftKey);
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
            return;
        }

        // ── Finish pen drawing ─────────────────────
        if (this._isPenDrawing && this._penElement) {
            const el = this._penElement;
            el.addPoint(wx, wy); // capture final position
            if (el.points.length >= 2) {
                if (el.optimize) el.optimize(2 / this.camera.zoom);
                this.layerManager._reindex();
                this.history.pushAdd(this, el);
                this.selectionManager.select(el);
                this.toolbar.setTool('select');
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
            this._finishCreating(e.shiftKey);
            return;
        }

        // ── Finish transform ───────────────────────
        if (this.transform.mode) {
            const info = this.transform.finish();
            if (info) {
                if (info.mode === 'endpoint') {
                    const el = info.element;
                    const snap = this._snapPreview;
                    if (snap) {
                        // Snap endpoint to connection port
                        const ep = info._ep;
                        if (info.epIndex === 0) {
                            el.x = snap.x; el.y = snap.y;
                            el.width  = ep.p2x - snap.x;
                            el.height = ep.p2y - snap.y;
                            el.connections.p1 = { elementId: snap.elementId, portId: snap.portId };
                        } else {
                            el.x = ep.p1x; el.y = ep.p1y;
                            el.width  = snap.x - ep.p1x;
                            el.height = snap.y - ep.p1y;
                            el.connections.p2 = { elementId: snap.elementId, portId: snap.portId };
                        }
                    }
                    this._snapPreview = null;
                    this.renderer.markDirty();
                }
                if (info.mode === 'drag') {
                    const moves = info.elements.filter(m =>
                        m.fromX !== m.toX || m.fromY !== m.toY
                    );
                    if (moves.length) {
                        this.history.pushMove(moves);
                        // Update any lines connected to moved elements
                        this._updateConnectedLines(moves.map(m => m.el.id));
                    }
                }
                if (info.mode === 'resize') {
                    this.history.pushResize(info.element, info.fromBounds, info.toBounds);
                    this._updateConnectedLines([info.element.id]);
                }
                if (info.mode === 'rotate') {
                    this.history.pushRotate(info.element, info.fromRotation, info.toRotation);
                    this._updateConnectedLines([info.element.id]);
                }
            }
            this._refreshUI();
            return;
        }

        // ── Finish rubber-band selection ───────────
        if (this.selectionManager.rubberBand) {
            this.selectionManager.finishRubberBand(e.shiftKey);
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
    _onDoubleClick(e) {
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
                    this._editMatrixCell(hit, cell.row, cell.col);
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
            }
            this._showTreeDialog(hit);
            return;
        }

        // ── Graph → input dialog ───────────────────
        if (hit.type === 'graph') {
            this._showGraphDialog(hit);
            return;
        }
    }

    // ═════════════════════════════════════════════════════
    // Select Tool – mousedown logic
    // ═════════════════════════════════════════════════════
    _handleSelectDown(wx, wy, e) {
        const sel = this.selectionManager;

        // 0) Check if clicking on an edge "+" add zone (outside any element)
        for (const el of this.elements) {
            if (['matrix', 'stack', 'queue'].includes(el.type) && typeof el.hitTestEdgeAdd === 'function') {
                const edge = el.hitTestEdgeAdd(wx, wy);
                if (edge) {
                    this._handleEdgeInsert(el, edge);
                    return;
                }
            }
        }

        // 1) Check handle hit on currently selected single element
        if (sel.selectedElements.length === 1) {
            const el = sel.selectedElements[0];
            const handle = HitTest.hitTestHandles(el, wx, wy, this.camera);
            if (handle) {
                if (handle.type === 'endpoint') {
                    // Disconnect old connection on this endpoint before dragging
                    if (handle.index === 0) el.connections.p1 = null;
                    else                    el.connections.p2 = null;
                    this.transform.startEndpoint(wx, wy, handle.index, el);
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
            // ── Cell / item selection for already-selected data structures ──
            if (sel.isSelected(hit) && ['matrix', 'stack', 'queue'].includes(hit.type)) {
                if (hit.type === 'matrix' && typeof hit.hitTestCell === 'function') {
                    const cell = hit.hitTestCell(wx, wy);
                    if (cell) {
                        const key = `${cell.row},${cell.col}`;
                        if (e.ctrlKey || e.metaKey) {
                            // Toggle single cell
                            if (hit.selectedCells.has(key)) hit.selectedCells.delete(key);
                            else hit.selectedCells.add(key);
                        } else if (e.shiftKey && hit._lastCellKey) {
                            // Range select
                            const [r0, c0] = hit._lastCellKey.split(',').map(Number);
                            for (let r = Math.min(r0, cell.row); r <= Math.max(r0, cell.row); r++) {
                                for (let c = Math.min(c0, cell.col); c <= Math.max(c0, cell.col); c++) {
                                    hit.selectedCells.add(`${r},${c}`);
                                }
                            }
                        } else {
                            hit.selectedCells.clear();
                            hit.selectedCells.add(key);
                        }
                        hit._lastCellKey = key;
                        this.renderer.markDirty();
                        return; // Don't start drag
                    }
                }
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
                        this._edgePreview = {
                            graphElement: hit,
                            sourceNode: node,
                            x1: hit.x + 20 + node.x,
                            y1: hit.y + 20 + node.y,
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

        // ── Check edge-add zones on data structure elements ──
        let edgeHit = false;
        let dirty = false;
        for (const el of this.elements) {
            if (['matrix', 'stack', 'queue'].includes(el.type) && typeof el.hitTestEdgeAdd === 'function') {
                const prev = el._hoverEdge;
                el._hoverEdge = el.hitTestEdgeAdd(wx, wy);
                if (el._hoverEdge !== prev) dirty = true;
                if (el._hoverEdge) edgeHit = true;
            }
        }
        if (dirty) this.renderer.markDirty();
        if (edgeHit) {
            this.canvas.style.cursor = 'cell';
            return;
        }

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
    _startCreating(tool, wx, wy) {
        this._isCreating = true;
        this._createStart = { wx, wy };
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

        el.color = '#e0e0e0';
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

    _finishCreating(shiftKey = false) {
        const el = this._creatingElement;
        const tool = this._creatingTool;
        const startWx = this._createStart.wx;
        const startWy = this._createStart.wy;

        // Determine if this was a point-click (tiny drag) or real drag
        const isDrag = Math.abs(el.width) > 8 || Math.abs(el.height) > 8;

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
                el.width = 120; el.height = 80;
            }
        }

        this.layerManager._reindex();
        this.history.pushAdd(this, el);
        this.selectionManager.select(el);
        this._isCreating = false;
        this._creatingElement = null;
        this._createStart = null;

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
            this.toolbar.setTool('select');
            if (tool === 'tree') this._showTreeDialog(el);
            else if (tool === 'graph') this._showGraphDialog(el);
            else this._showDataStructureDialog(el);
        } else {
            this.toolbar.setTool('select');
        }
        this._refreshUI();
    }

    _deleteElement(el) {
        const idx = this.elements.indexOf(el);
        if (idx >= 0) this.elements.splice(idx, 1);
        this.selectionManager.selectedElements = this.selectionManager.selectedElements.filter(e => e !== el);
        this.layerManager._reindex();
    }

    // ═════════════════════════════════════════════════════
    // Data Structure Cell Selection Helpers
    // ═════════════════════════════════════════════════════

    /** Clear all cell/item selections from every data structure element. */
    _clearAllCellSelections() {
        let dirty = false;
        for (const el of this.elements) {
            if (el.selectedCells && el.selectedCells.size > 0) { el.selectedCells.clear(); dirty = true; }
            if (el.selectedIndices && el.selectedIndices.size > 0) { el.selectedIndices.clear(); dirty = true; }
            if (el._hoverEdge) { el._hoverEdge = null; dirty = true; }
        }
        if (dirty) this.renderer.markDirty();
    }

    /** Insert a row or column into a data structure element based on the hovered edge. */
    _handleEdgeInsert(el, edge) {
        const EMPTY = '　'; // full-width space used as empty-slot placeholder
        if (el.type === 'matrix') {
            if (edge === 'right')  el.insertCol();
            else if (edge === 'bottom') el.insertRow();
        } else if (el.type === 'stack') {
            // Insert an empty slot at the top (push)
            el.items.push(EMPTY);
            el._updateSize();
            el.inputText = el.items.filter(v => v !== EMPTY).join(' ');
        } else if (el.type === 'queue') {
            // Insert an empty slot at the front (unshift)
            el.items.unshift(EMPTY);
            el._updateSize();
            el.inputText = el.items.filter(v => v !== EMPTY).join(' ');
        }
        this.renderer.markDirty();
    }

    /** Delete selected cells from a MatrixElement. Clears values; removes entire rows/cols if all empty. */
    _deleteSelectedMatrixCells(el) {
        const EMPTY = '　';
        const isEmpty = v => v === '' || v === EMPTY || v == null;
        if (!el.selectedCells || el.selectedCells.size === 0) return;
        // Step 1: clear values of selected cells
        for (const key of el.selectedCells) {
            const [r, c] = key.split(',').map(Number);
            if (el.data[r]) el.data[r][c] = EMPTY;
        }
        el.selectedCells.clear();
        el._lastCellKey = null;
        // Step 2: remove fully-empty rows (from bottom up)
        for (let r = el.rows - 1; r >= 0; r--) {
            if (el.data[r] && el.data[r].every(v => isEmpty(v))) {
                el.deleteRow(r);
            }
        }
        // Step 3: remove fully-empty cols (from right to left)
        for (let c = el.cols - 1; c >= 0; c--) {
            if (el.data.every(row => isEmpty(row[c]))) {
                el.deleteCol(c);
            }
        }
        el.updateTextFromData();
        // Auto-delete element if completely empty
        if (el.rows === 0 || el.cols === 0) {
            this._deleteElement(el);
            this.selectionManager.selectedElements = this.selectionManager.selectedElements.filter(e => e !== el);
        }
        this.renderer.markDirty();
    }

    /** Delete selected items from a StackElement or QueueElement. */
    _deleteSelectedItems(el) {
        if (!el.selectedIndices || el.selectedIndices.size === 0) return;
        // Sort descending so splicing doesn't shift indices
        const indices = [...el.selectedIndices].sort((a, b) => b - a);
        for (const idx of indices) {
            el.items.splice(idx, 1);
        }
        el.selectedIndices.clear();
        el._lastItemIdx = -1;
        el._updateSize();
        el.inputText = el.items.filter(v => v !== '　').join(' ');
        // Auto-delete element if completely empty
        if (el.items.length === 0) {
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
        el.autoSize(this.ctx);
        this.elements.push(el);
        this.layerManager._reindex();
        this.history.pushAdd(this, el);
        this.selectionManager.select(el);
        this.toolbar.setTool('select');
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

        const screenTL = this.camera.worldToScreen(el.x, el.y);
        const scaleX = (el._baseWidth && el._baseWidth > 0) ? el.width / el._baseWidth : 1;
        const effectiveFontSize = el.fontSize * scaleX * this.camera.zoom;

        overlay.style.left = screenTL.x + 'px';
        overlay.style.top = screenTL.y + 'px';
        overlay.style.width = (el.width * this.camera.zoom) + 'px';
        overlay.style.height = (el.height * this.camera.zoom) + 'px';
        overlay.style.fontSize = effectiveFontSize + 'px';
        
        if (el.rotation) {
            overlay.style.transformOrigin = 'top left';
            overlay.style.transform = `rotate(${el.rotation}rad)`;
        } else {
            overlay.style.transformOrigin = 'top left';
            overlay.style.transform = 'none';
        }
    }

    _startTextEditing(el) {
        this._textEditing = el;
        el.isEditing = true;
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        overlay.style.cssText = '';
        overlay.className = 'transparent-selection';
        overlay.style.display = 'block';
        this._updateTextEditingOverlay();
        
        overlay.style.fontFamily = el.fontFamily;
        overlay.style.lineHeight = '1.3';
        overlay.style.textAlign = 'left';
        overlay.style.whiteSpace = 'pre';
        overlay.style.color = 'transparent';
        overlay.style.caretColor = el.color || 'var(--text-primary)';
        
        overlay.style.fontWeight = el.isBold ? 'bold' : 'normal';
        overlay.style.fontStyle = el.isItalic ? 'italic' : 'normal';
        overlay.style.textDecoration = el.isUnderline ? 'underline' : 'none';

        overlay.value = el.text;
        overlay.focus();
        overlay.select();

        // Save old text for undo
        this._textEditOld = el.text;

        this._textInputHandler = () => {
            if (this._textEditing) {
                this._textEditing.text = overlay.value;
                this._textEditing.autoSize(this.ctx);
                
                this._updateTextEditingOverlay();
                
                // Reset scroll to prevent misaligned caret
                overlay.scrollLeft = 0;
                overlay.scrollTop = 0;
                
                this.renderer.markDirty();
            }
        };
        overlay.addEventListener('input', this._textInputHandler);

        overlay.onblur = () => this._finishTextEditing();
    }

    _finishTextEditing() {
        if (!this._textEditing) return;
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        overlay.removeEventListener('input', this._textInputHandler);

        const el = this._textEditing;
        const newText = overlay.value;
        const oldText = this._textEditOld;

        if (oldText !== newText) {
            this.history.pushPropertyChange(el, 'text', oldText, newText);
        }

        overlay.style.display = 'none';
        overlay.onblur = null;
        this._textEditing.isEditing = false;
        this._textEditing = null;
        this.renderer.markDirty();
    }

    // ═════════════════════════════════════════════════════
    // Data Structure Creation & Dialog
    // ═════════════════════════════════════════════════════
    _createDataStructure(type, wx, wy) {
        let el;
        if (type === 'matrix') {
            el = new MatrixElement(wx, wy);
        } else if (type === 'stack') {
            el = new StackElement(wx, wy);
        } else {
            el = new QueueElement(wx, wy);
        }
        this.elements.push(el);
        this.layerManager._reindex();
        this.history.pushAdd(this, el);
        this.selectionManager.select(el);
        this.toolbar.setTool('select');

        // Open the input dialog immediately
        this._showDataStructureDialog(el);
        this._refreshUI();
    }

    _showDataStructureDialog(el) {
        const typeLabel = { matrix: '矩陣', stack: '堆疊', queue: '佇列' }[el.type] || el.type;
        const placeholder = el.type === 'matrix'
            ? '輸入矩陣，每行一列，數值以空格分隔\n例：\n1 2 3\n4 5 6\n\n或輸入維度建立空矩陣，例：3*5'
            : '輸入數值，以空格或換行分隔\n例：1 2 3 4 5';
        const oldText = el.inputText || '';
        this.textInputDialog.show({
            title: `編輯${typeLabel}`,
            placeholder,
            defaultText: oldText,
            onInput: (text) => {
                if (!text.trim()) return;
                el.setFromText(text);
                this.renderer.markDirty();
            },
            onCancel: () => {
                if (!oldText.trim()) {
                    this._deleteElement(el);
                } else {
                    el.setFromText(oldText);
                }
                this.renderer.markDirty();
                this._refreshUI();
            },
            onConfirm: (text) => {
                el.setFromText(text);
                if (!text.trim() || (el.width === 0 && el.height === 0)) {
                    this._deleteElement(el);
                    this.renderer.markDirty();
                    this._refreshUI();
                    return;
                }
                if (oldText !== text) {
                    this.history.push({
                        description: `Edit ${el.type}`,
                        undo: () => { 
                            if (!this.elements.includes(el)) {
                                this.elements.push(el);
                                this.layerManager._reindex();
                            }
                            el.setFromText(oldText); 
                        },
                        redo: () => { 
                            if (!this.elements.includes(el)) {
                                this.elements.push(el);
                                this.layerManager._reindex();
                            }
                            el.setFromText(text); 
                        }
                    });
                }
                this.renderer.markDirty();
                this._refreshUI();
            }
        });
    }

    // ═════════════════════════════════════════════════════
    // Tree Creation & Dialog
    // ═════════════════════════════════════════════════════
    _createTree(wx, wy) {
        const el = new TreeElement(wx, wy);
        this.elements.push(el);
        this.layerManager._reindex();
        this.history.pushAdd(this, el);
        this.selectionManager.select(el);
        this.toolbar.setTool('select');
        this._showTreeDialog(el);
        this._refreshUI();
    }

    _showTreeDialog(el) {
        const originalText = el.inputText || '';
        const originalType = el.treeType;
        this.textInputDialog.show({
            title: '編輯樹',
            placeholder: '邊列表格式（首行節點數，其後每行：父 子）\n或層序數值列表',
            defaultText: originalText,
            showTypeSelect: true,
            types: [
                { value: 'binary', label: '二元樹', selected: el.treeType === 'binary' },
                { value: 'bst', label: 'BST', selected: el.treeType === 'bst' },
                { value: 'avl', label: 'AVL', selected: el.treeType === 'avl' },
                { value: 'rb', label: '紅黑樹', selected: el.treeType === 'rb' }
            ],
            showModeSelect: true,
            onInput: (text, type, mode) => {
                if (!text.trim()) return;
                const prevType = el.treeType;
                if (type) el.treeType = type;
                el.buildFromText(text, mode || 'values');
                if (!type) el.treeType = prevType;
                this.renderer.markDirty();
            },
            onCancel: () => {
                if (!originalText.trim()) {
                    this._deleteElement(el);
                } else {
                    el.treeType = originalType;
                    el.buildFromText(originalText, el._detectMode(originalText));
                }
                this.renderer.markDirty();
                this._refreshUI();
            },
            onConfirm: (text, type, mode) => {
                if (type) el.treeType = type;
                const error = el.buildFromText(text, mode || 'values');
                if (!text.trim() || (el.width === 0 && el.height === 0)) {
                    this._deleteElement(el);
                    this.renderer.markDirty();
                    this._refreshUI();
                    return;
                }
                if (error) {
                    this._toast('⚠ ' + error, 4000);
                }
                if (originalText !== text || originalType !== type) {
                    this.history.push({
                        description: 'Edit Tree',
                        undo: () => {
                            if (!this.elements.includes(el)) {
                                this.elements.push(el);
                                this.layerManager._reindex();
                            }
                            el.treeType = originalType;
                            if (originalText) el.buildFromText(originalText, el._detectMode(originalText));
                            else { el.root = null; el.inputText = ''; }
                        },
                        redo: () => {
                            if (!this.elements.includes(el)) {
                                this.elements.push(el);
                                this.layerManager._reindex();
                            }
                            el.treeType = type || originalType;
                            el.buildFromText(text, mode || 'values');
                        }
                    });
                }
                this.renderer.markDirty();
                this._refreshUI();
            }
        });
    }

    // ═════════════════════════════════════════════════════
    // Graph Creation & Dialog
    // ═════════════════════════════════════════════════════
    _createGraph(wx, wy) {
        const el = new GraphElement(wx, wy);
        this.elements.push(el);
        this.layerManager._reindex();
        this.history.pushAdd(this, el);
        this.selectionManager.select(el);
        this.toolbar.setTool('select');
        this._showGraphDialog(el);
        this._refreshUI();
    }

    _showGraphDialog(el) {
        const originalText = el.inputText || '';
        const originalDirected = el.directed;

        this.textInputDialog.show({
            title: '編輯圖',
            placeholder: '第一行: N M (節點數 邊數)\n之後每行: u v [w]\n例：\n4 5\n1 2\n2 3 7\n3 4\n4 1\n1 3',
            defaultText: originalText,
            showDirectedCheckbox: true,
            directed: originalDirected,
            onInput: (text, _type, _mode, directed) => {
                if (!text.trim()) return;
                el.buildFromText(text, directed);
                this.renderer.markDirty();
            },
            onCancel: () => {
                if (!originalText.trim()) {
                    this._deleteElement(el);
                } else {
                    el.buildFromText(originalText, originalDirected);
                }
                this.renderer.markDirty();
                this._refreshUI();
            },
            onConfirm: (text, _type, _mode, directed) => {
                el.buildFromText(text, directed);
                
                if (!text.trim() || (el.width === 0 && el.height === 0)) {
                    this._deleteElement(el);
                    this.renderer.markDirty();
                    this._refreshUI();
                    return;
                }
                
                if (originalText !== text || originalDirected !== directed) {
                    this.history.push({
                        description: 'Edit Graph',
                        undo: () => {
                            if (!this.elements.includes(el)) {
                                this.elements.push(el);
                                this.layerManager._reindex();
                            }
                            if (originalText) el.buildFromText(originalText, originalDirected);
                            else { el.nodes.clear(); el.edges = []; el.inputText = ''; el.directed = originalDirected; }
                        },
                        redo: () => { 
                            if (!this.elements.includes(el)) {
                                this.elements.push(el);
                                this.layerManager._reindex();
                            }
                            el.buildFromText(text, directed); 
                        }
                    });
                }
                this.renderer.markDirty();
                this._refreshUI();
            }
        });
    }

    // ═════════════════════════════════════════════════════
    // Matrix Cell Inline Edit
    // ═════════════════════════════════════════════════════
    _editMatrixCell(matrixEl, row, col) {
        const pad = 10;
        const cellWorldX = matrixEl.x + pad + col * matrixEl.cellSize;
        const cellWorldY = matrixEl.y + pad + row * matrixEl.cellSize;
        const cellScreen = this.camera.worldToScreen(cellWorldX, cellWorldY);
        const cellSizeScreen = matrixEl.cellSize * this.camera.zoom;

        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        overlay.style.cssText = '';
        overlay.className = '';
        
        // Style to match the matrix cell exactly (no visible "floating" box)
        const cellColor = matrixEl.color || '#e0e0e0';
        overlay.style.display = 'block';
        overlay.style.left = cellScreen.x + 'px';
        overlay.style.top = cellScreen.y + 'px';
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
        // Strip full-width space sentinel (　) when entering edit mode
        const rawVal = String(matrixEl.data[row]?.[col] ?? '');
        overlay.value = rawVal === '　' ? '' : rawVal;
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
        };

        const finishEdit = () => {
            const newValue = overlay.value.trim();
            if (matrixEl.data[row]) {
                matrixEl.data[row][col] = newValue;
                if (matrixEl.updateTextFromData) matrixEl.updateTextFromData();
            }
            overlay.style.display = 'none';
            resetOverlayStyle();
            overlay.onblur = null;
            overlay.onkeydown = null;
            if (oldValue !== newValue) {
                this.history.push({
                    description: 'Edit Matrix Cell',
                    undo: () => { 
                        if (matrixEl.data[row]) matrixEl.data[row][col] = oldValue; 
                        if (matrixEl.updateTextFromData) matrixEl.updateTextFromData();
                    },
                    redo: () => { 
                        if (matrixEl.data[row]) matrixEl.data[row][col] = newValue; 
                        if (matrixEl.updateTextFromData) matrixEl.updateTextFromData();
                    }
                });
            }
            this.renderer.markDirty();
        };

        overlay.onblur = finishEdit;
        overlay.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); overlay.blur(); }
            if (e.key === 'Escape') { overlay.value = String(oldValue ?? ''); overlay.blur(); }
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
    // Tree Node Inline Value Edit
    // ═════════════════════════════════════════════════════
    _editTreeNodeValue(treeEl, treeNode, wx, wy) {
        const { offsetX, offsetY } = treeEl._getCurrentOffsets();
        const nodeScreenPos = this.camera.worldToScreen(
            treeNode.x + offsetX,
            treeNode.y + offsetY
        );
        const r = treeEl.nodeRadius * this.camera.zoom;

        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        overlay.style.cssText = '';
        overlay.className = '';
        
        overlay.style.display = 'block';
        overlay.style.left = (nodeScreenPos.x - r) + 'px';
        overlay.style.top = (nodeScreenPos.y - r / 2) + 'px';
        overlay.style.width = (r * 2) + 'px';
        overlay.style.height = r + 'px';
        overlay.style.fontSize = (13 * this.camera.zoom) + 'px';
        overlay.style.textAlign = 'center';
        overlay.style.background = 'var(--bg-panel, #2a2a2a)';
        overlay.style.color = 'var(--text-primary, #fff)';
        overlay.style.border = '1px solid var(--accent, #6366f1)';
        overlay.style.borderRadius = '4px';
        overlay.value = String(treeNode.value);
        overlay.focus();
        overlay.select();

        const oldValue = treeNode.value;

        const finishEdit = () => {
            const newValue = overlay.value.trim() || oldValue;
            treeNode.value = newValue;
            overlay.style.display = 'none';
            overlay.style.textAlign = '';
            overlay.onblur = null;
            if (oldValue !== newValue) {
                this.history.push({
                    description: 'Edit Tree Node',
                    undo: () => { treeNode.value = oldValue; },
                    redo: () => { treeNode.value = newValue; }
                });
            }
            this.renderer.markDirty();
        };

        overlay.onblur = finishEdit;
        overlay.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); overlay.blur(); }
            if (e.key === 'Escape') { overlay.value = String(oldValue); overlay.blur(); }
        };
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
            graph.addEdge(ep.sourceNode.id, tgtNode.id);
            this.history.push({
                description: 'Add Edge',
                undo: () => {
                    graph.edges.pop();
                },
                redo: () => {
                    graph.addEdge(ep.sourceNode.id, tgtNode.id);
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
            const { sx, sy } = this._screenPos(e);

            if (e.ctrlKey) {
                // Pinch gesture (ctrlKey=true on trackpad pinch) or Ctrl+scroll → ZOOM
                this.camera.zoomAt(-e.deltaY, sx, sy);
                this._updateZoomDisplay();
            } else {
                // Regular scroll → PAN (反轉方向：向下滚 = 畫布向上移)
                let dx = e.deltaX, dy = e.deltaY;
                if (e.deltaMode === 1) { dx *= 16; dy *= 16; }   // lines → pixels
                if (e.deltaMode === 2) { dx *= 200; dy *= 200; } // pages → pixels
                this.camera.pan(-dx, -dy);  // 反轉
            }

            this.renderer.markDirty();
            
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
            // Ignore when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            const ctrl = e.ctrlKey || e.metaKey;

            // ── Escape  Close Modal / Reset Tool / Clear cell selection ──
            if (e.key === 'Escape') {
                document.getElementById('settings-modal')?.classList.remove('open');
                this._clearAllCellSelections();
                this.setTool('select');
                return;
            }

            // ── Delete ─────────────────────────────
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // First check if any data structure has selected cells/items
                const dsEl = this.selectionManager.selectedElements.find(el =>
                    (el.type === 'matrix' && el.selectedCells && el.selectedCells.size > 0) ||
                    ((el.type === 'stack' || el.type === 'queue') && el.selectedIndices && el.selectedIndices.size > 0)
                );
                if (dsEl) {
                    if (dsEl.type === 'matrix') this._deleteSelectedMatrixCells(dsEl);
                    else this._deleteSelectedItems(dsEl);
                    return;
                }
                // Otherwise delete entire selected elements
                const toRemove = this.selectionManager.selectedElements.slice();
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
                e.preventDefault();
                this._copyToClipboard();
                return;
            }

            // ── Ctrl+X  Cut ───────────────────────
            if (ctrl && isCut) {
                e.preventDefault();
                this._copyToClipboard();
                const toRemove = this.selectionManager.selectedElements.slice();
                if (toRemove.length) {
                    this.history.pushDelete(this, toRemove);
                    this.selectionManager.deleteSelected();
                    this._refreshUI();
                }
                return;
            }

            // ── Ctrl+V  Paste ─────────────────────
            if (ctrl && isPaste) {
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
                return;
            }
            if (ctrl && e.key === '-') {
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                this.camera.zoomAt(-1, rect.width / 2, rect.height / 2);
                this._updateZoomDisplay();
                this.renderer.markDirty();
                return;
            }

            // ── Escape ──────────────────────────
            if (e.key === 'Escape') {
                this.selectionManager.clear();
                this._finishTextEditing();
                this._edgePreview = null;
                if (this._isCreating) {
                    // Cancel creation
                    const idx = this.elements.indexOf(this._creatingElement);
                    if (idx >= 0) this.elements.splice(idx, 1);
                    this._isCreating = false;
                    this._creatingElement = null;
                }
                this.transform.cancel();
                this.toolbar.setTool('select');
                this._refreshUI();
                return;
            }

            // ── Space  Toggle pan mode (hold) ──
            if (e.key === ' ' && !e.repeat) {
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
            if (el === excludeEl) continue;
            if (!el.getConnectionPorts) continue;
            const ports = el.getConnectionPorts();
            for (const port of ports) {
                const d = Math.hypot(wx - port.x, wy - port.y);
                if (d < SNAP_RADIUS && d < bestDist) {
                    bestDist = d;
                    best = { x: port.x, y: port.y, elementId: el.id, portId: port.id };
                }
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
        for (const el of this.elements) {
            if (el.shapeType !== 'line' && el.shapeType !== 'arrow') continue;
            const { p1, p2 } = el.connections;
            if (p1 && idSet.has(p1.elementId)) {
                const target = this.elements.find(e => e.id === p1.elementId);
                if (target) {
                    const port = target.getConnectionPorts().find(p => p.id === p1.portId);
                    if (port) {
                        const ep = { p2x: el.x + el.width, p2y: el.y + el.height };
                        el.x = port.x; el.y = port.y;
                        el.width  = ep.p2x - port.x;
                        el.height = ep.p2y - port.y;
                    }
                }
            }
            if (p2 && idSet.has(p2.elementId)) {
                const target = this.elements.find(e => e.id === p2.elementId);
                if (target) {
                    const port = target.getConnectionPorts().find(p => p.id === p2.portId);
                    if (port) {
                        el.width  = port.x - el.x;
                        el.height = port.y - el.y;
                    }
                }
            }
        }
        this.renderer.markDirty();
    }

    // ═════════════════════════════════════════════════════
    // Focus Camera on Element
    // ═════════════════════════════════════════════════════
    _focusOnElement(el) {
        const b = el.getBounds ? el.getBounds() : { x: el.x, y: el.y, w: el.width || 100, h: el.height || 100 };
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const sw = this.canvas.clientWidth;
        const sh = this.canvas.clientHeight;
        this.camera.x = cx - sw / 2 / this.camera.zoom;
        this.camera.y = cy - sh / 2 / this.camera.zoom;
        this.renderer.markDirty();
    }

    // ═════════════════════════════════════════════════════
    // Context Menu (Right-click)
    // ═════════════════════════════════════════════════════
    _showContextMenu(e) {
        e.preventDefault();
        const { x: wx, y: wy } = this._worldPos(e);
        const hit = HitTest.hitTestAll(this.elements, wx, wy, this.camera);

        if (hit) {
            this.selectionManager.select(hit);
            this._refreshUI();
        }
        this._ctxTarget = hit;

        const menu = document.getElementById('context-menu');
        if (!menu) return;

        // Don't show menu on empty canvas
        if (!hit) { menu.style.display = 'none'; return; }

        // Show all element-specific items
        const hasEl = true;
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
        const vw = window.innerWidth, vh = window.innerHeight;
        const mw = 180, mh = hasEl ? 270 : 8;
        let mx = e.clientX, my = e.clientY;
        if (mx + mw > vw) mx = vw - mw - 4;
        if (my + mh > vh) my = vh - mh - 4;
        menu.style.left = mx + 'px';
        menu.style.top = my + 'px';
        menu.style.display = 'block';
    }

    _hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
        this._ctxTarget = null;
    }

    _startRename(el) {
        const inp = document.getElementById('rename-input');
        if (!inp) return;
        const b = el.getBounds ? el.getBounds() : { x: el.x, y: el.y, w: el.width || 60, h: el.height || 40 };
        const rect = this.canvas.getBoundingClientRect();
        const sp = this.camera.worldToScreen(b.x + b.w / 2, b.y + b.h / 2);
        inp.value = el.label || el.type;
        inp.style.left = Math.max(4, rect.left + sp.x - 80) + 'px';
        inp.style.top = Math.max(4, rect.top + sp.y - 16) + 'px';
        inp.style.display = 'block';
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
            if (!el) return;
            this.history.pushDelete(this, [el]);
            const idx = this.elements.indexOf(el);
            if (idx >= 0) this.elements.splice(idx, 1);
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
        this._clipboard = sel.map(el => el.serialize());
    }

    _pasteFromClipboard() {
        if (!this._clipboard || !this._clipboard.length) return;
        const newEls = [];
        for (const data of this._clipboard) {
            const newData = JSON.parse(JSON.stringify(data));
            // Remove id to get new one
            delete newData.id;
            // Offset slightly
            newData.x += 20;
            newData.y += 20;
            let newEl;
            const TYPE_MAP = {
                rectangle: ShapeElement, circle: ShapeElement, ellipse: ShapeElement,
                line: ShapeElement, arrow: ShapeElement,
                text: TextElement, matrix: MatrixElement, stack: StackElement,
                queue: QueueElement, mermaid: MermaidElement,
                pen: PenElement, tree: TreeElement, graph: GraphElement
            };
            const Cls = TYPE_MAP[newData.type];
            if (!Cls) continue;
            newEl = Cls.fromData ? Cls.fromData(newData) : new Cls();
            newEl.deserialize(newData);
            this.elements.push(newEl);
            newEls.push(newEl);
            
            // Also update the clipboard data so next paste offsets again!
            data.x += 20;
            data.y += 20;
        }
        if (newEls.length) {
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
        const sel = this.selectionManager.selectedElements;
        if (!sel.length) return;
        const newEls = [];
        for (const el of sel) {
            const data = JSON.parse(JSON.stringify(el.serialize()));
            // Remove id to get new one
            delete data.id;
            // Offset
            data.x += 20;
            data.y += 20;
            let newEl;
            const TYPE_MAP = {
                rectangle: ShapeElement, circle: ShapeElement, ellipse: ShapeElement,
                line: ShapeElement, arrow: ShapeElement,
                text: TextElement, matrix: MatrixElement, stack: StackElement,
                queue: QueueElement, mermaid: MermaidElement,
                pen: PenElement
            };
            const Cls = TYPE_MAP[data.type];
            if (!Cls) continue;
            newEl = Cls.fromData ? Cls.fromData(data) : new Cls();
            newEl.deserialize(data);
            // Assign new id
            newEl.id = undefined; // will be set by constructor next time...
            const nextEl = new Element('_tmp');
            newEl.id = nextEl.id;
            // Remove the tmp from nothing
            this.elements.push(newEl);
            newEls.push(newEl);
        }
        if (newEls.length) {
            this.history.pushAdd(this, newEls);
        }
        this.selectionManager.selectedElements = newEls;
        this.layerManager._reindex();
        this._refreshUI();
    }

    _duplicateAndTransformMatrix(el, transformType) {
        const data = JSON.parse(JSON.stringify(el.serialize()));
        delete data.id;
        data.x += 50;
        data.y += 50;
        
        let matrixData = data.data.map(row => row.map(val => Number(val) || 0));
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
        
        // Convert to string and set
        const newText = newMatrixData.map(row => row.join(' ')).join('\n');
        data.inputText = newText;
        data.data = newMatrixData.map(row => row.map(String));
        data.rows = newMatrixData.length;
        data.cols = (newMatrixData[0] || []).length;
        
        const newEl = MatrixElement.fromData(data);
        newEl.deserialize(data);
        
        // Assign fresh ID
        const nextEl = new Element('_tmp');
        newEl.id = nextEl.id;
        
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
                e.currentTarget.classList.remove('open');
            }
        });
        document.getElementById('settings-close')?.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.remove('open');
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

    _saveSettings() {
        try { localStorage.setItem('wb_settings', JSON.stringify(this.settings)); } catch (_) {}
    }

    _loadSettings() {
        try {
            const raw = localStorage.getItem('wb_settings');
            if (raw) {
                Object.assign(this.settings, JSON.parse(raw));
                // Apply persisted grid spacing immediately
                if (this.grid && this.settings.gridSpacing) {
                    this.grid.baseSpacing = this.settings.gridSpacing;
                }
            }
        } catch (_) {}
    }

    // ═════════════════════════════════════════════════════
    // localStorage Autosave
    // ═════════════════════════════════════════════════════
    _autosave() {
        if (this._skipAutosave) return;
        if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
        this._autosaveTimer = setTimeout(() => {
            try {
                const data = {
                    version: 1,
                    elements: this.elements.map(el => el.serialize()),
                    camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }
                };
                localStorage.setItem('wb_autosave', JSON.stringify(data));
            } catch (e) {
                console.warn('[Autosave]', e);
            }
        }, 1200);
    }

    _tryLoadAutosave() {
        try {
            const raw = localStorage.getItem('wb_autosave');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data?.elements?.length) return;
            // Silently restore — no prompt (avoids repeated reload confusion)
            this._restoreFromData(data);
        } catch (e) {
            console.error('[Autosave load ERROR]', e.stack || e);
            alert('解析自動存檔 JSON 時發生錯誤: ' + e.message);
        }
    }

    _restoreFromData(data) {
        try {
            const TYPE_MAP = {
                rectangle: ShapeElement, circle: ShapeElement, ellipse: ShapeElement,
                line: ShapeElement, arrow: ShapeElement,
                text: TextElement, matrix: MatrixElement,
                stack: StackElement, queue: QueueElement,
                mermaid: MermaidElement,
                pen: PenElement, tree: TreeElement, graph: GraphElement
            };
            this._skipAutosave = true;
            this.elements = [];
            let maxId = 0;
            for (const ed of data.elements) {
                const Cls = TYPE_MAP[ed.type];
                if (!Cls) continue;
                const el = Cls.fromData ? Cls.fromData(ed) : new Cls();
                el.deserialize(ed);
                if (el.id > maxId) maxId = el.id;
                this.elements.push(el);
            }
            Element.resetIdCounter(maxId);
            if (data.camera) {
                this.camera.x = data.camera.x;
                this.camera.y = data.camera.y;
                this.camera.zoom = data.camera.zoom;
            }
            this._skipAutosave = false;
            this._refreshUI();
            // (silent restore — no toast)
        } catch (e) {
            this._skipAutosave = false;
            console.error('[Autosave restore ERROR]', e.stack || e);
            alert('載入自動存檔時發生錯誤: ' + e.message);
        }
    }
}

// ── Boot ────────────────────────────────────────────────
const app = new App();

// Expose for debugging
window.__whiteboard = app;
