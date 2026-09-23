import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueElement } from '../js/elements/QueueElement.js';
import { StackElement } from '../js/elements/StackElement.js';
import { MatrixElement } from '../js/elements/MatrixElement.js';
import { TextElement } from '../js/elements/TextElement.js';
import { PenElement } from '../js/elements/PenElement.js';
import { Serializer } from '../js/core/Serializer.js';
import { History } from '../js/core/History.js';
import { SelectionManager } from '../js/core/SelectionManager.js';
import { GraphElement } from '../js/graph/GraphElement.js';
import { GraphParser } from '../js/graph/GraphParser.js';
import { GraphLayout } from '../js/graph/GraphLayout.js';
import { GraphRenderer } from '../js/graph/GraphRenderer.js';
import { TreeElement } from '../js/tree/TreeElement.js';
import { TreeLayout } from '../js/tree/TreeLayout.js';
import { TreeParser } from '../js/tree/TreeParser.js';
import { TreeRenderer } from '../js/tree/TreeRenderer.js';

test('array placeholders remain distinct from ordinary user data', () => {
    const input = 'left\u3000__WHITEBOARD_EMPTY__\u3000right';
    const expected = ['left', '', '__WHITEBOARD_EMPTY__', '', 'right'];

    const queue = new QueueElement();
    const stack = new StackElement();
    assert.equal(queue.setFromText(input), null);
    assert.equal(stack.setFromText(input), null);
    assert.deepEqual(queue.items, expected);
    assert.deepEqual(stack.items, expected);
});

test('matrix placeholders preserve boundary cells and sentinel-like values', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('\u3000__WHITEBOARD_EMPTY__\u3000'), null);
    assert.deepEqual(matrix.data, [['', '__WHITEBOARD_EMPTY__', '']]);
});

test('matrix text snaps to the nearest horizontal or vertical reading direction', () => {
    const renderedAngle = rotation => {
        const matrix = new MatrixElement();
        matrix.rows = 1;
        matrix.cols = 1;
        matrix.data = [['A']];
        matrix.rotation = rotation;
        matrix._updateSize();
        let angle = 0;
        let textAngle = null;
        const angleStack = [];
        const ctx = {
            globalAlpha: 1,
            save() { angleStack.push(angle); },
            restore() { angle = angleStack.pop(); },
            translate() {},
            rotate(value) { angle += value; },
            fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            fillText() { textAngle = angle; }
        };
        matrix.draw(ctx, { zoom: 1 });
        return textAngle;
    };

    assert.ok(Math.abs(renderedAngle(Math.PI / 6)) < 1e-10);
    assert.ok(Math.abs(renderedAngle(Math.PI / 3) - Math.PI / 2) < 1e-10);
});

test('invalid oversized sequence input does not replace existing data', () => {
    const queue = new QueueElement();
    queue.setFromText('keep this');
    const result = queue.setFromText(new Array(10002).fill('x').join(' '));
    assert.match(result, /10000/);
    assert.deepEqual(queue.items, ['keep', 'this']);
});

test('undirected adjacency rows collapse reciprocal references but retain parallel edges', () => {
    const input = ['3', '2 2 2', '2 1 1', '0'].join('\n');
    const result = GraphParser.parse(input, false, false, 'adj-list');
    assert.equal(result.error, undefined);
    assert.equal(result.edges.length, 2);
    assert.ok(result.edges.every(edge => !edge.directed));
});

test('directed adjacency rows preserve reciprocal arcs and self-loops', () => {
    const input = ['2', '2 1 2', '1 1'].join('\n');
    const result = GraphParser.parse(input, true, false, 'adj-list');
    assert.equal(result.error, undefined);
    assert.deepEqual(result.edges.map(({ u, v }) => [u, v]), [
        ['1', '1'], ['1', '2'], ['2', '1']
    ]);
});

test('adjacency parser rejects edge counts above its supported work limit', () => {
    const input = ['1', '100001'].join('\n');
    assert.match(GraphParser.parse(input, false, false, 'adj-list').error, /100000/);
    assert.match(GraphParser.parse('x'.repeat(1000001)).error, /1 MB/);
});

