import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../js/app.js';
import { History } from '../js/core/History.js';
import { TreeElement } from '../js/tree/TreeElement.js';
import { GraphElement } from '../js/graph/GraphElement.js';
import { MatrixElement } from '../js/elements/MatrixElement.js';
import { StackElement } from '../js/elements/StackElement.js';
import { QueueElement } from '../js/elements/QueueElement.js';
import { validateWhiteboardElement } from '../js/core/WhiteboardElementValidation.js';
import { ShapeElement } from '../js/elements/ShapeElement.js';

function dialogApp(element) {
    let options;
    const app = Object.assign(Object.create(App.prototype), {
        elements: [element],
        renderer: { markDirty() {} },
        layerManager: { _reindex() {} },
        toolbar: { setTool() {} },
        selectionManager: {
            selectedElements: [element],
            clear() { this.selectedElements = []; },
            select(value) { this.selectedElements = [value]; }
        },
        textInputDialog: { show(value) { options = value; } },
        _refreshUI() {}, _fitView() {}, _autosave() {}
    });
    app.history = new History(app);
    return { app, get options() { return options; } };
}

test('changing only single-node tree numbering can be undone and redone', () => {
    const tree = new TreeElement();
    tree.buildFromText('1', 'auto', true);
    const harness = dialogApp(tree);
    harness.app._showTreeDialog(tree);
    assert.equal(harness.options.zeroBased, true);
    assert.equal(harness.options.onInput('1', 'tree', 'auto', false, false), null);
    harness.options.onConfirm('1', 'tree', 'auto', false, false);
    assert.equal(tree.root.value, '1');
    assert.equal(harness.app.history.undoStack.length, 1);
    harness.app.history.undo();
    assert.equal(tree.root.value, '0');
    assert.equal(tree.zeroBased, true);
    harness.app.history.redo();
    assert.equal(tree.root.value, '1');
    assert.equal(tree.zeroBased, false);
});

test('confirming unchanged tree input preserves inline edits after a preview', () => {
    const tree = new TreeElement();
    tree.buildFromText('2\n1 2');
    tree.setNodeValue(tree.root, 'custom root');
    tree.setEdgeWeight(tree.root.children[0], '99');
    const original = tree.serialize();
    const harness = dialogApp(tree);
    harness.app._showTreeDialog(tree);
    harness.options.onInput(tree.inputText, 'euler', 'auto', false, false);
    harness.options.onInput(tree.inputText, 'tree', 'auto', false, false);
    harness.options.onConfirm(tree.inputText, 'tree', 'auto', false, false);
    assert.deepEqual(tree.serialize(), original);
    assert.equal(harness.app.history.undoStack.length, 0);
});

test('tree numbering controls follow source IDs rather than an edited root label', () => {
    const tree = new TreeElement();
    tree.buildFromText('1');
    tree.setNodeValue(tree.root, '0');
    const harness = dialogApp(tree);
    harness.app._showTreeDialog(tree);
    assert.equal(harness.options.zeroBased, false);
    harness.options.onConfirm('1', 'tree', 'auto', false, false);
    assert.equal(tree.root.value, '0');
    assert.equal(tree.zeroBased, false);
    assert.equal(harness.app.history.undoStack.length, 0);
});

test('confirming unchanged graph input preserves positions and annotations after a preview', () => {
    const graph = new GraphElement();
    graph.buildFromText('2 1\n1 2');
    Object.assign(graph.nodes.get('1'), { x: 80, y: 80, label: 'custom node', nodeWeight: '7' });
    Object.assign(graph.nodes.get('2'), { x: 240, y: 160 });
    graph.edges[0].w = '99';
    const original = graph.serialize();
    const harness = dialogApp(graph);
    harness.app._showGraphDialog(graph);
    harness.options.onInput(graph.inputText, null, null, true, false, 'edge-list');
    harness.options.onInput(graph.inputText, null, null, false, false, 'edge-list');
    harness.options.onConfirm(graph.inputText, null, null, false, false, 'edge-list');
    assert.deepEqual(graph.serialize(), original);
    assert.equal(harness.app.history.undoStack.length, 0);
});

test('changed graph numbering remains a reversible edit', () => {
    const graph = new GraphElement();
    graph.buildFromText('1 0');
    const harness = dialogApp(graph);
    harness.app._showGraphDialog(graph);
    harness.options.onInput('1 0', null, null, false, true, 'edge-list');
    harness.options.onConfirm('1 0', null, null, false, true, 'edge-list');
    assert.equal(graph.nodes.has('0'), true);
    assert.equal(harness.app.history.undoStack.length, 1);
    harness.app.history.undo();
    assert.equal(graph.nodes.has('1'), true);
    harness.app.history.redo();
    assert.equal(graph.nodes.has('0'), true);
});

test('canceling existing elements without source text retains their saved data', () => {
    for (const ElementClass of [MatrixElement, StackElement, QueueElement, GraphElement]) {
        const element = new ElementClass();
        if (element.type === 'graph') element.buildFromText('2 1\n1 2');
        else element.setFromText('1 2 3');
        element.inputText = '';
        const original = element.serialize();
        const harness = dialogApp(element);
        if (element.type === 'graph') harness.app._showGraphDialog(element);
        else harness.app._showDataStructureDialog(element);
        harness.options.onCancel();
        assert.equal(harness.app.elements[0], element, element.type);
        assert.deepEqual(element.serialize(), original);
        assert.equal(harness.app.history.undoStack.length, 0);
    }
});

