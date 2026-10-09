import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueElement } from '../js/elements/QueueElement.js';
import { StackElement } from '../js/elements/StackElement.js';
import { MatrixElement } from '../js/elements/MatrixElement.js';
import { fitCanvasTextFontSize } from '../js/core/CanvasTextFit.js';
import { TextElement } from '../js/elements/TextElement.js';
import { PenElement } from '../js/elements/PenElement.js';
import { Serializer } from '../js/core/Serializer.js';
import { validateWhiteboardElement } from '../js/core/WhiteboardElementValidation.js';
import { History } from '../js/core/History.js';
import { SelectionManager } from '../js/core/SelectionManager.js';
import { Transform } from '../js/core/Transform.js';
import { HitTest } from '../js/canvas/HitTest.js';
import { Renderer } from '../js/canvas/Renderer.js';
import { ShapeElement } from '../js/elements/ShapeElement.js';
import { GraphElement } from '../js/graph/GraphElement.js';
import { GraphParser } from '../js/graph/GraphParser.js';
import { GraphLayout } from '../js/graph/GraphLayout.js';
import { GraphRenderer } from '../js/graph/GraphRenderer.js';
import { TreeElement } from '../js/tree/TreeElement.js';
import { TreeLayout } from '../js/tree/TreeLayout.js';
import { TreeParser } from '../js/tree/TreeParser.js';
import { TreeRenderer } from '../js/tree/TreeRenderer.js';
import { MarkdownElement } from '../js/elements/MarkdownElement.js';
import { authorizeRequest, getRoomId } from '../server/src/auth.mjs';
import { formatDataToken, splitDataTokens } from '../js/core/DataTokens.js';

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

test('long cell values shrink proportionally without changing cell widths', () => {
    const ctx = {
        font: '14px Consolas, monospace',
        measureText(text) { return { width: String(text).length * 8 }; }
    };
    const shortSize = fitCanvasTextFontSize(ctx, '1', 14, 34, 34);
    const longSize = fitCanvasTextFontSize(ctx, 'a very long value', 14, 34, 34);
    assert.equal(shortSize, 14);
    assert.ok(longSize < shortSize);
    assert.ok(longSize > 0);
});

test('matrix, queue, and stack draw long values with smaller proportional fonts', () => {
    const makeContext = () => {
        const labels = [];
        const fonts = [];
        return {
            labels,
            save() { fonts.push(this.font); },
            restore() { this.font = fonts.pop() ?? this.font; },
            fillRect() {}, strokeRect() {}, beginPath() {},
            moveTo() {}, lineTo() {}, stroke() {}, translate() {}, rotate() {},
            measureText(text) {
                const size = Number.parseFloat(this.font) || 14;
                return { width: String(text).length * size * 0.6 };
            },
            fillText(text, x, y, maxWidth) {
                labels.push({ text: String(text), font: this.font, maxWidth });
            }
        };
    };
    const assertFit = (element, shortText, longText) => {
        const ctx = makeContext();
        const originalSize = { width: element.width, height: element.height };
        element.draw(ctx);
        assert.deepEqual({ width: element.width, height: element.height }, originalSize);
        const shortLabel = ctx.labels.find(label => label.text === shortText);
        const longLabel = ctx.labels.find(label => label.text === longText);
        assert.ok(shortLabel && longLabel);
        assert.ok(Number.parseFloat(longLabel.font) < Number.parseFloat(shortLabel.font));
        assert.equal(shortLabel.maxWidth, undefined);
        assert.equal(longLabel.maxWidth, undefined);
    };

    const matrix = new MatrixElement();
    matrix.data[0][0] = 'short';
    matrix.data[0][1] = 'a value much longer than one cell';
    assertFit(matrix, 'short', 'a value much longer than one cell');

    const queue = new QueueElement();
    queue.setFromText('short "a value much longer than one cell"');
    assertFit(queue, 'short', 'a value much longer than one cell');

    const stack = new StackElement();
    stack.setFromText('short "a value much longer than one cell"');
    assertFit(stack, 'short', 'a value much longer than one cell');
});

test('matrix placeholders preserve boundary cells and sentinel-like values', () => {
    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('\u3000__WHITEBOARD_EMPTY__\u3000'), null);
    assert.deepEqual(matrix.data, [['', '__WHITEBOARD_EMPTY__', '']]);
});

test('quoted array tokens preserve spaces, commas, quotes, and line breaks', () => {
    const values = ['plain', 'two words', 'a,b', 'say "hi"', 'line\nbreak', '', '\u3000'];
    const encoded = values.map(formatDataToken).join(' ');
    assert.deepEqual(splitDataTokens(encoded, { multiline: true }), values.map(value =>
        value === '\u3000' ? '' : value
    ));

    const queue = new QueueElement();
    assert.equal(queue.setFromText('plain "two words" "a,b" "say \\\"hi\\\""'), null);
    const originalItems = [...queue.items];
    queue.updateTextFromData();
    assert.deepEqual(queue.setFromText(queue.inputText), null);
    assert.deepEqual(queue.items, originalItems);

    const matrix = new MatrixElement();
    assert.equal(matrix.setFromText('"single cell value"'), null);
    assert.deepEqual(matrix.data, [['single cell value']]);
    matrix.updateTextFromData();
    assert.equal(matrix.setFromText(matrix.inputText), null);
    assert.deepEqual(matrix.data, [['single cell value']]);

    assert.equal(matrix.setFromText('"two words" 4\n"a,b" "line\\nbreak"'), null);
    const originalData = matrix.data.map(row => [...row]);
    matrix.updateTextFromData();
    assert.equal(matrix.setFromText(matrix.inputText), null);
    assert.deepEqual(matrix.data, originalData);
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

test('contest graph input stores optional weights on edges', () => {
    assert.match(GraphParser.parse('2 1\n1 2 nope').error, /finite number/);
    const graph = GraphParser.parse('4 4\n1 2 5\n3 2 6\n2 4 -3\n4 1 0');
    assert.equal(graph.error, undefined);
    assert.deepEqual(graph.edges.map(edge => edge.w), ['5', '6', '-3', '0']);
    assert.ok([...graph.nodes.values()].every(node => node.nodeWeight === null));
});

test('contest graph input supports zero-based node IDs when selected', () => {
    const input = '4 3\n0 1\n1 2 8\n2 3';
    assert.match(GraphParser.parse(input).error, /range/);
    const graph = new GraphElement();
    assert.equal(graph.buildFromText(input, false, true), null);
    assert.deepEqual([...graph.nodes.keys()], ['0', '1', '2', '3']);
    assert.equal(graph.edges[1].w, '8');
    assert.equal(graph.zeroBased, true);

    const saved = graph.serialize();
    const restored = GraphElement.fromData(saved);
    restored.deserialize(saved);
    assert.equal(restored.zeroBased, true);
    assert.deepEqual([...restored.nodes.keys()], ['0', '1', '2', '3']);
});

test('contest tree input roots undirected weighted edges at node 1', () => {
    const input = '5\n2 1 7\n3 2 -2\n3 4\n5 4 0';
    const tree = new TreeElement();
    assert.equal(tree.buildFromText(input), null);
    assert.equal(tree.root.value, '1');
    assert.equal(tree.root.children[0].value, '2');
    assert.equal(tree.root.children[0].meta.edgeWeight, '7');
    assert.equal(tree.root.children[0].children[0].meta.edgeWeight, '-2');
    assert.equal(tree.hasWeights, true);
    assert.equal(TreeParser.autoDetectAndParse('1').root.value, '1');
});

test('contest tree input auto-detects zero-based vertex IDs', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('4\n1 0\n1 2\n3 1'), null);
    assert.equal(tree.root.value, '0');
    assert.deepEqual(tree.root.children.map(child => child.value), ['1']);
    assert.deepEqual(tree.root.children[0].children.map(child => child.value), ['2', '3']);
});