test('graph weights must be finite and consistent for each destination node', () => {
    assert.match(GraphParser.parse('2 1\n1 2 nope').error, /finite number/);
    assert.match(GraphParser.parse('3 2\n1 2 5\n3 2 6').error, /conflicting weights/);
});

test('invalid graph edits leave the previous graph intact', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const previousNodes = [...graph.nodes.keys()];
    const previousText = graph.inputText;
    assert.match(graph.buildFromText('2 1\n1 3'), /range/);
    assert.deepEqual([...graph.nodes.keys()], previousNodes);
    assert.equal(graph.inputText, previousText);
});

test('parallel graph edges do not distort force-directed node positions', () => {
    const makeNodes = () => new Map([
        ['1', { id: '1', x: 0, y: 0 }],
        ['2', { id: '2', x: 0, y: 0 }],
        ['3', { id: '3', x: 0, y: 0 }]
    ]);
    const singleEdgeLayout = makeNodes();
    const parallelEdgeLayout = makeNodes();
    const edge = { u: '1', v: '2' };

    GraphLayout.layout(singleEdgeLayout, [edge], { iterations: 80 });
    GraphLayout.layout(parallelEdgeLayout, new Array(100).fill(edge), { iterations: 80 });
    assert.deepEqual(
        [...parallelEdgeLayout.values()].map(({ x, y }) => [x, y]),
        [...singleEdgeLayout.values()].map(({ x, y }) => [x, y])
    );
});

test('tree edge parser rejects cycles and accepts a connected acyclic tree', () => {
    assert.match(TreeParser.parseEdgeFormat(['1 2', '2 3', '3 1']).error, /循環/);
    const valid = TreeParser.parseEdgeFormat(['1 2', '1 3', '2 4']);
    assert.equal(valid.error, null);
    assert.equal(valid.nodes.size, 4);
});

test('rooted tree weights are rendered on edges and reject non-numeric weights', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2 7', 'rooted'), null);
    const child = tree.root.children[0];
    assert.equal(child.meta.edgeWeight, '7');
    assert.equal(child.meta.nodeWeight, undefined);

    const labels = [];
    const labelPositions = [];
    const weightFrames = [];
    const ctx = {
        globalAlpha: 1,
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        fill() {},
        fillRect: () => weightFrames.push('fill'),
        strokeRect: () => weightFrames.push('stroke'), arc() {},
        fillText: (text, x, y) => {
            labels.push(String(text));
            labelPositions.push({ label: String(text), x, y });
        }
    };
    TreeRenderer.draw(ctx, tree.root, {
        nodeRadius: tree.nodeRadius,
        treeType: tree.treeType,
        hasWeights: tree.hasWeights,
        offsetX: 0,
        offsetY: 0
    });
    assert.ok(labels.includes('7'));
    assert.ok(!labels.includes('w:7'));
    assert.equal(weightFrames.length, 0);
    const weightLabel = labelPositions.find(({ label }) => label === '7');
    assert.equal(weightLabel.x, (tree.root.x + child.x) / 2);
    assert.equal(weightLabel.y, (tree.root.y + child.y) / 2);
    const { offsetX, offsetY } = tree._getCurrentOffsets();
    assert.equal(tree.hitTestEdgeNode(
        (tree.root.x + child.x) / 2 + offsetX,
        (tree.root.y + child.y) / 2 + offsetY
    ), child);
    assert.match(TreeParser.parseRootedFormat(['2', '1 2 nope']).error, /有限數值/);

    assert.equal(tree.setEdgeWeight(child, '2.5'), true);
    assert.equal(tree.setEdgeWeight(child, 'not a number'), false);

    assert.equal(tree.setNodeValue(child, 'updated'), true);
    const saved = tree.serialize();
    const restored = TreeElement.fromData(saved);
    restored.deserialize(saved);
    assert.equal(restored.root.children[0].value, 'updated');
    assert.equal(restored.root.children[0].meta.edgeWeight, '2.5');
    assert.equal(restored.setEdgeWeight(restored.root.children[0], ''), true);
    assert.equal(restored.root.children[0].meta.edgeWeight, undefined);
    const clearedWeightSave = restored.serialize();
    const restoredClearedWeight = TreeElement.fromData(clearedWeightSave);
    restoredClearedWeight.deserialize(clearedWeightSave);
    assert.equal(restoredClearedWeight.root.children[0].meta.edgeWeight, undefined);
    assert.equal(restoredClearedWeight.hasWeights, true);
});

