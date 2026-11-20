import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTreeElementSource } from '../server/src/tree-source.mjs';
import { TreeElement } from '../js/tree/TreeElement.js';

test('cloud tree validation honors the saved numbering flag', () => {
    const tree = new TreeElement();
    for (const zeroBased of [true, false]) {
        tree.buildFromText('1', 'auto', zeroBased);
        assert.doesNotThrow(() => validateTreeElementSource(tree.serialize()));
    }
    for (const inputMode of ['auto', undefined]) {
        const invalid = { inputText: '2\n1 2', inputMode, zeroBased: true };
        assert.throws(() => validateTreeElementSource(invalid), /cannot be restored/);
    }
});

test('cloud tree validation preserves legacy rooted input and checks override paths', () => {
    const legacy = {
        inputText: '3\n2 1\n2 3',
        nodeValueOverrides: { 'r.1': 'renamed' },
        edgeWeightOverrides: { 'r.1': '7' }
    };
    assert.doesNotThrow(() => validateTreeElementSource(legacy));
    assert.doesNotThrow(() => validateTreeElementSource({ ...legacy, zeroBased: false }));
    assert.throws(() => validateTreeElementSource({ ...legacy, inputMode: 'auto' }), /unknown node/);
    assert.throws(() => validateTreeElementSource({ ...legacy, edgeWeightOverrides: { r: '7' } }), /unknown edge/);
});