test('tree input mode survives serialization for multiline value lists', () => {
    const tree = new TreeElement();
    tree.treeType = 'bst';
    assert.equal(tree.buildFromText('2\n1\n3', 'values'), null);
    const restored = new TreeElement();
    restored.deserialize(JSON.parse(JSON.stringify(tree.serialize())));
    assert.equal(restored.inputMode, 'values');
    assert.equal(restored.root.value, '2');
    assert.equal(restored.root.children[0].value, '1');
    assert.equal(restored.root.children[1].value, '3');
});

test('red-black tree type aliases build the same balanced tree', () => {
    const current = TreeParser._buildByType(['10', '5', '15', '2', '7'], 'rb');
    const legacy = TreeParser._buildByType(['10', '5', '15', '2', '7'], 'red-black');
    assert.deepEqual(legacy.root, current.root);
});

test('unknown tree input modes fail without replacing the existing tree', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2'), null);
    const previousRoot = tree.root;
    const previousText = tree.inputText;
    assert.match(tree.buildFromText('1', 'unsupported'), /未知.*輸入格式/);
    assert.equal(tree.root, previousRoot);
    assert.equal(tree.inputText, previousText);
    assert.equal(tree.inputMode, 'auto');
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

test('graph layout refreshes cached topology after in-place edge edits', () => {
    const makeNodes = () => new Map(Array.from({ length: 5 }, (_, index) => {
        const id = String(index + 1);
        return [id, { id, x: 0, y: 0 }];
    }));
    const nodes = makeNodes();
    const edges = Array.from({ length: 4 }, (_, index) => ({
        u: '1', v: String(index + 2)
    }));
    const options = { width: 100, height: 100, nodeRadius: 10, iterations: 0, maxCollisionPasses: 0 };

    GraphLayout.layout(nodes, edges, options);
    edges[0].u = '1'; edges[0].v = '2';
    edges[1].u = '2'; edges[1].v = '3';
    edges[2].u = '3'; edges[2].v = '4';
    edges[3].u = '4'; edges[3].v = '5';
    for (const node of nodes.values()) { node.x = 0; node.y = 0; }
    GraphLayout.layout(nodes, edges, options);

    const freshNodes = makeNodes();
    GraphLayout.layout(freshNodes, edges.map(edge => ({ ...edge })), options);
    assert.deepEqual(
        [...nodes.values()].map(({ x, y }) => [x, y]),
        [...freshNodes.values()].map(({ x, y }) => [x, y])
    );
});

test('graph layout refreshes cached node indices after map reordering', () => {
    const makeNodes = () => new Map(Array.from({ length: 5 }, (_, index) => {
        const id = String(index + 1);
        return [id, { id, x: 0, y: 0 }];
    }));
    const nodes = makeNodes();
    const edges = Array.from({ length: 4 }, (_, index) => ({
        u: '1', v: String(index + 2)
    }));
    const options = { width: 100, height: 100, nodeRadius: 10, iterations: 0, maxCollisionPasses: 0 };
    GraphLayout.layout(nodes, edges, options);

    const secondNode = nodes.get('2');
    nodes.delete('2');
    nodes.set('2', secondNode);
    for (const node of nodes.values()) { node.x = 0; node.y = 0; }
    GraphLayout.layout(nodes, edges, options);

    const freshNodes = new Map([...nodes].map(([id, node]) => [id, { ...node, x: 0, y: 0 }]));
    GraphLayout.layout(freshNodes, edges.map(edge => ({ ...edge })), options);
    assert.deepEqual(
        [...nodes.values()].map(({ x, y }) => [x, y]),
        [...freshNodes.values()].map(({ x, y }) => [x, y])
    );
});

test('a one-node graph is centered in its layout area', () => {
    const nodes = new Map([['1', { id: '1', x: 0, y: 0 }]]);
    GraphLayout.layout(nodes, [], { width: 360, height: 310 });
    assert.deepEqual({ x: nodes.get('1').x, y: nodes.get('1').y }, { x: 180, y: 155 });
});

test('graph layout repairs non-finite starting coordinates deterministically', () => {
    const createNodes = () => new Map([
        ['1', { id: '1', x: NaN, y: Infinity }],
        ['2', { id: '2', x: 0, y: 0 }],
        ['3', { id: '3', x: 0, y: 0 }]
    ]);
    const first = createNodes();
    const second = createNodes();

    GraphLayout.layout(first, [], { iterations: 0 });
    GraphLayout.layout(second, [], { iterations: 0 });
    const positions = map => [...map.values()].map(({ x, y }) => [x, y]);
    assert.deepEqual(positions(first), positions(second));
    assert.ok([...first.values()].every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
    assert.ok(!GraphLayout.hasOverlaps(first, 48));
});

test('coincident graph nodes receive opposite deterministic separation vectors', () => {
    const forward = GraphLayout._stableDirection(2, 5, 3);
    const reverse = GraphLayout._stableDirection(5, 2, 3);
    assert.deepEqual(reverse, forward.map(value => -value));
});

test('large graph nodes keep their full radius inside a minimum-size layout area', () => {
    const graph = new GraphElement();
    graph.nodeRadius = 100;
    assert.equal(graph.buildFromText('2 1\n1 2'), null);

    const nodes = [...graph.nodes.values()];
    assert.ok(Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y) >= 208);
    for (const node of nodes) {
        assert.ok(node.x - graph.nodeRadius + 20 >= 0);
        assert.ok(node.y - graph.nodeRadius + 20 >= 0);
        assert.ok(node.x + graph.nodeRadius + 20 <= graph.width);
        assert.ok(node.y + graph.nodeRadius + 20 <= graph.height);
    }
});

test('dense graph layouts expand their frame and keep node circles apart', () => {
    const nodeCount = 50;
    const input = [`${nodeCount} ${nodeCount - 1}`, ...Array.from(
        { length: nodeCount - 1 }, (_, index) => `${index + 1} ${index + 2}`
    )].join('\n');
    const graph = new GraphElement();

    assert.equal(graph.buildFromText(input), null);
    assert.ok(graph.width > 400 || graph.height > 350);

    const assertClearance = () => {
        const nodes = [...graph.nodes.values()];
        const minimumDistance = graph.nodeRadius * 2 + 6;
        for (let first = 0; first < nodes.length; first++) {
            for (let second = first + 1; second < nodes.length; second++) {
                assert.ok(Math.hypot(
                    nodes[first].x - nodes[second].x,
                    nodes[first].y - nodes[second].y
                ) >= minimumDistance - 1e-6);
            }
        }
    };

    assertClearance();
    graph.onResizeStart();
    graph.onResize(100, 100);
    assert.ok(graph.width > 100 || graph.height > 100);
    assertClearance();
});

test('maximum-size star graph layout separates all 500 nodes', () => {
    const nodeCount = 500;
    const hubId = 250;
    const input = [`${nodeCount} ${nodeCount - 1}`, ...Array.from(
        { length: nodeCount - 1 }, (_, index) => {
            const targetId = index + 1 < hubId ? index + 1 : index + 2;
            return `${hubId} ${targetId}`;
        }
    )].join('\n');
    const graph = new GraphElement();

    assert.equal(graph.buildFromText(input), null);
    assert.equal(graph.nodes.size, nodeCount);
    assert.ok(graph.width < 2000);
    assert.ok(graph.height < 2000);
    const hub = graph.nodes.get(String(hubId));
    assert.ok(Math.hypot(
        hub.x - (graph.width - 40) / 2,
        hub.y - (graph.height - 40) / 2
    ) <= graph.nodeRadius * 2 + 8);
    const nodes = [...graph.nodes.values()];
    const minimumDistance = graph.nodeRadius * 2 + 6;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }

    graph.onResizeStart();
    graph.onResize(100, 100);
    assert.ok(graph.width > 100 || graph.height > 100);
    assert.ok(Math.hypot(
        hub.x - (graph.width - 40) / 2,
        hub.y - (graph.height - 40) / 2
    ) <= graph.nodeRadius * 2 + 8);
    assert.ok(!GraphLayout.hasOverlaps(graph.nodes, minimumDistance));
});