test('weighted trees show a frame-free placeholder for empty edge weights', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2', 'rooted'), null);
    tree.hasWeights = true;
    const labels = [];
    let frameCount = 0;
    const ctx = {
        globalAlpha: 1,
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        fill() {}, fillRect() { frameCount++; }, strokeRect() { frameCount++; }, arc() {},
        fillText: (label, x, y) => labels.push({ label: String(label), x, y })
    };
    TreeRenderer.draw(ctx, tree.root, {
        nodeRadius: tree.nodeRadius,
        hasWeights: tree.hasWeights,
        offsetX: 0,
        offsetY: 0
    });
    const placeholder = labels.find(({ label }) => label === '?');
    assert.ok(placeholder);
    assert.equal(frameCount, 0);
    assert.equal(placeholder.x, (tree.root.x + tree.root.children[0].x) / 2);
    assert.equal(placeholder.y, (tree.root.y + tree.root.children[0].y) / 2);
});

test('text hydration normalizes legacy fonts without mutating saved data', () => {
    const data = {
        type: 'text', x: 10, y: 20, width: 100, height: 24,
        text: 'legacy text', fontFamily: 'Segoe UI', isBold: true
    };
    const element = TextElement.fromData(data);
    assert.equal(element.text, 'Text');
    element.deserialize(data);
    assert.equal(element.text, 'legacy text');
    assert.equal(element.fontFamily, "'Zen Maru Gothic', sans-serif");
    assert.equal(element.isBold, true);
    assert.equal(data.fontFamily, 'Segoe UI');
});

test('text hydration restores scale bases so edits and resizing stay aligned', () => {
    const data = {
        type: 'text', x: 0, y: 0, width: 200, height: 48,
        text: 'abc', fontSize: 16, baseWidth: 100, baseHeight: 24
    };
    const element = TextElement.fromData(data);
    element.deserialize(data);
    assert.equal(element._baseWidth, 100);
    assert.equal(element._baseHeight, 24);

    element.autoSize({
        save() {}, restore() {},
        measureText: text => ({ width: text.length * 10 })
    });
    assert.equal(element.width, 60);
    assert.equal(element.height, 41.6);
});

test('pen bounds handle large strokes without argument spreading or rescanning each point', () => {
    const pen = new PenElement();
    const recalculateBounds = pen._recalcBounds.bind(pen);
    pen._recalcBounds = () => { throw new Error('addPoint should update bounds incrementally'); };
    assert.equal(pen.addPoint(8, -3), true);
    assert.equal(pen.addPoint(-2, 10), true);
    assert.equal(pen.addPoint(4, 6), true);
    pen._recalcBounds = recalculateBounds;
    assert.deepEqual({ x: pen.x, y: pen.y, width: pen.width, height: pen.height },
        { x: -2, y: -3, width: 10, height: 13 });
    assert.equal(pen.addPoint(Infinity, 0), false);

    pen.points = Array.from({ length: 150000 }, (_, index) => ({ x: index - 75000, y: 12 }));
    assert.doesNotThrow(() => pen._recalcBounds());
    assert.deepEqual({ x: pen.x, y: pen.y, width: pen.width, height: pen.height },
        { x: -75000, y: 12, width: 149999, height: 0 });
    pen.optimize(0.1);
    assert.equal(pen.points.length, 2);
});

test('parallel undirected graph edges render on distinct lanes', () => {
    const paths = [];
    let path = null;
    const ctx = {
        beginPath() { path = []; paths.push(path); },
        moveTo(x, y) { path.push([x, y]); },
        lineTo(x, y) { path.push([x, y]); },
        arc() {}, stroke() {}, fill() {}, fillRect() {}, strokeRect() {}, fillText() {},
        measureText() { return { width: 0 }; }
    };
    const nodes = new Map([
        ['1', { id: '1', x: 0, y: 0, label: '1' }],
        ['2', { id: '2', x: 100, y: 0, label: '2' }]
    ]);
    const edges = [
        { u: '1', v: '2', w: null, directed: false },
        { u: '1', v: '2', w: null, directed: false }
    ];

    GraphRenderer.draw(ctx, nodes, edges, { nodeRadius: 10 });
    const edgePaths = paths.filter(points => points.length === 2);
    assert.equal(edgePaths.length, 2);
    assert.notEqual(edgePaths[0][0][1], edgePaths[1][0][1]);
});

