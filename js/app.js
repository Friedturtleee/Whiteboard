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
        this._bindMouse();
        this._bindWheel();
        this._bindKeyboard();
        this._bindTopBar();
        this._bindContextMenu();
        this._bindResize();

        // ── Start Render Loop ───────────────────────────
        this.renderer.start();
        this._updateZoomDisplay();

        // ── Autosave ─────────────────────────────────────
        this._autosaveTimer = null;
        this._skipAutosave = false;
        this._tryLoadAutosave();
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
        if (e.button === 2) return;

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

        // ── Data structures & tree/graph: drag to size ──
        if (['matrix', 'stack', 'queue', 'tree', 'graph'].includes(tool)) {
            this._startCreating(tool, wx, wy);
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
        const { x: wx, y: wy } = this._worldPos(e);

        // ── Finish panning ─────────────────────────
        if (this._isPanning) {
            this._isPanning = false;
            this._lastPanScreen = null;
            this.canvas.style.cursor = '';
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

            // ── Tree node → select the tree element ─
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
            // Click on empty space → start rubber-band
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
        if (['matrix', 'stack', 'queue'].includes(tool)) {
            this.toolbar.setTool('select');
            this._showDataStructureDialog(el);
        } else if (tool === 'tree') {
            this.toolbar.setTool('select');
            this._showTreeDialog(el);
        } else if (tool === 'graph') {
            this.toolbar.setTool('select');
            this._showGraphDialog(el);
        } else {
            this.toolbar.setTool('select');
        }
        this._refreshUI();
    }

    // ═════════════════════════════════════════════════════
    // Text Element Creation
    // ═════════════════════════════════════════════════════
    _createTextAt(wx, wy) {
        const el = new TextElement(wx, wy);
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
    _startTextEditing(el) {
        this._textEditing = el;
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        const b = el.getBounds();
        const screenTL = this.camera.worldToScreen(b.x, b.y);

        overlay.style.display = 'block';
        overlay.style.left = screenTL.x + 'px';
        overlay.style.top = screenTL.y + 'px';
        overlay.style.width = (b.w * this.camera.zoom) + 'px';
        overlay.style.height = (b.h * this.camera.zoom) + 'px';
        overlay.style.fontSize = (el.fontSize * this.camera.zoom) + 'px';
        overlay.value = el.text;
        overlay.focus();
        overlay.select();

        // Save old text for undo
        this._textEditOld = el.text;

        overlay.onblur = () => this._finishTextEditing();
    }

    _finishTextEditing() {
        if (!this._textEditing) return;
        const overlay = document.getElementById('text-edit-overlay');
        if (!overlay) return;

        const el = this._textEditing;
        const newText = overlay.value;
        const oldText = this._textEditOld;

        el.text = newText;
        el.autoSize(this.ctx);

        if (oldText !== newText) {
            this.history.pushPropertyChange(el, 'text', oldText, newText);
        }

        overlay.style.display = 'none';
        overlay.onblur = null;
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
        this.textInputDialog.show({
            title: `編輯${typeLabel}`,
            placeholder,
            defaultText: el.inputText || '',
            onInput: (text) => {
                if (!text.trim()) return;
                el.setFromText(text);
                this.renderer.markDirty();
            },
            onConfirm: (text) => {
                const oldText = el.inputText || '';
                el.setFromText(text);
                if (oldText !== text) {
                    this.history.push({
                        description: `Edit ${el.type}`,
                        undo: () => { el.setFromText(oldText); },
                        redo: () => { el.setFromText(text); }
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
        this.textInputDialog.show({
            title: '編輯樹',
            placeholder: '父節點格式（每行：值 父值）或數值列表',
            defaultText: el.inputText || '',
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
            onConfirm: (text, type, mode) => {
                const oldText = el.inputText || '';
                const oldType = el.treeType;
                if (type) el.treeType = type;
                const error = el.buildFromText(text, mode || 'values');
                if (error) {
                    this._toast('⚠ ' + error, 4000);
                }
                if (oldText !== text || oldType !== type) {
                    this.history.push({
                        description: 'Edit Tree',
                        undo: () => {
                            el.treeType = oldType;
                            if (oldText) el.buildFromText(oldText, el._detectMode(oldText));
                            else { el.root = null; el.inputText = ''; }
                        },
                        redo: () => {
                            el.treeType = type || oldType;
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
        this.textInputDialog.show({
            title: '編輯圖',
            placeholder: '第一行: N M (節點數 邊數)\n之後每行: u v [w]\n例：\n4 5\n1 2\n2 3 7\n3 4\n4 1\n1 3',
            defaultText: el.inputText || '',
            showDirectedCheckbox: true,
            directed: el.directed,
            onInput: (text, _type, _mode, directed) => {
                if (!text.trim()) return;
                el.buildFromText(text, directed);
                this.renderer.markDirty();
            },
            onConfirm: (text, _type, _mode, directed) => {
                const oldText = el.inputText || '';
                const oldDirected = el.directed;
                el.buildFromText(text, directed);
                if (oldText !== text || oldDirected !== directed) {
                    this.history.push({
                        description: 'Edit Graph',
                        undo: () => {
                            if (oldText) el.buildFromText(oldText, oldDirected);
                            else { el.nodes.clear(); el.edges = []; el.inputText = ''; el.directed = oldDirected; }
                        },
                        redo: () => { el.buildFromText(text, directed); }
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
        overlay.value = String(matrixEl.data[row]?.[col] ?? '');
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
            }
            overlay.style.display = 'none';
            resetOverlayStyle();
            overlay.onblur = null;
            overlay.onkeydown = null;
            if (oldValue !== newValue) {
                this.history.push({
                    description: 'Edit Matrix Cell',
                    undo: () => { if (matrixEl.data[row]) matrixEl.data[row][col] = oldValue; },
                    redo: () => { if (matrixEl.data[row]) matrixEl.data[row][col] = newValue; }
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

        overlay.style.display = 'block';
        overlay.style.left = (nodeScreenPos.x - r) + 'px';
        overlay.style.top = (nodeScreenPos.y - r / 2) + 'px';
        overlay.style.width = (r * 2) + 'px';
        overlay.style.height = r + 'px';
        overlay.style.fontSize = (13 * this.camera.zoom) + 'px';
        overlay.style.textAlign = 'center';
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

            // ── Delete ─────────────────────────────
            if (e.key === 'Delete' || e.key === 'Backspace') {
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

            // ── Ctrl+S  Export JSON ───────────────
            if (ctrl && e.key === 's') {
                e.preventDefault();
                Serializer.exportJSON(this);
                this._toast('已匯出 JSON');
                return;
            }

            // ── Ctrl+D  Duplicate ────────────────
            if (ctrl && e.key === 'd') {
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
    // Duplicate
    // ═════════════════════════════════════════════════════
    _duplicateSelected() {
        const sel = this.selectionManager.selectedElements;
        if (!sel.length) return;
        const newEls = [];
        for (const el of sel) {
            const data = el.serialize();
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
                queue: QueueElement, tree: TreeElement, graph: GraphElement
            };
            const Cls = TYPE_MAP[data.type];
            if (!Cls) continue;
            newEl = Cls.fromData ? Cls.fromData(data) : new Cls();
            newEl.deserialize(data);
            // Assign new id
            newEl.id = undefined; // will be set by constructor next time...
            // Actually we need a fresh id — let's use the Element constructor's counter
            const nextEl = new Element('_tmp');
            newEl.id = nextEl.id;
            // Remove the tmp from nothing
            this.elements.push(newEl);
            newEls.push(newEl);
            this.history.pushAdd(this, newEl);
        }
        this.selectionManager.selectedElements = newEls;
        this.layerManager._reindex();
        this._refreshUI();
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
            console.warn('[Autosave load]', e);
        }
    }

    _restoreFromData(data) {
        try {
            const TYPE_MAP = {
                rectangle: ShapeElement, circle: ShapeElement, ellipse: ShapeElement,
                line: ShapeElement, arrow: ShapeElement,
                text: TextElement, matrix: MatrixElement,
                stack: StackElement, queue: QueueElement,
                tree: TreeElement, graph: GraphElement,
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
            console.warn('[Autosave restore]', e);
        }
    }
}

// ── Boot ────────────────────────────────────────────────
const app = new App();

// Expose for debugging
window.__whiteboard = app;
