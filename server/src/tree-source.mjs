import { MAX_TREE_NODES, TreeParser } from '../../js/tree/TreeParser.js';

/** Validate saved tree sources without requiring the Cloudflare runtime. */
export function validateTreeElementSource(data) {
  if (data.inputText === '') return;
  const lines = data.inputText.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  const inputMode = data.inputMode;
  const zeroBased = data.zeroBased === true;
  let parsed;
  if (inputMode === undefined && !zeroBased) {
    // Preserve legacy parent/child rows that predate explicit format settings.
    parsed = TreeParser.parseRootedFormat(lines);
    if (parsed.error) parsed = TreeParser.autoDetectAndParse(data.inputText, data.treeType || 'tree');
  } else if (inputMode === 'rooted') parsed = TreeParser.parseRootedFormat(lines);
  else if (inputMode === 'parent') parsed = TreeParser.parseParentFormat(lines);
  else if (inputMode === 'edge') parsed = TreeParser.parseEdgeFormat(lines);
  else if (inputMode === 'values') {
    const values = data.inputText.replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
    parsed = values.length > MAX_TREE_NODES
      ? { error: 'Tree input contains too many values.' }
      : TreeParser._buildByType(values, data.treeType || 'tree');
  } else parsed = TreeParser.autoDetectAndParse(data.inputText, data.treeType || 'tree', zeroBased);
  if (parsed?.error || !parsed?.root) throw new Error('Tree source cannot be restored.');

  const validPaths = new Set();
  const pending = [{ node: parsed.root, path: 'r' }];
  while (pending.length) {
    const { node, path } = pending.pop();
    if (!node || validPaths.has(path)) continue;
    validPaths.add(path);
    (node.children || []).forEach((child, index) => {
      if (child) pending.push({ node: child, path: `${path}.${index}` });
    });
  }
  for (const [path, value] of Object.entries(data.nodeValueOverrides || {})) {
    if (!validPaths.has(path) || typeof value === 'object') {
      throw new Error('Tree node override points to an unknown node.');
    }
  }
  for (const path of Object.keys(data.edgeWeightOverrides || {})) {
    if (!validPaths.has(path) || path === 'r') {
      throw new Error('Tree edge-weight override points to an unknown edge.');
    }
  }
}
