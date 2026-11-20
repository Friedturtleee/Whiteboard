import test from 'node:test';
import assert from 'node:assert/strict';
import { MatrixElement } from '../js/elements/MatrixElement.js';
import { PenElement } from '../js/elements/PenElement.js';
import { MermaidElement } from '../js/elements/MermaidElement.js';
import { TreeElement } from '../js/tree/TreeElement.js';
import { TreeParser } from '../js/tree/TreeParser.js';
import { TreeLayout } from '../js/tree/TreeLayout.js';
import { GraphElement } from '../js/graph/GraphElement.js';
import { GraphRenderer, MAX_PARALLEL_EDGE_LANES } from '../js/graph/GraphRenderer.js';

test('matrix single column keeps numeric tokens whole but still splits character grids', () => {
    const numbers = new MatrixElement(0, 0);
    assert.equal(numbers.setFromText('-5\n3.14\n10'), null);
    assert.deepEqual(numbers.data, [['-5'], ['3.14'], ['10']]);

    const grid = new MatrixElement(0, 0);
    assert.equal(grid.setFromText('#..#\n.##.'), null);
    assert.deepEqual(grid.data, [['#', '.', '.', '#'], ['.', '#', '#', '.']]);

    const mixed = new MatrixElement(0, 0);
    assert.equal(mixed.setFromText('abc\n5'), null);
    assert.deepEqual(mixed.data, [['abc'], ['5']]);
});

test('tree auto mode only accepts a plausible parent array and explains lone numbers', () => {
    const ok = TreeParser.autoDetectAndParse('0\n1\n1');
    assert.equal(ok.error, null);
    assert.equal(ok.format, 'parent');

    const bad = TreeParser.autoDetectAndParse('5\n3\n8');
    assert.ok(bad.error);
    assert.match(bad.error, /數值列表/);

    for (const lone of ['5', '0']) {
        const result = TreeParser.autoDetectAndParse(lone);
        assert.ok(result.error, lone);
        assert.match(result.error, /數值列表/);
    }
    // Contest format and the single-node tree keep working.
    assert.equal(TreeParser.autoDetectAndParse('1').root.value, '1');
    assert.equal(TreeParser.autoDetectAndParse('3\n1 2\n1 3').error, null);
});

test('tree persists zeroBased and tolerates saves without it', () => {
    const tree = new TreeElement(0, 0);
    assert.equal(tree.buildFromText('1', 'auto', true), null);
    assert.equal(tree.root.value, '0');
    const data = tree.serialize();
    assert.equal(data.zeroBased, true);
    const restored = new TreeElement(0, 0);
    restored.deserialize(data);
    assert.equal(restored.root.value, '0');
    assert.equal(restored.zeroBased, true);

    const { zeroBased, ...legacy } = data;
    const old = new TreeElement(0, 0);
    old.deserialize({ ...legacy, inputText: '2\n1 2', inputMode: 'auto' });
    assert.equal(old.zeroBased, false);
    assert.equal(old.root.value, '1');
});

test('empty input clears tree and graph and updates inputText', () => {
    const tree = new TreeElement(0, 0);
    assert.equal(tree.buildFromText('3\n1 2\n1 3'), null);
    assert.equal(tree.buildFromText(''), null);
    assert.equal(tree.root, null);
    assert.equal(tree.inputText, '');

    const graph = new GraphElement(0, 0);
    assert.equal(graph.buildFromText('2 1\n1 2'), null);
    assert.equal(graph.buildFromText(''), null);
    assert.equal(graph.nodes.size, 0);
    assert.equal(graph.edges.length, 0);
    assert.equal(graph.inputText, '');
});

test('parallel edges are capped to a bounded number of lanes', () => {
    const rows = Array.from({ length: 500 }, () => '1 2 7');
    const graph = new GraphElement(0, 0);
    assert.equal(graph.buildFromText(['2 500', ...rows].join('\n')), null);
    const bounds = GraphRenderer.getContentBounds(graph.nodes, graph.edges, { nodeRadius: graph.nodeRadius });
    // Lane spacing is 22px for weighted edges; 500 uncapped lanes would be ~11000px tall.
    assert.ok(bounds.maxY - bounds.minY < MAX_PARALLEL_EDGE_LANES * 22 + 400 + 2 * graph.nodeRadius + 200);
    assert.ok(graph.width < 5000 && graph.height < 5000);
    assert.equal(GraphRenderer._edgeLabelText({ w: '7' }, 495), '7 ×495');
});

test('pen translate shifts points and survives a serialize round trip', () => {
    const pen = new PenElement(0, 0);
    pen.addPoint(10, 10); pen.addPoint(30, 20);
    assert.equal(pen.translate(20, 20), true);
    assert.equal(pen.x, 30);
    assert.deepEqual(pen.points, [{ x: 30, y: 30 }, { x: 50, y: 40 }]);
    const copy = new PenElement(0, 0);
    copy.deserialize(pen.serialize());
    assert.equal(copy.x, 30);
    assert.equal(copy.y, 30);
});

test('oversized mermaid svg keeps its source instead of being emptied', () => {
    const huge = '<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(2_100_000) + '</svg>';
    const element = new MermaidElement(0, 0);
    element.deserialize({ ...element.serialize(), svgString: huge });
    assert.equal(element.oversizedSvgSource, huge);
    assert.equal(element.serialize().svgString, huge);
});