test('BST, AVL, and red-black builders reject values that cannot be ordered numerically', () => {
    for (const build of [TreeParser.buildBST, TreeParser.buildAVL, TreeParser.buildRBTree]) {
        assert.match(build(['1', 'not-a-number']).error, /finite numbers/);
        assert.match(build(['1', 'Infinity']).error, /finite numbers/);
    }
});

test('AVL and red-black builders maintain ordering and balancing invariants', () => {
    const sequences = [
        Array.from({ length: 80 }, (_, i) => i),
        Array.from({ length: 80 }, (_, i) => 79 - i),
        Array.from({ length: 80 }, (_, i) => (i * 37) % 80),
        [5, 5, 5, 5, 5, 4, 6, 4, 6]
    ];
    let seed = 0x51A7;
    sequences.push(Array.from({ length: 160 }, () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed % 41 - 20;
    }));

    for (const sequence of sequences) {
        const values = sequence.map(String);
        for (const build of [TreeParser.buildAVL, TreeParser.buildRBTree]) {
            const { root } = build(values);
            assert.ok(root);
            assert.equal(root.parent, null);
            const inOrder = [];
            const visitOrder = node => {
                if (!node) return;
                visitOrder(node.children[0]);
                inOrder.push(Number(node.value));
                visitOrder(node.children[1]);
            };
            visitOrder(root);
            assert.deepEqual(inOrder, [...sequence].sort((a, b) => a - b));
        }

        const { root: avlRoot } = TreeParser.buildAVL(values);
        const checkAvl = node => {
            if (!node) return 0;
            const leftHeight = checkAvl(node.children[0]);
            const rightHeight = checkAvl(node.children[1]);
            assert.ok(Math.abs(leftHeight - rightHeight) <= 1);
            assert.equal(node.meta.height, 1 + Math.max(leftHeight, rightHeight));
            return node.meta.height;
        };
        checkAvl(avlRoot);

        const { root: rbRoot } = TreeParser.buildRBTree(values);
        assert.equal(rbRoot.meta.color, 'black');
        const checkRedBlack = node => {
            if (!node) return 1;
            if (node.meta.color === 'red') {
                assert.notEqual(node.children[0]?.meta.color, 'red');
                assert.notEqual(node.children[1]?.meta.color, 'red');
            }
            for (const child of node.children) {
                if (child) assert.equal(child.parent, node);
            }
            const leftBlackHeight = checkRedBlack(node.children[0]);
            const rightBlackHeight = checkRedBlack(node.children[1]);
            assert.equal(leftBlackHeight, rightBlackHeight);
            return leftBlackHeight + Number(node.meta.color === 'black');
        };
        checkRedBlack(rbRoot);
    }
});

test('tree parsing limits input size and preserves the previous tree on invalid edits', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3', 'rooted'), null);
    const root = tree.root;
    const previousText = tree.inputText;
    assert.match(tree.buildFromText('3\n1 4\n1 3', 'rooted'), /介於/);
    assert.equal(tree.root, root);
    assert.equal(tree.inputText, previousText);
    assert.match(TreeParser.parseParentFormat(new Array(2001).fill('1')).error, /2000/);
});

test('tree layout visits deeper non-binary branches without dropping nodes', () => {
    const parsed = TreeParser.parseEdgeFormat([
        '1 2', '1 3', '2 4', '2 5', '2 6'
    ]);
    assert.equal(parsed.error, null);
    TreeLayout.layout(parsed.root);
    for (const node of parsed.nodes.values()) {
        assert.ok(Number.isFinite(node.x));
        assert.ok(Number.isFinite(node.y));
    }
    assert.ok(parsed.nodes.get('6').x > 0);
});

