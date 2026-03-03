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
        this._bindResize();

        // ── Start Render Loop ───────────────────────────
        this.renderer.start();
        this._updateZoomDisplay();
    }

    // ═════════════════════════════════════════════════════
    // Canvas Sizing (HiDPI)
    // ═════════════════════════════════════════════════════
    _resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.canvas.clientWidth * dpr;
        this.canvas.height = this.canvas.clientHeight * dpr;
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
        if (el) el.textContent = Math.round(this.camera.zoom * 100) + '%';
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
                await Serializer.importJSON(this, file);
                this._refreshUI();
                this._toast('已匯入');
            } catch (err) {
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

        // Prevent context menu on canvas
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
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

        // ── Data structures (click to place) ───────
        if (['matrix', 'stack', 'queue'].includes(tool)) {
            this._createDataStructure(tool, wx, wy);
            return;
        }

        // ── Tree / Graph (click to place placeholder)
        if (tool === 'tree') {
            this._createTree(wx, wy);
            return;
        }
        if (tool === 'graph') {
            this._createGraph(wx, wy);
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
            this._updateCreating(wx, wy);
            return;
        }

        // ── Transform (drag / resize / rotate) ─────
        if (this.transform.mode) {
            this.transform.update(wx, wy, e.shiftKey);
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
            this._finishCreating();
            return;
        }

        // ── Finish transform ───────────────────────
        if (this.transform.mode) {
            const info = this.transform.finish();
            if (info) {
                if (info.mode === 'drag') {
                    const moves = info.elements.filter(m =>
                        m.fromX !== m.toX || m.fromY !== m.toY
                    );
                    if (moves.length) this.history.pushMove(moves);
                }
                if (info.mode === 'resize') {
                    this.history.pushResize(info.element, info.fromBounds, info.toBounds);
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
            this._showDataStructureDialog(hit);
            return;
        }

        // ── Tree → input dialog ────────────────────
        if (hit.type === 'tree') {
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
    // Shape Creation (rectangle / circle / line / arrow)
    // ═════════════════════════════════════════════════════
    _startCreating(tool, wx, wy) {
        this._isCreating = true;
        this._createStart = { wx, wy };
        const el = new ShapeElement(tool, wx, wy, 0, 0);
        el.color = '#e0e0e0';
        this._creatingElement = el;
        this.elements.push(el);
        this.renderer.markDirty();
    }

    _updateCreating(wx, wy) {
        const el = this._creatingElement;
        const start = this._createStart;
        if (el.shapeType === 'line' || el.shapeType === 'arrow') {
            el.width = wx - start.wx;
            el.height = wy - start.wy;
        } else {
            el.x = Math.min(start.wx, wx);
            el.y = Math.min(start.wy, wy);
            el.width = Math.abs(wx - start.wx);
            el.height = Math.abs(wy - start.wy);
        }
        this.renderer.markDirty();
    }

    _finishCreating() {
        const el = this._creatingElement;
        // If too small, treat as a single click → create with default size
        if (Math.abs(el.width) < 5 && Math.abs(el.height) < 5) {
            if (el.shapeType === 'line' || el.shapeType === 'arrow') {
                el.width = 150;
                el.height = 0;
            } else {
                el.width = 120;
                el.height = 80;
            }
        }
        this.layerManager._reindex();
        this.history.pushAdd(this, el);
        this.selectionManager.select(el);
        this._isCreating = false;
        this._creatingElement = null;
        this._createStart = null;
        this.toolbar.setTool('select');
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
            ? '輸入矩陣，每行一列，數值以空格分隔\n例：\n1 2 3\n4 5 6'
            : '輸入數值，以空格或換行分隔\n例：1 2 3 4 5';
        this.textInputDialog.show({
            title: `編輯${typeLabel}`,
            placeholder,
            defaultText: el.inputText || '',
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
            onConfirm: (text, type, mode) => {
                const oldText = el.inputText || '';
                const oldType = el.treeType;
                if (type) el.treeType = type;
                el.buildFromText(text, mode || 'values');
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
    // Wheel (Zoom)
    // ═════════════════════════════════════════════════════
    _bindWheel() {
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const { sx, sy } = this._screenPos(e);
            this.camera.zoomAt(-e.deltaY, sx, sy);
            this._updateZoomDisplay();
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
}

// ── Boot ────────────────────────────────────────────────
const app = new App();

// Expose for debugging
window.__whiteboard = app;