test('collision repair keeps a larger dense graph force-laid out without overlaps', () => {
    const nodeCount = 120;
    const nodes = new Map(Array.from({ length: nodeCount }, (_, index) => {
        const id = String(index);
        return [id, { id, x: 0, y: 0 }];
    }));
    const edges = [];
    for (let first = 0; first < nodeCount; first++) {
        for (let second = first + 1; second < nodeCount; second++) {
            if ((first * 31 + second * 17) % 37 < 4) {
                edges.push({ u: String(first), v: String(second) });
            }
        }
    }

    GraphLayout.layout(nodes, edges, { width: 400, height: 350, nodeRadius: 20 });

    assert.ok(edges.length > nodeCount * 5);
    assert.ok(!GraphLayout.hasOverlaps(nodes, 48));
    assert.ok(new Set([...nodes.values()].map(node => Math.round(node.x * 1e6))).size > 110);
});

test('graph preview relayout uses the requested frame size rather than its previous auto expansion', () => {
    const graph = new GraphElement();
    const crowdedInput = ['50 49', ...Array.from(
        { length: 49 }, (_, index) => `${index + 1} ${index + 2}`
    )].join('\n');

    assert.equal(graph.buildFromText(crowdedInput), null);
    assert.ok(graph.width > 400 || graph.height > 350);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    assert.equal(graph.width, 400);
    assert.equal(graph.height, 350);

    graph.onResizeStart();
    graph.onResize(600, 500);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    assert.equal(graph.width, 600);
    assert.equal(graph.height, 500);
});

test('graph base frame size survives JSON restore and controls later relayouts', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    graph.onResizeStart();
    graph.onResize(620, 480);

    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, { elements: [graph.serialize()] });
    const restored = app.elements[0];
    assert.equal(restored.buildFromText('2 1\n1 2'), null);
    assert.equal(restored.width, 620);
    assert.equal(restored.height, 480);
});

test('graph resize undo and redo restore the relayout base size', () => {
    const graph = new GraphElement();
    const input = '3 2\n1 2\n2 3';
    assert.equal(graph.buildFromText(input), null);
    const history = new History({ renderer: { markDirty() {} } });
    const fromBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };

    graph.onResizeStart();
    const fromState = graph.captureResizeState();
    graph.width = 620;
    graph.height = 480;
    graph.onResize(620, 480);
    const toBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    const toState = graph.captureResizeState();
    history.pushResize(graph, fromBounds, toBounds, null, null, null, fromState, toState);

    assert.equal(graph.buildFromText(input), null);
    history.undo();
    assert.equal(graph.buildFromText(input), null);
    assert.equal(graph.width, 400);
    assert.equal(graph.height, 350);
    history.redo();
    assert.equal(graph.buildFromText(input), null);
    assert.equal(graph.width, 620);
    assert.equal(graph.height, 480);
});

test('tree layout enforces node clearance when requested spacing is too small', () => {
    const root = {
        value: 'root',
        children: [
            { value: 'left', children: [], parent: null },
            { value: 'middle', children: [], parent: null },
            { value: 'right', children: [], parent: null }
        ]
    };
    for (const child of root.children) child.parent = root;

    TreeLayout.layout(root, {
        nodeRadius: 20,
        nodeSpacingX: 1,
        levelSpacingY: 1
    });
    const nodes = [root, ...root.children];
    const minimumDistance = 46;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }
});

test('tree resize keeps finite geometry when given non-finite bounds', () => {
    const tree = new TreeElement();
    assert.equal(tree.buildFromText('3\n1 2\n1 3'), null);
    tree.onResizeStart();
    tree.onResize(Number.NaN, Number.POSITIVE_INFINITY);

    assert.ok(Number.isFinite(tree.nodeRadius));
    assert.ok(Number.isFinite(tree.width) && Number.isFinite(tree.height));
    const nodes = [tree.root, ...tree.root.children];
    for (const node of nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
    const minimumDistance = tree.nodeRadius * 2 + 8;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }
});

test('a long unary BST is laid out vertically instead of using one column per node', () => {
    const tree = new TreeElement();
    tree.treeType = 'bst';
    const input = Array.from({ length: 200 }, (_, index) => String(index + 1)).join(' ');

    assert.equal(tree.buildFromText(input, 'values'), null);
    assert.ok(tree.width <= tree.nodeRadius * 2 + 20);
    let node = tree.root;
    let previousY = node.y;
    let count = 1;
    while (node.children[1]) {
        node = node.children[1];
        assert.equal(node.x, tree.root.x);
        assert.ok(node.y - previousY >= tree.nodeRadius * 2 + 8);
        previousY = node.y;
        count++;
    }
    assert.equal(count, 200);
});