test('matrix dimensions reject invalid sizes without mutating existing cells', () => {
    const matrix = new MatrixElement();
    matrix.setFromText('1 2\n3 4');
    const previous = matrix.data.map(row => [...row]);
    assert.match(matrix.setFromText('201x2'), /200/);
    assert.deepEqual(matrix.data, previous);
    assert.match(matrix.setFromText('x'.repeat(1000001)), /1 MB/);
    assert.deepEqual(matrix.data, previous);
});

test('resizing an empty matrix keeps finite cell geometry', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText(''), null);
    matrix.width = 120;
    matrix.height = 90;
    matrix.onResize(120, 90);
    assert.equal(matrix.cellSize, 42);
    assert.equal(matrix.width, 120);
    assert.equal(matrix.height, 90);
    assert.equal(matrix.hitTestCell(30, 30), null);
});

test('failed JSON imports leave the current board and camera unchanged', () => {
    const existing = { id: 'keep-existing-board' };
    const app = {
        elements: [existing],
        camera: { x: 4, y: 5, zoom: 2 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    const input = {
        elements: [
            { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
            null
        ],
        camera: { x: 10, y: 20, zoom: 1 }
    };

    assert.throws(() => Serializer.loadJSONData(app, input), /invalid element record/);
    assert.deepEqual(app.elements, [existing]);
    assert.deepEqual(app.camera, { x: 4, y: 5, zoom: 2 });
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{ type: '__proto__', x: 0, y: 0, width: 1, height: 1 }]
    }), /Unsupported whiteboard element type/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'pen', x: 0, y: 0, width: 1, height: 1,
            points: [{ x: 'invalid', y: 0 }]
        }]
    }), /invalid point data/);
    assert.deepEqual(app.elements, [existing]);
});

test('multi-select delete undo restores original stacking order', () => {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }, d = { id: 'd' };
    const app = {
        elements: [a, b, c, d],
        layerManager: { _reindex() {} },
        renderer: { markDirty() {} }
    };
    app.selectionManager = new SelectionManager(app);
    app.selectionManager.select(a);
    app.selectionManager.addToSelection(c);
    const history = new History(app);
    history.pushDelete(app, [c, a]);
    app.elements = app.elements.filter(element => element !== a && element !== c);
    app.selectionManager.clear();

    history.undo();
    assert.deepEqual(app.elements, [a, b, c, d]);
    assert.deepEqual(app.selectionManager.selectedElements, [a, c]);
    history.redo();
    assert.deepEqual(app.elements, [b, d]);
    assert.deepEqual(app.selectionManager.selectedElements, []);
});

test('undoing an add uses the current selection API and redo does not duplicate it', () => {
    const added = { type: 'rectangle' };
    const app = {
        elements: [added],
        layerManager: { _reindex() {} },
        renderer: { markDirty() {} }
    };
    app.selectionManager = new SelectionManager(app);
    app.selectionManager.select(added);
    const history = new History(app);
    history.pushAdd(app, added);

    assert.doesNotThrow(() => history.undo());
    assert.deepEqual(app.elements, []);
    assert.deepEqual(app.selectionManager.selectedElements, []);
    history.redo();
    history.redo();
    assert.deepEqual(app.elements, [added]);
});

test('failed history commands remain available for retry', () => {
    const history = new History({ renderer: { markDirty() {} } });
    const error = new Error('temporary undo failure');
    history.push({ undo() { throw error; }, redo() {} });

    assert.throws(() => history.undo(), error);
    assert.equal(history.undoStack.length, 1);
    assert.equal(history.redoStack.length, 0);

    history.undoStack[0].undo = () => {};
    history.undo();
    assert.equal(history.undoStack.length, 0);
    assert.equal(history.redoStack.length, 1);

    history.redoStack[0].redo = () => { throw error; };
    assert.throws(() => history.redo(), error);
    assert.equal(history.redoStack.length, 1);
    assert.equal(history.undoStack.length, 0);
});

