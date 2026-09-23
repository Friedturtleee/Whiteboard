import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueElement } from '../js/elements/QueueElement.js';
import { StackElement } from '../js/elements/StackElement.js';
import { MatrixElement } from '../js/elements/MatrixElement.js';
import { Serializer } from '../js/core/Serializer.js';
import { History } from '../js/core/History.js';
import { GraphElement } from '../js/graph/GraphElement.js';
import { GraphParser } from '../js/graph/GraphParser.js';
import { GraphLayout } from '../js/graph/GraphLayout.js';
import { TreeElement } from '../js/tree/TreeElement.js';
import { TreeLayout } from '../js/tree/TreeLayout.js';
import { TreeParser } from '../js/tree/TreeParser.js';

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
    assert.deepEqual(app.elements, [existing]);
});

test('multi-select delete undo restores original stacking order', () => {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }, d = { id: 'd' };
    const app = {
        elements: [a, b, c, d],
        layerManager: { _reindex() {} },
        selectionManager: { remove() {} },
        renderer: { markDirty() {} }
    };
    const history = new History(app);
    history.pushDelete(app, [c, a]);
    app.elements = app.elements.filter(element => element !== a && element !== c);

    history.undo();
    assert.deepEqual(app.elements, [a, b, c, d]);
    history.redo();
    assert.deepEqual(app.elements, [b, d]);
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