test('balanced BST layout stays compact while preserving in-order node order', () => {
    const tree = new TreeElement();
    tree.treeType = 'bst';
    const values = [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15];
    assert.equal(tree.buildFromText(values.join(' '), 'values'), null);

    const inOrder = [];
    const visit = node => {
        if (!node) return;
        visit(node.children[0]);
        inOrder.push(node);
        visit(node.children[1]);
    };
    visit(tree.root);
    assert.deepEqual(inOrder.map(node => Number(node.value)), [...values].sort((a, b) => a - b));
    for (let index = 1; index < inOrder.length; index++) {
        assert.ok(inOrder[index].x > inOrder[index - 1].x);
    }
    assert.ok(tree.width < 500);
});

test('graph selection bounds avoid scanning nodes and edges on hover', () => {
    const graph = new GraphElement(10, 20);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const originalNodeHitTest = GraphRenderer.hitTestNode;
    const originalEdgeHitTest = GraphRenderer.hitTestEdge;
    try {
        GraphRenderer.hitTestNode = () => { throw new Error('unexpected node scan'); };
        GraphRenderer.hitTestEdge = () => { throw new Error('unexpected edge scan'); };
        assert.equal(graph.containsPoint(40, 40), true);
    } finally {
        GraphRenderer.hitTestNode = originalNodeHitTest;
        GraphRenderer.hitTestEdge = originalEdgeHitTest;
    }
});

test('tree selection bounds avoid scanning nodes and edges on hover', () => {
    const tree = new TreeElement(10, 20);
    assert.equal(tree.buildFromText('2\n1 2'), null);
    const originalNodeHitTest = TreeRenderer.hitTestNode;
    const originalEdgeHitTest = TreeRenderer.hitTestEdge;
    try {
        TreeRenderer.hitTestNode = () => { throw new Error('unexpected node scan'); };
        TreeRenderer.hitTestEdge = () => { throw new Error('unexpected edge scan'); };
        assert.equal(tree.containsPoint(tree.x + 1, tree.y + 1), true);
    } finally {
        TreeRenderer.hitTestNode = originalNodeHitTest;
        TreeRenderer.hitTestEdge = originalEdgeHitTest;
    }
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

test('maximum-length text stays within importable bounds after auto sizing', () => {
    const element = new TextElement(0, 0);
    element.text = 'W'.repeat(1_000_000);
    element.autoSize({
        save() {}, restore() {},
        measureText: text => ({ width: text.length * 16 })
    });

    assert.equal(element._baseWidth, 16_000_000);
    assert.equal(element.width, 10_000_000);
    const record = element.serialize();
    assert.doesNotThrow(() => validateWhiteboardElement(record));

    const app = {
        elements: [], camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} }, renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, { elements: [record] });
    assert.equal(app.elements[0].text.length, 1_000_000);
    assert.equal(app.elements[0].width, 10_000_000);
    assert.equal(app.elements[0]._baseWidth, 16_000_000);
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
        { u: '2', v: '1', w: null, directed: false }
    ];

    GraphRenderer.draw(ctx, nodes, edges, { nodeRadius: 10 });
    const edgePaths = paths.filter(points => points.length === 2);
    assert.equal(edgePaths.length, 2);
    assert.notEqual(edgePaths[0][0][1], edgePaths[1][0][1]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, -4, { nodeRadius: 10 }), edges[0]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, 4, { nodeRadius: 10 }), edges[1]);

    const loopEdges = [
        { u: '1', v: '1', directed: false },
        { u: '1', v: '1', directed: false }
    ];
    const loopNodes = new Map([['1', { id: '1', x: 0, y: 0, label: '1' }]]);
    assert.equal(GraphRenderer.hitTestEdge(loopNodes, loopEdges, 0, -25, {
        nodeRadius: 10
    }), loopEdges[0]);
    assert.equal(GraphRenderer.hitTestEdge(loopNodes, loopEdges, 0, -41, {
        nodeRadius: 10
    }), loopEdges[1]);
});

test('graph rendering measures repeated edge-weight labels once per frame', () => {
    let measureCalls = 0;
    const ctx = {
        beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() {}, fill() {},
        fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {},
        measureText() { measureCalls++; return { width: 10 }; }
    };
    const nodes = new Map([
        ['1', { id: '1', x: 0, y: 0, label: '1' }],
        ['2', { id: '2', x: 100, y: 0, label: '2' }]
    ]);
    const edges = [
        { u: '1', v: '2', w: '7' },
        { u: '2', v: '1', w: '7' },
        { u: '1', v: '2', w: '8' }
    ];

    GraphRenderer.draw(ctx, nodes, edges);
    assert.equal(measureCalls, 2);
});

test('graph edge lane metadata refreshes after in-place endpoint changes', () => {
    const nodes = new Map([
        ['1', { id: '1', x: 0, y: 0, label: '1' }],
        ['2', { id: '2', x: 100, y: 0, label: '2' }],
        ['3', { id: '3', x: 0, y: 100, label: '3' }]
    ]);
    const edges = [
        { u: '1', v: '2', directed: false },
        { u: '1', v: '2', directed: false }
    ];

    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, -4, { nodeRadius: 10 }), edges[0]);
    edges[0].v = '3';
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 0, 50, { nodeRadius: 10 }), edges[0]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, 0, { nodeRadius: 10 }), edges[1]);

    edges[0].directed = true;
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 5, 50, {
        nodeRadius: 10, directed: true
    }), edges[0]);
});

test('connection drag rendering does not rebuild unused port arrays', () => {
    const renderer = new Renderer({}, {}, { zoom: 1 }, null, {
        elements: [{ getConnectionPorts() { throw new Error('unused port enumeration'); } }],
        transform: { mode: 'endpoint', targetElement: null }
    });
    assert.doesNotThrow(() => renderer._drawConnectionPortHints({}));
});

test('deep tree drawing and hit tests use iterative traversal', () => {
    const root = { value: '0', x: 0, y: 0, children: [], meta: {} };
    let current = root;
    for (let index = 1; index < 2000; index++) {
        const child = {
            value: String(index), x: 0, y: index * 50,
            children: [], parent: current, meta: {}
        };
        current.children.push(child);
        current = child;
    }
    let drawnNodes = 0;
    const ctx = {
        globalAlpha: 1, save() {}, restore() {}, beginPath() {}, arc() {},
        moveTo() {}, lineTo() {}, stroke() {}, fill() {},
        fillText() { drawnNodes++; }
    };

    assert.doesNotThrow(() => TreeRenderer.draw(ctx, root));
    assert.equal(drawnNodes, 2000);
    assert.equal(TreeRenderer.hitTestNode(root, 0, 1999 * 50, { nodeRadius: 18 }), current);
    assert.equal(TreeRenderer.hitTestEdge(root, 100000, 100000, { nodeRadius: 18 }), false);
    assert.equal(TreeRenderer.hitTestEdgeNode(root, 100000, 100000, { nodeRadius: 18 }), null);
});