test('resizing undo restores internal matrix, tree, and graph geometry', () => {
    const history = new History({ renderer: { markDirty() {} } });

    const matrix = new MatrixElement();
    const originalMatrixBounds = { x: matrix.x, y: matrix.y, w: matrix.width, h: matrix.height };
    const originalCellSize = matrix.cellSize;
    matrix.onResizeStart();
    const originalMatrixResizeState = matrix.captureResizeState();
    matrix.onResize(300, 240);
    const resizedMatrixBounds = { x: matrix.x, y: matrix.y, w: matrix.width, h: matrix.height };
    const resizedCellSize = matrix.cellSize;
    const resizedMatrixState = matrix.captureResizeState();
    history.pushResize(matrix, originalMatrixBounds, resizedMatrixBounds, null, null, null,
        originalMatrixResizeState, resizedMatrixState);
    history.undo();
    assert.equal(matrix.cellSize, originalCellSize);
    assert.equal(matrix.width, originalMatrixBounds.w);
    history.redo();
    assert.equal(matrix.cellSize, resizedCellSize);
    assert.equal(matrix.width, resizedMatrixBounds.w);

    for (const sequence of [new QueueElement(), new StackElement()]) {
        sequence.setFromText('a b c');
        const initialBounds = { x: sequence.x, y: sequence.y, w: sequence.width, h: sequence.height };
        const initialState = sequence.captureResizeState();
        sequence.onResizeStart();
        const initialResizeState = sequence.captureResizeState();
        sequence.width *= 1.7;
        sequence.height *= 1.7;
        sequence.onResize(sequence.width, sequence.height);
        const resizedBounds = { x: sequence.x, y: sequence.y, w: sequence.width, h: sequence.height };
        const resizedState = sequence.captureResizeState();
        history.pushResize(sequence, initialBounds, resizedBounds, null, null, null,
            initialResizeState, resizedState);
        history.undo();
        assert.deepEqual(sequence.captureResizeState(), initialState);
        history.redo();
        assert.deepEqual(sequence.captureResizeState(), resizedState);
    }

    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3', 'rooted'), null);
    const originalTreeBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    const originalRadius = tree.nodeRadius;
    tree.onResizeStart();
    const originalTreeResizeState = tree.captureResizeState();
    tree.onResize(tree.width * 2, tree.height * 2);
    const resizedTreeBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    const resizedRadius = tree.nodeRadius;
    const resizedTreeState = tree.captureResizeState();
    history.pushResize(tree, originalTreeBounds, resizedTreeBounds, null, null, null,
        originalTreeResizeState, resizedTreeState);
    history.undo();
    assert.equal(tree.nodeRadius, originalRadius);
    history.redo();
    assert.equal(tree.nodeRadius, resizedRadius);

    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const originalGraphBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    const originalNodePositions = [...graph.nodes.values()].map(({ x, y }) => ({ x, y }));
    graph.onResizeStart();
    const originalGraphResizeState = graph.captureResizeState();
    graph.width = 520;
    graph.height = 430;
    graph.onResize(520, 430);
    const resizedGraphBounds = { x: graph.x, y: graph.y, w: 520, h: 430 };
    const resizedNodePositions = [...graph.nodes.values()].map(({ x, y }) => ({ x, y }));
    const resizedGraphState = graph.captureResizeState();
    history.pushResize(graph, originalGraphBounds, resizedGraphBounds, null, null, null,
        originalGraphResizeState, resizedGraphState);
    history.undo();
    assert.deepEqual([...graph.nodes.values()].map(({ x, y }) => ({ x, y })), originalNodePositions);
    history.redo();
    assert.deepEqual([...graph.nodes.values()].map(({ x, y }) => ({ x, y })), resizedNodePositions);
});

test('successful board import clears stale undo and redo commands', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        history: { undoStack: [{}], redoStack: [{}], clear: History.prototype.clear },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    app.history.undoStack.length = 1;
    app.history.redoStack.length = 1;
    Serializer.loadJSONData(app, { elements: [] });
    assert.deepEqual(app.history.undoStack, []);
    assert.deepEqual(app.history.redoStack, []);
});

test('tree JSON restore can read rooted input for a non-generic display type', () => {
    const tree = new TreeElement();
    tree.deserialize({
        ...tree.serialize(),
        treeType: 'bst',
        inputText: '3\n1 2\n1 3'
    });
    assert.equal(tree.root.value, '1');
    assert.equal(tree.root.children.length, 2);
});