test('confirming unchanged empty source retains an imported graph', () => {
    const graph = new GraphElement();
    graph.buildFromText('2 1\n1 2');
    graph.inputText = '';
    const original = graph.serialize();
    const harness = dialogApp(graph);
    harness.app._showGraphDialog(graph);
    harness.options.onConfirm('', null, null, false, false, 'edge-list');
    assert.equal(harness.app.elements[0], graph);
    assert.deepEqual(graph.serialize(), original);
    assert.equal(harness.app.history.undoStack.length, 0);
});

test('clearing existing tree input is an undoable deletion', () => {
    const tree = new TreeElement();
    tree.buildFromText('2\n1 2');
    const original = tree.serialize();
    const harness = dialogApp(tree);
    harness.app._showTreeDialog(tree);
    assert.equal(harness.options.onConfirm('', 'tree', 'auto', false, false), undefined);
    assert.equal(harness.app.elements.length, 0);
    harness.app.history.undo();
    assert.equal(harness.app.elements[0], tree);
    assert.deepEqual(tree.serialize(), original);
    harness.app.history.redo();
    assert.equal(harness.app.elements.length, 0);
});

test('batch matrix edits account for quoting when enforcing the import limit', () => {
    const matrix = new MatrixElement();
    matrix.setFromText('200x1');
    const harness = dialogApp(matrix);
    const cells = Array.from({ length: 200 }, (_, row) => [row, 0]);
    assert.match(harness.app._applyMatrixCellValues(matrix, cells, ['a'.repeat(4999)]), /1 MB/);
    assert.equal(matrix.inputText, '200x1');
    assert.ok(matrix.data.every(row => row[0] === ''));
    assert.equal(harness.app.history.undoStack.length, 0);

    assert.equal(harness.app._applyMatrixCellValues(matrix, cells, ['a'.repeat(4997)]), null);
    assert.equal(matrix.inputText.length, 999999);
    validateWhiteboardElement(matrix.serialize());
    harness.app.history.undo();
    assert.ok(matrix.data.every(row => row[0] === ''));
    harness.app.history.redo();
    assert.equal(matrix.inputText.length, 999999);
});

test('prefix and difference matrices retain negative column values when edited again', () => {
    for (const [operation, expected] of [
        ['prefix', [['0'], ['-1.5'], ['-4']]],
        ['diff', [['-1.5'], ['-1']]]
    ]) {
        const matrix = new MatrixElement();
        matrix.setFromText('"-1.5"\n"-2.5"');
        const original = matrix.serialize();
        const harness = dialogApp(matrix);
        harness.app._duplicateAndTransformMatrix(matrix, operation);
        const result = harness.app.elements[1];
        assert.deepEqual(result.data, expected);
        const reparsed = new MatrixElement();
        assert.equal(reparsed.setFromText(result.inputText), null);
        assert.deepEqual(reparsed.data, expected);
        validateWhiteboardElement(result.serialize());
        assert.deepEqual(matrix.serialize(), original);
        harness.app.history.undo();
        assert.deepEqual(harness.app.elements, [matrix]);
        harness.app.history.redo();
        assert.equal(harness.app.elements[1], result);
    }
});

test('data dialogs keep attached line endpoints synchronized across edits and history', () => {
    const cases = [
        [MatrixElement, '1 2\n3 4', '4x4', 'right'],
        [StackElement, '1 2', '1 2 3 4', 'bottom'],
        [QueueElement, '1 2', '1 2 3 4', 'right'],
        [TreeElement, '2\n1 2', '3\n1 2\n1 3', 'node_1'],
        [GraphElement, '2 1\n1 2', '3 2\n1 2\n2 3', 'node_1']
    ];
    for (const [ElementClass, input, nextInput, portId] of cases) {
        for (const preview of [false, true]) {
            const element = new ElementClass(80, 50);
            if (element.type === 'tree' || element.type === 'graph') element.buildFromText(input);
            else element.setFromText(input);
            element.rotation = 0.2;
            const harness = dialogApp(element);
            const line = new ShapeElement('line', 0, 0, 500, 400);
            line.connections.p1 = { elementId: element.id, portId };
            harness.app.elements.push(line);
            harness.app._updateConnectedLines([element.id]);
            const assertAttached = () => {
                const port = element.getConnectionPorts().find(port => port.id === portId);
                const endpoint = line.getEndpointWorld(0);
                assert.ok(Math.hypot(endpoint.x - port.x, endpoint.y - port.y) < 1e-8,
                    `${element.type}: attached line must follow its port`);
            };
            const open = () => {
                if (element.type === 'tree') harness.app._showTreeDialog(element);
                else if (element.type === 'graph') harness.app._showGraphDialog(element);
                else harness.app._showDataStructureDialog(element);
            };
            const apply = (callback, text) => element.type === 'tree'
                ? callback(text, 'tree', 'auto', false, false)
                : callback(text, null, null, false, false, 'edge-list');
            open();
            if (preview) { apply(harness.options.onInput, nextInput); assertAttached(); }
            apply(harness.options.onConfirm, nextInput);
            assertAttached();
            harness.app.history.undo();
            assertAttached();
            harness.app.history.redo();
            assertAttached();
            open();
            apply(harness.options.onInput, input);
            assertAttached();
            harness.options.onCancel();
            assertAttached();
        }
    }
});