test('deep tree layout and Euler timestamps avoid recursive stack limits', () => {
    const nodeCount = 15000;
    const root = { value: '0', children: [], meta: {} };
    let current = root;
    for (let index = 1; index < nodeCount; index++) {
        const child = { value: String(index), children: [], meta: {} };
        current.children.push(child);
        child.parent = current;
        current = child;
    }

    assert.doesNotThrow(() => TreeLayout.layout(root));
    assert.deepEqual(TreeLayout.getBounds(root), {
        x: 0,
        y: 0,
        w: 0,
        h: (nodeCount - 1) * 60
    });
    const tour = TreeParser.computeEulerTour(root);
    assert.equal(tour.length, nodeCount);
    assert.equal(root.meta.tin, 1);
    assert.equal(current.meta.tin, nodeCount);
    assert.equal(current.meta.tout, nodeCount + 1);
    assert.equal(root.meta.tout, nodeCount * 2);
});

test('reciprocal directed graph edges keep their offset lanes and hit tests', () => {
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
        { u: '1', v: '2', directed: true },
        { u: '2', v: '1', directed: true }
    ];

    GraphRenderer.draw(ctx, nodes, edges, { nodeRadius: 10, directed: true });
    const edgePaths = paths.filter(points => points.length === 2);
    assert.equal(edgePaths.length, 2);
    assert.notEqual(edgePaths[0][0][1], edgePaths[1][0][1]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, 10, {
        nodeRadius: 10, directed: true
    }), edges[0]);
    assert.equal(GraphRenderer.hitTestEdge(nodes, edges, 50, -10, {
        nodeRadius: 10, directed: true
    }), edges[1]);

    const mixedEdges = [
        { u: '1', v: '2', directed: true },
        { u: '2', v: '1', directed: false }
    ];
    paths.length = 0;
    GraphRenderer.draw(ctx, nodes, mixedEdges, { nodeRadius: 10, directed: false });
    const mixedEdgePaths = paths.filter(points => points.length === 2);
    assert.equal(mixedEdgePaths.length, 2);
    assert.equal(mixedEdgePaths[0][0][1], 10);
    assert.equal(mixedEdgePaths[1][0][1], 0);

    const customIdNodes = new Map([
        ['a->b', { id: 'a->b', x: 0, y: 0, label: 'a->b' }],
        ['c', { id: 'c', x: 100, y: 0, label: 'c' }],
        ['c->a', { id: 'c->a', x: 0, y: 0, label: 'c->a' }],
        ['b', { id: 'b', x: 100, y: 0, label: 'b' }]
    ]);
    const customIdEdges = [
        { u: 'a->b', v: 'c', directed: true },
        { u: 'c->a', v: 'b', directed: true }
    ];
    paths.length = 0;
    GraphRenderer.draw(ctx, customIdNodes, customIdEdges, {
        nodeRadius: 10, directed: true
    });
    const customIdPaths = paths.filter(points => points.length === 2);
    assert.deepEqual(customIdPaths.map(points => points[0][1]), [0, 0]);
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

    const oversizedValues = Array.from({ length: 2001 }, (_, index) => String(index));
    assert.match(tree.buildFromText(oversizedValues.join(' '), 'auto'), /2000/);
    assert.equal(tree.root, root);
    assert.equal(tree.inputText, previousText);
    for (const build of [TreeParser.buildBST, TreeParser.buildAVL, TreeParser.buildRBTree]) {
        assert.match(build(oversizedValues).error, /2000/);
    }
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
    for (const camera of [
        { x: 1e20, y: 0, zoom: 1 },
        { x: 0, y: -1e20, zoom: 1 },
        { x: 0, y: 0, zoom: 1e-300 },
        { x: 0, y: 0, zoom: 11 }
    ]) {
        assert.throws(() => Serializer.loadJSONData(app, { elements: [], camera }), /invalid camera settings/);
    }
    assert.deepEqual(app.elements, [existing]);
    assert.deepEqual(app.camera, { x: 4, y: 5, zoom: 2 });
});

test('JSON imports reject oversized and duplicate data before replacing the board', () => {
    const existing = { id: 'keep-existing-board' };
    const app = {
        elements: [existing],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };

    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'pen', x: 0, y: 0, width: 0, height: 0,
            points: Array.from({ length: 100001 }, () => ({ x: 0, y: 0 }))
        }]
    }), /invalid point data or exceeds the supported point limit/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [
            { id: 'duplicate', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
            { id: 'duplicate', type: 'rectangle', x: 20, y: 0, width: 10, height: 10 }
        ]
    }), /duplicate element ID/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{ type: 'rectangle', x: 1e20, y: 0, width: 10, height: 10 }]
    }), /outside the supported range/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'rectangle', x: 0, y: 0, width: 10, height: 10,
            rotation: { toString: null, valueOf: null }
        }]
    }), /invalid style values/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{ type: 'rectangle', x: 0, y: 0, width: 10, height: 10, opacity: 2 }]
    }), /invalid style values/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'safe',
            fontFamily: { includes: true }
        }]
    }), /invalid or oversized text\/style data/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'pen', x: 0, y: 0, width: 0, height: 0,
            points: [{ x: -1e308, y: 0 }, { x: 1e308, y: 0 }]
        }]
    }), /invalid point data/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'matrix', x: 0, y: 0, width: 62, height: 62,
            rows: 1, cols: 1, data: [[{ toString: null, valueOf: null }]]
        }]
    }), /invalid dimensions or cell data/);
    assert.throws(() => Serializer.loadJSONData(app, {
        elements: [{
            type: 'graph', x: 0, y: 0, width: 400, height: 350,
            graphNodes: [{ id: '1', x: 1e20, y: 0, label: '1' }], edges: []
        }]
    }), /invalid node/);
    assert.deepEqual(app.elements, [existing]);
});

test('JSON import preserves signed line endpoints', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [{ type: 'line', x: 30, y: 20, width: -20, height: 15 }]
    });
    assert.equal(app.elements[0].width, -20);
    assert.equal(app.elements[0].height, 15);
});

test('JSON import detaches line endpoints that reference missing elements', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'line', id: 'line-1', x: 30, y: 20, width: -20, height: 15,
            connections: {
                p1: { elementId: 'missing-target', portId: 'right' },
                p2: null
            }
        }]
    });
    assert.deepEqual(app.elements[0].connections, { p1: null, p2: null });
    assert.equal(app.elements[0].width, -20);
});

test('JSON import detaches line endpoints that reference unknown ports', () => {
    const app = {
        elements: [], camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} }, renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [
            { type: 'rectangle', id: 'target-1', x: 0, y: 0, width: 80, height: 60 },
            {
                type: 'line', id: 'line-2', x: 10, y: 10, width: 80, height: 60,
                connections: {
                    p1: { elementId: 'target-1', portId: 'not-a-port' },
                    p2: { elementId: 'target-1', portId: 'right' }
                }
            }
        ]
    });

    assert.deepEqual(app.elements[1].connections, {
        p1: null,
        p2: { elementId: 'target-1', portId: 'right' }
    });
});