test('tree edit history can re-find nodes after deserialization rebuilds the tree', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3', 'rooted'), null);
    const originalNode = tree.root.children[1];
    const path = tree.getNodePath(originalNode);
    assert.equal(path, 'r.1');
    assert.equal(tree.setNodeValue(originalNode, 'renamed'), true);
    assert.equal(tree.setEdgeWeight(originalNode, '8'), true);

    const snapshot = JSON.parse(JSON.stringify(tree.serialize()));
    tree.deserialize(snapshot);
    const restoredNode = tree.getNodeAtPath(path);
    assert.ok(restoredNode);
    assert.notEqual(restoredNode, originalNode);
    assert.equal(restoredNode.value, 'renamed');
    assert.equal(restoredNode.meta.edgeWeight, '8');

    assert.equal(tree.setNodeValue(tree.getNodeAtPath(path), '2'), true);
    assert.equal(tree.setEdgeWeight(tree.getNodeAtPath(path), '7'), true);
    assert.equal(tree.getNodeAtPath('r.99'), null);
});

test('rotated matrix cells and sequence items remain correctly hittable', () => {
    const rotation = Math.PI / 2;
    const matrix = new MatrixElement(40, 60);
    matrix.setFromText('1 2\n3 4');
    matrix.rotation = rotation;
    const matrixCell = matrix.toWorldPoint(40 + 10 + 21, 60 + 10 + 21);
    assert.deepEqual(matrix.hitTestCell(matrixCell.x, matrixCell.y), { row: 0, col: 0 });
    assert.equal(matrix.containsPoint(matrixCell.x, matrixCell.y), true);

    const queue = new QueueElement(100, 50);
    queue.setFromText('a b');
    queue.rotation = rotation;
    const queueCell = queue.toWorldPoint(100 + 8 + 22, 50 + queue.height / 2);
    assert.equal(queue.hitTestItem(queueCell.x, queueCell.y), 0);

    const stack = new StackElement(180, 30);
    stack.setFromText('a b');
    stack.rotation = rotation;
    const bottomCellY = 30 + stack.height - 8 - stack.cellHeight / 2;
    const stackCell = stack.toWorldPoint(180 + stack.width / 2, bottomCellY);
    assert.equal(stack.hitTestItem(stackCell.x, stackCell.y), 0);
});

test('rotated graph/tree node hit tests and connection ports use rendered positions', () => {
    const graph = new GraphElement(30, 40);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    graph.rotation = Math.PI / 2;
    const [id, node] = [...graph.nodes.entries()][0];
    const graphNode = graph.toWorldPoint(graph.x + 20 + node.x, graph.y + 20 + node.y);
    assert.equal(graph.hitTestNode(graphNode.x, graphNode.y).id, id);
    assert.equal(graph.containsPoint(graphNode.x, graphNode.y), true);
    const graphPort = graph.getConnectionPorts().find(port => port.id === `node_${id}`);
    assert.ok(Math.hypot(graphPort.x - graphNode.x, graphPort.y - graphNode.y) < 1e-8);

    const tree = new TreeElement(250, 60);
    assert.equal(tree.buildFromText('2\n1 2', 'rooted'), null);
    tree.rotation = Math.PI / 2;
    const offsets = tree._getCurrentOffsets();
    const treeNode = tree.toWorldPoint(offsets.offsetX + tree.root.x, offsets.offsetY + tree.root.y);
    assert.equal(tree.hitTestNode(treeNode.x, treeNode.y), tree.root);
    assert.equal(tree.containsPoint(treeNode.x, treeNode.y), true);
    const treePort = tree.getConnectionPorts().find(port => port.id === `node_${tree.root.value}`);
    assert.ok(Math.hypot(treePort.x - treeNode.x, treePort.y - treeNode.y) < 1e-8);
});

test('resizing a graph with minimal bounds keeps node coordinates finite', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    graph.width = 40;
    graph.height = 40;
    graph.onResizeStart();
    graph.onResize(40, 40);
    for (const node of graph.nodes.values()) {
        assert.ok(Number.isFinite(node.x));
        assert.ok(Number.isFinite(node.y));
    }
});