test('partial element hydration preserves connections to elements outside the batch', () => {
    const app = {
        elements: [], camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} }, renderer: { markDirty() {} }
    };
    const connection = { elementId: 'target-outside-batch', portId: 'node_8' };
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'line', id: 'line-partial', x: 0, y: 0, width: 10, height: 10,
            connections: { p1: connection, p2: null }
        }]
    }, { preserveExternalConnections: true });

    assert.deepEqual(app.elements[0].connections, { p1: connection, p2: null });
});

test('graph JSON import normalizes mixed numeric and string node IDs', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'graph', x: 0, y: 0, width: 400, height: 350,
            graphNodes: [
                { id: 1, x: 40, y: 40, label: '1' },
                { id: '2', x: 80, y: 80, label: '2' }
            ],
            edges: [{ u: '1', v: 2, w: null, directed: false }]
        }]
    });

    const graph = app.elements[0];
    assert.equal(graph.nodes.size, 2);
    assert.equal(graph.edges[0].u, '1');
    assert.equal(graph.edges[0].v, '2');
    assert.ok(graph.nodes.has(graph.edges[0].u));
    assert.ok(graph.nodes.has(graph.edges[0].v));
});

test('graph JSON import repairs overlapping nodes and preserves separated positions', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    const savedNodes = [
        { id: '1', x: 100, y: 100, label: '1' },
        { id: '2', x: 100, y: 100, label: '2' },
        { id: '3', x: 600, y: 160, label: '3' }
    ];
    Serializer.loadJSONData(app, {
        elements: [{
            type: 'graph', x: 0, y: 0, width: 400, height: 350,
            graphNodes: savedNodes, edges: [{ u: '1', v: '2' }]
        }]
    });

    const graph = app.elements[0];
    const nodes = [...graph.nodes.values()];
    const minimumDistance = graph.nodeRadius * 2 + 6;
    for (let first = 0; first < nodes.length; first++) {
        for (let second = first + 1; second < nodes.length; second++) {
            assert.ok(Math.hypot(
                nodes[first].x - nodes[second].x,
                nodes[first].y - nodes[second].y
            ) >= minimumDistance - 1e-6);
        }
    }
    assert.deepEqual({ x: nodes[2].x, y: nodes[2].y }, { x: 600, y: 160 });
    assert.ok(graph.width >= 664);
});

test('graph and tree JSON restore clamp invalid node radii before layout', () => {
    const graph = new GraphElement();
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    const savedGraph = { ...graph.serialize(), nodeRadius: -10 };
    const restoredGraph = GraphElement.fromData(savedGraph);
    restoredGraph.deserialize(savedGraph);
    assert.equal(restoredGraph.nodeRadius, 1);
    assert.ok(!GraphLayout.hasOverlaps(restoredGraph.nodes, 10));

    const tree = new TreeElement();
    assert.equal(tree.buildFromText('2\n1 2'), null);
    const savedTree = { ...tree.serialize(), nodeRadius: -10 };
    const restoredTree = TreeElement.fromData(savedTree);
    restoredTree.deserialize(savedTree);
    assert.equal(restoredTree.nodeRadius, 8);
    assert.ok(restoredTree.root.children[0].y - restoredTree.root.y >= 24);
});

test('JSON element records cannot shadow methods or change element prototypes', () => {
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    const input = JSON.parse('{"elements":[{"type":"rectangle","x":0,"y":0,"width":10,"height":10,' +
        '"draw":"not-a-function","serialize":"not-a-function","constructor":{"polluted":true},' +
        '"__proto__":{"polluted":true}}]}');

    Serializer.loadJSONData(app, input);
    const [element] = app.elements;
    assert.equal(typeof element.draw, 'function');
    assert.equal(typeof element.serialize, 'function');
    assert.equal(Object.hasOwn(element, 'draw'), false);
    assert.equal(Object.prototype.polluted, undefined);
});

test('oversized JSON files are rejected before allocating a FileReader', async () => {
    const app = { elements: [] };
    await assert.rejects(
        Serializer.importJSON(app, { size: 25 * 1024 * 1024 + 1 }),
        /25 MB import limit/
    );
});

test('Markdown rendering bounds input size before invoking the parser', () => {
    const rendered = MarkdownElement.renderToHTML('x'.repeat(MarkdownElement.MAX_SOURCE_LENGTH + 1));
    assert.match(rendered, /1 MB rendering limit/);
    assert.ok(rendered.length < 100);
    assert.equal(MarkdownElement.renderToHTML(null), '');
});

test('Worker authentication fails closed and does not expose verifier errors', async () => {
    let verifyCalls = 0;
    const verify = async () => { verifyCalls++; };
    const missingSecret = await authorizeRequest(
        new Request('https://worker.example/room?token=valid'),
        {},
        verify
    );
    assert.deepEqual(missingSecret, { status: 503, message: 'Authentication is not configured.' });
    assert.equal(verifyCalls, 0);

    const missingToken = await authorizeRequest(
        new Request('https://worker.example/room'),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        verify
    );
    assert.deepEqual(missingToken, { status: 401, message: 'Unauthorized.' });
    assert.equal(verifyCalls, 0);

    const authorized = await authorizeRequest(
        new Request('https://worker.example/room?token=query-token', {
            headers: { Authorization: 'Bearer header-token' }
        }),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        async (token, options) => {
            verifyCalls++;
            assert.equal(token, 'header-token');
            assert.equal(options.secretKey, 'test-secret');
            return { sub: 'user_123' };
        }
    );
    assert.equal(authorized, null);

    const legacyWebSocketToken = await authorizeRequest(
        new Request('https://worker.example/room?token=websocket-token'),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        async () => assert.fail('Query-string tokens must not reach the Clerk verifier.')
    );
    assert.deepEqual(legacyWebSocketToken, { status: 401, message: 'Unauthorized.' });

    const invalid = await authorizeRequest(
        new Request('https://worker.example/room?token=invalid'),
        { CLERK_SECRET_KEY: 'test-secret', ALLOWED_ORIGINS: 'https://whiteboard.example' },
        async () => { throw new Error('secret verifier diagnostics'); }
    );
    assert.deepEqual(invalid, { status: 401, message: 'Unauthorized.' });
    assert.equal(JSON.stringify(invalid).includes('secret verifier diagnostics'), false);
});

test('Worker room names are bounded and reject encoded or path-like IDs', () => {
    const boardId = 'a'.repeat(32);
    assert.equal(getRoomId('/'), null);
    assert.equal(getRoomId('/' + boardId), boardId);
    assert.equal(getRoomId('/' + 'a'.repeat(65)), null);
    assert.equal(getRoomId('/a%2Fb'), null);
    assert.equal(getRoomId('/room/other'), null);
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

test('undoing an add uses the current selection API and redo restores group z-order', () => {
    const before = { type: 'rectangle', id: 'before' };
    const added = { type: 'rectangle', id: 'added' };
    const addedSecond = { type: 'rectangle', id: 'added-second' };
    const middle = { type: 'rectangle', id: 'middle' };
    const after = { type: 'rectangle', id: 'after' };
    const app = {
        elements: [before, added, middle, addedSecond, after],
        layerManager: { _reindex() {} },
        renderer: { markDirty() {} }
    };
    app.selectionManager = new SelectionManager(app);
    app.selectionManager.select(added);
    const history = new History(app);
    history.pushAdd(app, [added, addedSecond]);

    assert.doesNotThrow(() => history.undo());
    assert.deepEqual(app.elements, [before, middle, after]);
    assert.deepEqual(app.selectionManager.selectedElements, []);
    history.redo();
    history.redo();
    assert.deepEqual(app.elements, [before, added, middle, addedSecond, after]);
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

test('history push, undo, and redo each schedule autosave', () => {
    let saves = 0;
    let value = 2;
    const history = new History({
        renderer: { markDirty() {} },
        _autosave() { saves++; }
    });
    history.push({
        undo() { value = 1; },
        redo() { value = 2; }
    });
    assert.equal(saves, 1);
    history.undo();
    assert.equal(value, 1);
    assert.equal(saves, 2);
    history.redo();
    assert.equal(value, 2);
    assert.equal(saves, 3);
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

test('resize history restores graph and tree positions after their nodes are rebuilt', () => {
    const history = new History({ renderer: { markDirty() {} } });
    const tree = new TreeElement();
    const treeInput = '3\n1 2\n1 3';
    assert.equal(tree.buildFromText(treeInput, 'rooted'), null);
    const treeBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    tree.onResizeStart();
    const treeBefore = tree.captureResizeState();
    tree.onResize(tree.width * 1.5, tree.height * 1.5);
    const treeResizedBounds = { x: tree.x, y: tree.y, w: tree.width, h: tree.height };
    const treeAfter = tree.captureResizeState();
    history.pushResize(tree, treeBounds, treeResizedBounds, null, null, null, treeBefore, treeAfter);
    assert.equal(tree.buildFromText(treeInput, 'rooted'), null);
    history.undo();
    assert.deepEqual(tree.captureResizeState().nodePositions.map(({ x, y }) => ({ x, y })),
        treeBefore.nodePositions.map(({ x, y }) => ({ x, y })));
    history.redo();
    assert.deepEqual(tree.captureResizeState().nodePositions.map(({ x, y }) => ({ x, y })),
        treeAfter.nodePositions.map(({ x, y }) => ({ x, y })));

    const graph = new GraphElement();
    const graphInput = '3 2\n1 2\n2 3';
    assert.equal(graph.buildFromText(graphInput), null);
    const graphBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    graph.onResizeStart();
    const graphBefore = graph.captureResizeState();
    graph.width *= 1.5;
    graph.height *= 1.5;
    graph.onResize(graph.width, graph.height);
    const graphResizedBounds = { x: graph.x, y: graph.y, w: graph.width, h: graph.height };
    const graphAfter = graph.captureResizeState();
    history.pushResize(graph, graphBounds, graphResizedBounds, null, null, null, graphBefore, graphAfter);
    assert.equal(graph.buildFromText(graphInput), null);
    history.undo();
    assert.deepEqual(graphBefore.map(({ id }) => graph.nodes.get(id)).map(({ x, y }) => ({ x, y })),
        graphBefore.map(({ x, y }) => ({ x, y })));
    history.redo();
    assert.deepEqual(graphAfter.map(({ id }) => graph.nodes.get(id)).map(({ x, y }) => ({ x, y })),
        graphAfter.map(({ x, y }) => ({ x, y })));
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

test('legacy tree JSON without an input mode preserves its rooted parent direction', () => {
    const tree = new TreeElement();
    const data = {
        ...tree.serialize(),
        treeType: 'bst',
        inputText: '3\n2 1\n2 3'
    };
    delete data.inputMode;

    tree.deserialize(data);
    assert.equal(tree.root.value, '2');
    assert.deepEqual(tree.root.children.map(child => child.value), ['1', '3']);
    assert.equal(tree.inputMode, 'rooted');
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

test('duplicate tree values receive distinct connection port IDs', () => {
    const tree = new TreeElement(80, 45);
    tree.treeType = 'bst';
    assert.equal(tree.buildFromText('10 10 10', 'values'), null);

    const ports = tree.getConnectionPorts();
    assert.equal(ports.length, 3);
    assert.equal(new Set(ports.map(port => port.id)).size, 3);
    assert.equal(ports[0].id, 'node_10');

    for (const path of ['r', 'r.1', 'r.1.1']) {
        const node = tree.getNodeAtPath(path);
        const portId = path === 'r' ? 'node_10' : `tree@${path}`;
        const port = ports.find(candidate => candidate.id === portId);
        const offsets = tree._getCurrentOffsets();
        const expected = tree.toWorldPoint(offsets.offsetX + node.x, offsets.offsetY + node.y);
        assert.ok(port);
        assert.ok(Math.hypot(port.x - expected.x, port.y - expected.y) < 1e-8);
    }
});

test('tree connection ports stay stable after renaming nodes and survive JSON import', () => {
    const tree = new TreeElement(80, 45);
    assert.equal(tree.buildFromText('3\n1 2\n2 3'), null);
    const renamedNode = tree.root.children[0];
    const originalPort = tree.getConnectionPorts().find(port => port.id === 'node_2');
    assert.ok(originalPort);
    assert.equal(tree.setNodeValue(renamedNode, 'renamed'), true);
    const renamedPort = tree.getConnectionPorts().find(port => port.id === 'node_2');
    assert.deepEqual(renamedPort, originalPort);

    const line = new ShapeElement('line', 0, 0);
    line.connections = {
        p1: { elementId: tree.id, portId: 'node_2' },
        p2: null
    };
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        history: { clear() {} },
        selectionManager: { clear() {} },
        renderer: { markDirty() {} }
    };
    Serializer.loadJSONData(app, { elements: [tree.serialize(), line.serialize()] });
    assert.deepEqual(app.elements[1].connections.p1,
        { elementId: tree.id, portId: 'node_2' });
});

test('graph and tree nearest-port queries match their rendered port positions', () => {
    const graph = new GraphElement(40, 30);
    assert.equal(graph.buildFromText('4 3\n1 2\n2 3\n3 4'), null);
    graph.rotation = 0.37;
    const graphPort = graph.getConnectionPorts()[2];
    assert.deepEqual(
        graph.findNearestConnectionPort(graphPort.x, graphPort.y, 1),
        { ...graphPort, distance: 0 }
    );
    assert.equal(graph.findNearestConnectionPort(graphPort.x, graphPort.y, 0), null);

    const tree = new TreeElement(250, 60);
    tree.treeType = 'bst';
    assert.equal(tree.buildFromText('10 10 10', 'values'), null);
    tree.rotation = -0.41;
    const treePort = tree.getConnectionPorts()[2];
    assert.deepEqual(
        tree.findNearestConnectionPort(treePort.x, treePort.y, 1),
        { ...treePort, distance: 0 }
    );
    assert.equal(tree.findNearestConnectionPort(treePort.x, treePort.y, 0), null);
});

test('base nearest-port queries match ordered ports for rotated custom bounds', () => {
    const queue = new QueueElement(120, 80);
    queue.setFromText('front back');
    queue.rotation = 0.53;
    for (const port of queue.getConnectionPorts()) {
        assert.deepEqual(
            queue.findNearestConnectionPort(port.x, port.y, 1),
            { ...port, distance: 0 }
        );
    }
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

test('repeatedly shrinking a packed graph does not distort its frame aspect ratio', () => {
    const graph = new GraphElement();
    const input = ['500 499', ...Array.from({ length: 499 }, (_, index) => `1 ${index + 2}`)].join('\n');
    assert.equal(graph.buildFromText(input), null);
    const initialAspectRatio = graph.width / graph.height;
    const app = { renderer: { markDirty() {} } };

    for (let attempt = 0; attempt < 8; attempt++) {
        const transform = new Transform(app);
        const startX = graph.x + graph.width;
        const startY = graph.y + graph.height;
        const startWidth = graph.width;
        const startHeight = graph.height;
        transform.startResize(startX, startY, 2, graph);
        for (let step = 1; step <= 4; step++) {
            transform.update(
                startX - startWidth * 0.92 * step / 4,
                startY - startHeight * 0.92 * step / 4
            );
        }
        transform.finish();
        assert.ok(graph.width < 2000 && graph.height < 2000);
        assert.ok(Math.abs(graph.width / graph.height - initialAspectRatio) < 0.08);
        assert.equal(GraphLayout.hasOverlaps(graph.nodes, graph.nodeRadius * 2 + 8), false);
    }
});

test('resize transforms release copied pen points after finish and cancel', () => {
    const pen = new PenElement();
    pen.points = Array.from({ length: 10000 }, (_, index) => ({ x: index, y: index % 17 }));
    const transform = new Transform({ renderer: { markDirty() {} } });

    transform.startResize(0, 0, 2, pen);
    assert.equal(transform.startPoints.length, 10000);
    transform.finish();
    assert.equal(transform.startPoints, null);

    transform.startResize(0, 0, 2, pen);
    assert.equal(transform.startPoints.length, 10000);
    transform.cancel();
    assert.equal(transform.startPoints, null);
});

test('rotated line endpoint hit tests and drags stay in world coordinates', () => {
    const line = new ShapeElement('arrow', 10, 20, 40, -20);
    line.rotation = Math.PI / 3;
    const originalEndpoints = [line.getEndpointWorld(0), line.getEndpointWorld(1)];
    const endpointHandle = HitTest.hitTestHandles(
        line, originalEndpoints[0].x, originalEndpoints[0].y, { zoom: 1 }
    );
    assert.deepEqual(endpointHandle, { type: 'endpoint', index: 0, cursor: 'crosshair' });

    const transform = new Transform({ renderer: { markDirty() {} } });
    transform.startEndpoint(originalEndpoints[0].x, originalEndpoints[0].y, 0, line);
    const movedEndpoint = { x: originalEndpoints[0].x + 25, y: originalEndpoints[0].y - 12 };
    transform.update(movedEndpoint.x, movedEndpoint.y);
    const actualEndpoints = [line.getEndpointWorld(0), line.getEndpointWorld(1)];
    const closeTo = (actual, expected) =>
        Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9;
    assert.ok(closeTo(actualEndpoints[0], movedEndpoint));
    assert.ok(closeTo(actualEndpoints[1], originalEndpoints[1]));
    const info = transform.finish();
    assert.deepEqual(info._worldEndpoints, originalEndpoints);

    transform.startEndpoint(actualEndpoints[1].x, actualEndpoints[1].y, 1, line);
    transform.update(actualEndpoints[1].x - 40, actualEndpoints[1].y + 15);
    transform.cancel();
    assert.ok(closeTo(line.getEndpointWorld(0), actualEndpoints[0]));
    assert.ok(closeTo(line.getEndpointWorld(1), actualEndpoints[1]));
});

test('locked elements cannot be hit, selected, moved, or deleted', () => {
    const makeElement = (id, locked, zIndex) => ({
        id, locked, hidden: false, x: 0, y: 0, width: 20, height: 20, zIndex,
        containsPoint: () => true,
        getBounds: () => ({ x: 0, y: 0, w: 20, h: 20 })
    });
    const locked = makeElement('locked', true, 2);
    const movable = makeElement('movable', false, 1);
    const app = {
        elements: [movable, locked],
        renderer: { markDirty() {} },
        layerManager: { _reindex() {} }
    };
    app.selectionManager = new SelectionManager(app);

    assert.equal(HitTest.hitTestAll(app.elements, 5, 5, { zoom: 1 }), movable);
    assert.equal(HitTest.hitTestHandles(locked, 0, 0, { zoom: 1 }), null);
    app.selectionManager.select(movable);
    app.selectionManager.select(locked);
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);
    app.selectionManager.toggleSelect(locked);
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);
    app.selectionManager.selectedElements = [movable, locked];
    app.selectionManager.startRubberBand(50, 50);
    app.selectionManager.updateRubberBand(60, 60);
    app.selectionManager.finishRubberBand(true);
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);
    app.selectionManager.selectAll();
    assert.deepEqual(app.selectionManager.selectedElements, [movable]);

    const transform = new Transform(app);
    app.selectionManager.selectedElements = [locked];
    assert.equal(transform.startDrag(0, 0), false);
    transform.update(10, 10);
    assert.equal(locked.x, 0);
    assert.equal(locked.y, 0);

    app.selectionManager.selectedElements = [movable, locked];
    transform.startDrag(0, 0);
    transform.update(10, 5);
    assert.equal(movable.x, 10);
    assert.equal(movable.y, 5);
    assert.equal(locked.x, 0);
    assert.equal(locked.y, 0);
    assert.deepEqual(transform.finish().elements.map(item => item.el.id), ['movable']);

    app.selectionManager.selectedElements = [locked];
    assert.deepEqual(app.selectionManager.deleteSelected(), []);
    assert.deepEqual(app.elements, [movable, locked]);
});

test('layer lock state survives JSON export and import', () => {
    const source = new ShapeElement('rectangle', 10, 20, 30, 40);
    source.locked = true;
    const app = {
        elements: [],
        camera: { x: 0, y: 0, zoom: 1 },
        selectionManager: { clear() {} },
        layerManager: { _reindex() {} },
        history: { clear() {} },
        renderer: { markDirty() {} }
    };

    Serializer.loadJSONData(app, {
        version: 1,
        elements: [source.serialize()],
        camera: { x: 0, y: 0, zoom: 1 }
    });
    assert.equal(app.elements[0].locked, true);
});
