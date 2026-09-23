/**
 * TreeParser — parses text input into a tree structure.
 *
 * Format R (rooted, default for 'tree' type):
 *   First line: n (number of nodes)
 *   Next n-1 lines: parent child [child_weight]
 *   child_weight is stored as meta.nodeWeight on the child node.
 *
 * Format A (parent array):
 *   Each line n is the parent of node n (1-indexed).
 *   Parent = 0, -1, or self-reference means root.
 *
 * Format B (edge list):
 *   u v [w]
 *   Each line is an edge. Optional 3rd value = edge weight (auto-detected).
 *
 * Format C (value list → auto-build BST/AVL/RBTree):
 *   val1 val2 val3 ...
 */
export const MAX_TREE_NODES = 2000;
export const MAX_TREE_INPUT_LENGTH = 1000000;
const MAX_TREE_EDGE_ROWS = MAX_TREE_NODES * 2;

function hasOnlyFiniteNumericValues(values) {
    return Array.isArray(values) && values.every(value =>
        (typeof value === 'number' || typeof value === 'string') &&
        String(value).trim() !== '' && Number.isFinite(Number(value))
    );
}

export class TreeParser {
    /**
     * Auto-detect input format and parse accordingly.
     * @param {string} text
     * @param {string} treeType - 'tree' | 'bst' | 'avl' | 'rb' | 'euler'
     * @returns {{ root, nodes, error, hasWeights, format }}
     */
    static autoDetectAndParse(text, treeType = 'tree') {
        if (typeof text !== 'string') {
            return { root: null, nodes: new Map(), error: '樹資料必須是文字。' };
        }
        if (text.length > MAX_TREE_INPUT_LENGTH) {
            return { root: null, nodes: new Map(), error: '樹資料不可超過 1 MB。' };
        }
        const lines = text.replace(/,/g, ' ').trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return { root: null, nodes: new Map(), error: '輸入為空' };

        const tokenCounts = lines.map(l => l.split(/\s+/).length);

        // For generic 'tree' (and 'euler') type: use rooted format
        // Detection: first line is a single integer N, rest are 2-3 token edge lines
        if (treeType === 'tree' || treeType === 'euler') {
            if (tokenCounts[0] === 1 && /^\d+$/.test(lines[0])
                && (lines.length === 1 || tokenCounts.slice(1).every(c => c >= 2 && c <= 3))) {
                return TreeParser.parseRootedFormat(lines);
            }
        }

        // Single line with multiple values → value list for auto-build
        if (lines.length === 1 && tokenCounts[0] > 1) {
            const values = lines[0].split(/[\s,]+/).filter(v => v);
            return TreeParser._buildByType(values, treeType);
        }

        // All lines have exactly 1 token → parent array format
        if (tokenCounts.every(c => c === 1)) {
            const allInts = lines.every(l => /^-?\d+$/.test(l));
            if (allInts) {
                return TreeParser.parseParentFormat(lines);
            }
            // Multi-line value list
            const values = lines.map(l => l.trim());
            return TreeParser._buildByType(values, treeType);
        }

        // Lines have 2+ tokens → edge list format
        if (tokenCounts.every(c => c >= 2)) {
            return TreeParser.parseEdgeFormat(lines);
        }

        // Mixed token counts → try edge format
        return TreeParser.parseEdgeFormat(lines);
    }

    /**
     * Parse rooted format: first line = n, then n-1 lines of "parent child [child_weight]".
     * child_weight is stored as meta.nodeWeight on the child node.
     * @param {string[]} lines - pre-split, trimmed, non-empty lines
     */
    static parseRootedFormat(lines) {
        const invalid = (error) => ({
            root: null, nodes: new Map(), error, hasWeights: false, format: 'rooted'
        });
        if (!Array.isArray(lines) || lines.length === 0) {
            return invalid('請輸入樹的節點數與邊資料。');
        }

        const header = String(lines[0]).trim();
        const n = Number(header);
        if (!/^\d+$/.test(header) || !Number.isSafeInteger(n) || n <= 0) {
            return invalid('第一行應為正整數節點數 n。');
        }
        if (n > MAX_TREE_NODES) {
            return invalid('節點數不可超過 ' + MAX_TREE_NODES + '。');
        }
        if (lines.length !== n) {
            return invalid('節點數為 ' + n + ' 時，後續必須恰好提供 ' + (n - 1) + ' 條邊。');
        }

        const nodes = new Map();
        let hasWeights = false;

        const getNode = (id) => {
            const key = String(id);
            if (!nodes.has(key)) {
                nodes.set(key, { value: key, children: [], parent: null, x: 0, y: 0, meta: {} });
            }
            return nodes.get(key);
        };

        // Create all n nodes (1-based)
        for (let i = 1; i <= n; i++) getNode(i);

        // Parse n-1 directed edges: parent → child [child_node_weight].
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length < 2 || parts.length > 3) {
                return invalid('第 ' + (i + 1) + ' 行格式應為：父節點 子節點 [節點權重]。');
            }
            const parentKey = parts[0];
            const childKey = parts[1];
            const weight = parts.length >= 3 ? parts[2] : null;
            if (!/^\d+$/.test(parentKey) || !/^\d+$/.test(childKey)) {
                return invalid('第 ' + (i + 1) + ' 行的節點編號必須是正整數。');
            }
            const parentId = Number(parentKey);
            const childId = Number(childKey);
            if (!Number.isSafeInteger(parentId) || !Number.isSafeInteger(childId) ||
                parentId < 1 || parentId > n || childId < 1 || childId > n) {
                return invalid('第 ' + (i + 1) + ' 行的節點編號必須介於 1 和 ' + n + '。');
            }
            if (parentId === childId) {
                return invalid('第 ' + (i + 1) + ' 行不能讓節點成為自己的父節點。');
            }

            const parentNode = getNode(parentId);
            const childNode = getNode(childId);
            if (childNode.parent) {
                return invalid('節點 ' + childId + ' 有多個父節點或重複邊。');
            }

            if (weight !== null) {
                childNode.meta.nodeWeight = weight;
                hasWeights = true;
            }

            childNode.parent = parentNode;
            parentNode.children.push(childNode);
        }

        const roots = [...nodes.values()].filter(node => !node.parent);
        if (roots.length !== 1) {
            return invalid('樹必須且只能有一個根節點，目前找到 ' + roots.length + ' 個。');
        }
        const root = roots[0];
        const visited = new Set();
        const pending = [root];
        while (pending.length) {
            const node = pending.pop();
            if (visited.has(node)) {
                return invalid('輸入包含循環或重複連結，無法形成樹。');
            }
            visited.add(node);
            for (const child of node.children) pending.push(child);
        }
        if (visited.size !== n) {
            return invalid('有 ' + (n - visited.size) + ' 個節點無法從根節點到達。');
        }

        return { root, nodes, error: null, hasWeights, format: 'rooted' };
    }

    /** Dispatch to the appropriate auto-build method. */
    static _buildByType(values, treeType) {
        if (treeType === 'bst') return TreeParser.buildBST(values);
        if (treeType === 'avl') return TreeParser.buildAVL(values);
        if (treeType === 'rb')  return TreeParser.buildRBTree(values);
        // For generic tree / euler, default to BST
        return TreeParser.buildBST(values);
    }

    /**
     * Parse parent-array format.
     * Line n (1-indexed) = parent of node n.
     * Parent = 0, -1, or self-reference → root.
     * Auto-detects whether the first "0" line is present.
     * @param {string[]} lines - pre-split, trimmed, non-empty lines
     */
    static parseParentFormat(lines) {
        const n = lines.length;
        const invalid = error => ({
            root: null, nodes: new Map(), error, format: 'parent', hasWeights: false
        });
        if (n === 0) return invalid('父節點陣列不可為空。');
        if (n > MAX_TREE_NODES) {
            return invalid('節點數不可超過 ' + MAX_TREE_NODES + '。');
        }
        const parents = lines.map(line => {
            const token = String(line).trim();
            if (!/^-?\d+$/.test(token)) return NaN;
            const value = Number(token);
            return Number.isSafeInteger(value) ? value : NaN;
        });
        if (parents.some(parent => !Number.isSafeInteger(parent))) {
            return invalid('父節點編號必須是安全整數。');
        }
        let rootCount = 0;
        for (let i = 0; i < n; i++) {
            const nodeId = i + 1;
            const parentId = parents[i];
            const isRoot = parentId === 0 || parentId === -1 || parentId === nodeId;
            if (isRoot) rootCount++;
            else if (parentId < 1 || parentId > n) {
                return invalid('節點 ' + nodeId + ' 的父節點編號超出範圍。');
            }
        }
        if (rootCount !== 1) {
            return invalid('父節點陣列必須且只能有一個根節點，目前找到 ' + rootCount + ' 個。');
        }
        const nodes = new Map();
        const errors = [];

        const getNode = (id) => {
            const key = String(id);
            if (!nodes.has(key)) {
                nodes.set(key, { value: key, children: [], parent: null, x: 0, y: 0, meta: {} });
            }
            return nodes.get(key);
        };

        // Nodes are 1..n; line i → parent of node i
        let rootId = -1;
        for (let i = 0; i < n; i++) {
            const nodeId = i + 1;
            const parentId = parents[i];
            getNode(nodeId);

            if (parentId === 0 || parentId === -1 || parentId === nodeId) {
                // Root node
                if (rootId === -1) rootId = nodeId;
            }
        }

        // If no explicit root, node 1 is root by default
        if (rootId === -1) rootId = 1;

        // Build parent-child relationships
        for (let i = 0; i < n; i++) {
            const nodeId = i + 1;
            const parentId = parents[i];
            if (nodeId === rootId) continue;

            const node = getNode(nodeId);
            const parentNode = getNode(parentId);
            node.parent = parentNode;
            parentNode.children.push(node);
        }

        const root = nodes.get(String(rootId));

        // Validate connectivity
        if (root) {
            const visited = new Set();
            const walk = (nd) => {
                if (!nd || visited.has(nd.value)) return;
                visited.add(nd.value);
                for (const c of nd.children) walk(c);
            };
            walk(root);
            if (visited.size < nodes.size) {
                errors.push(`有 ${nodes.size - visited.size} 個節點無法從根到達`);
            }
        }

        if (errors.length) return invalid(errors.join('\n'));
        return { root, nodes, error: null, format: 'parent', hasWeights: false };
    }

    /**
     * Parse edge-list format.  Each line: u v [w]
     * Auto-detects edge weights.
     * @param {string[]} lines - pre-split, trimmed, non-empty lines
     */
    static parseEdgeFormat(lines) {
        const invalid = error => ({
            root: null, nodes: new Map(), error, hasWeights: false, format: 'edge'
        });
        const nodes = new Map();
        const edges = [];
        const seenEdges = new Map();
        let hasWeights = false;
        if (!Array.isArray(lines) || lines.length === 0) {
            return invalid('至少需要一條有效的邊。');
        }
        if (lines.length > MAX_TREE_EDGE_ROWS) {
            return invalid('樹的邊資料不可超過 ' + MAX_TREE_EDGE_ROWS + ' 行。');
        }

        const getNode = (val) => {
            const key = String(val);
            if (!nodes.has(key)) {
                if (nodes.size >= MAX_TREE_NODES) return null;
                nodes.set(key, { value: key, children: [], parent: null, x: 0, y: 0, meta: {} });
            }
            return nodes.get(key);
        };

        for (let i = 0; i < lines.length; i++) {
            const line = String(lines[i]).trim();
            if (!line) continue;
            const parts = line.split(/\s+/);
            if (parts.length < 2 || parts.length > 3) {
                return invalid('第 ' + (i + 1) + ' 行格式應為：節點 u 節點 v [數值權重]。');
            }
            const u = parts[0], v = parts[1];
            let w = null;
            if (parts.length === 3 && Number.isFinite(Number(parts[2]))) {
                w = parts[2];
                hasWeights = true;
            } else if (parts.length === 3) {
                return invalid('第 ' + (i + 1) + ' 行的邊權重必須是有限數值。');
            }
            if (u === v) return invalid('第 ' + (i + 1) + ' 行不能是自我連結。');
            const edgeKey = JSON.stringify([u, v].sort());
            if (seenEdges.has(edgeKey)) {
                const previousWeight = seenEdges.get(edgeKey);
                const sameWeight = previousWeight === null
                    ? w === null
                    : w !== null && Number(previousWeight) === Number(w);
                if (!sameWeight) {
                    return invalid('重複邊的權重不一致，請保留一筆明確的邊資料。');
                }
                continue;
            }
            const newNodeCount = Number(!nodes.has(u)) + Number(!nodes.has(v));
            if (nodes.size + newNodeCount > MAX_TREE_NODES) {
                return invalid('樹的節點不可超過 ' + MAX_TREE_NODES + ' 個。');
            }
            seenEdges.set(edgeKey, w);
            if (!getNode(u) || !getNode(v)) {
                return invalid('樹的節點不可超過 ' + MAX_TREE_NODES + ' 個。');
            }
            edges.push({ u, v, w });
        }

        if (edges.length === 0) {
            return invalid('至少需要一條有效的邊。');
        }

        // Build adjacency list
        const adj = new Map();
        for (const [key] of nodes) adj.set(key, []);
        for (const { u, v, w } of edges) {
            adj.get(u).push({ to: v, weight: w });
            adj.get(v).push({ to: u, weight: w });
        }

        // BFS from first node to build tree
        const rootVal = edges[0].u;
        const root = nodes.get(rootVal);
        const visited = new Set([rootVal]);
        const queue = [rootVal];

        let queueIndex = 0;
        while (queueIndex < queue.length) {
            const cur = queue[queueIndex++];
            const curNode = nodes.get(cur);
            for (const { to, weight } of adj.get(cur)) {
                if (visited.has(to)) continue;
                visited.add(to);
                const childNode = nodes.get(to);
                childNode.parent = curNode;
                if (weight !== null) childNode.meta.edgeWeight = weight;
                curNode.children.push(childNode);
                queue.push(to);
            }
        }

        const disconnected = nodes.size - visited.size;
        if (disconnected > 0) {
            return invalid('有 ' + disconnected + ' 個節點無法到達。');
        }
        if (edges.length !== nodes.size - 1) {
            return invalid('邊列表包含循環，無法形成樹。');
        }
        return { root, nodes, error: null, hasWeights, format: 'edge' };
    }

    /**
     * Compute Euler-tour timestamps (tin / tout) for an already-built tree.
     * @param {Object} root
     * @returns {number[]} euler tour order
     */
    static computeEulerTour(root) {
        if (!root) return [];
        let timer = 1;
        const tour = [];
        const dfs = (node) => {
            if (!node) return;
            node.meta.tin = timer++;
            tour.push(node.value);
            for (const child of node.children.filter(c => c != null)) {
                dfs(child);
            }
            node.meta.tout = timer++;
        };
        dfs(root);
        return tour;
    }

    /**
     * Build a BST from a list of values.
     */
    static buildBST(values) {
        if (values.length === 0) return null;
        if (!hasOnlyFiniteNumericValues(values)) {
            return { error: 'Tree values must be finite numbers.' };
        }

        const createNode = (val) => ({ value: val, children: [], parent: null, x: 0, y: 0, meta: {} });
        const root = createNode(values[0]);

        const insert = (root, val) => {
            const node = createNode(val);
            let cur = root;
            while (true) {
                const numVal = Number(val);
                const numCur = Number(cur.value);
                const goLeft = numVal < numCur;
                const idx = goLeft ? 0 : 1;
                // Ensure children array has slots
                if (!cur.children[0]) cur.children[0] = null;
                if (!cur.children[1]) cur.children[1] = null;

                if (!cur.children[idx]) {
                    cur.children[idx] = node;
                    node.parent = cur;
                    return;
                }
                cur = cur.children[idx];
            }
        };

        for (let i = 1; i < values.length; i++) {
            insert(root, values[i]);
        }

        return { root, nodes: null };
    }

    /**
     * Build an AVL tree from a list of values.
     */
    static buildAVL(values) {
        if (values.length === 0) return null;
        if (!hasOnlyFiniteNumericValues(values)) {
            return { error: 'Tree values must be finite numbers.' };
        }

        const createNode = (val) => ({
            value: val, children: [null, null], parent: null,
            x: 0, y: 0, meta: { height: 1, bf: 0 }
        });

        const height = (n) => n ? n.meta.height : 0;
        const updateHeight = (n) => {
            n.meta.height = 1 + Math.max(height(n.children[0]), height(n.children[1]));
            n.meta.bf = height(n.children[0]) - height(n.children[1]);
        };

        const rotateRight = (y) => {
            const x = y.children[0];
            y.children[0] = x.children[1];
            if (x.children[1]) x.children[1].parent = y;
            x.children[1] = y;
            x.parent = y.parent;
            y.parent = x;
            updateHeight(y);
            updateHeight(x);
            return x;
        };

        const rotateLeft = (x) => {
            const y = x.children[1];
            x.children[1] = y.children[0];
            if (y.children[0]) y.children[0].parent = x;
            y.children[0] = x;
            y.parent = x.parent;
            x.parent = y;
            updateHeight(x);
            updateHeight(y);
            return y;
        };

        const insert = (node, val) => {
            if (!node) return createNode(val);
            const numVal = Number(val);
            const numNode = Number(node.value);
            if (numVal < numNode) {
                node.children[0] = insert(node.children[0], val);
                node.children[0].parent = node;
            } else {
                node.children[1] = insert(node.children[1], val);
                node.children[1].parent = node;
            }
            updateHeight(node);
            const bf = node.meta.bf;
            if (bf > 1) {
                const left = node.children[0];
                if (height(left.children[0]) >= height(left.children[1])) return rotateRight(node);
                node.children[0] = rotateLeft(left);
                return rotateRight(node);
            }
            if (bf < -1) {
                const right = node.children[1];
                if (height(right.children[1]) >= height(right.children[0])) return rotateLeft(node);
                node.children[1] = rotateRight(right);
                return rotateLeft(node);
            }
            return node;
        };

        let root = null;
        for (const v of values) {
            root = insert(root, v);
            root.parent = null;
        }

        return { root, nodes: null };
    }

    /**
     * Build a Red-Black tree from a list of values.
     */
    static buildRBTree(values) {
        if (values.length === 0) return null;
        if (!hasOnlyFiniteNumericValues(values)) {
            return { error: 'Tree values must be finite numbers.' };
        }

        const RED = 'red', BLACK = 'black';
        const NIL = { value: null, children: [null, null], parent: null, meta: { color: BLACK } };

        const createNode = (val) => ({
            value: val, children: [NIL, NIL], parent: null,
            x: 0, y: 0, meta: { color: RED }
        });

        let root = NIL;

        const rotateLeft = (x) => {
            const y = x.children[1];
            x.children[1] = y.children[0];
            if (y.children[0] !== NIL) y.children[0].parent = x;
            y.parent = x.parent;
            if (x.parent === null) root = y;
            else if (x === x.parent.children[0]) x.parent.children[0] = y;
            else x.parent.children[1] = y;
            y.children[0] = x;
            x.parent = y;
        };

        const rotateRight = (y) => {
            const x = y.children[0];
            y.children[0] = x.children[1];
            if (x.children[1] !== NIL) x.children[1].parent = y;
            x.parent = y.parent;
            if (y.parent === null) root = x;
            else if (y === y.parent.children[0]) y.parent.children[0] = x;
            else y.parent.children[1] = x;
            x.children[1] = y;
            y.parent = x;
        };

        const fixInsert = (z) => {
            while (z.parent && z.parent.meta.color === RED) {
                if (z.parent === z.parent.parent?.children[0]) {
                    const y = z.parent.parent.children[1];
                    if (y && y.meta.color === RED) {
                        z.parent.meta.color = BLACK;
                        y.meta.color = BLACK;
                        z.parent.parent.meta.color = RED;
                        z = z.parent.parent;
                    } else {
                        if (z === z.parent.children[1]) {
                            z = z.parent;
                            rotateLeft(z);
                        }
                        z.parent.meta.color = BLACK;
                        if (z.parent.parent) {
                            z.parent.parent.meta.color = RED;
                            rotateRight(z.parent.parent);
                        }
                    }
                } else {
                    const y = z.parent.parent?.children[0];
                    if (y && y.meta.color === RED) {
                        z.parent.meta.color = BLACK;
                        y.meta.color = BLACK;
                        z.parent.parent.meta.color = RED;
                        z = z.parent.parent;
                    } else {
                        if (z === z.parent.children[0]) {
                            z = z.parent;
                            rotateRight(z);
                        }
                        z.parent.meta.color = BLACK;
                        if (z.parent.parent) {
                            z.parent.parent.meta.color = RED;
                            rotateLeft(z.parent.parent);
                        }
                    }
                }
            }
            root.meta.color = BLACK;
        };

        const insert = (val) => {
            const z = createNode(val);
            let y = null, x = root;
            while (x !== NIL && x !== null) {
                y = x;
                x = Number(val) < Number(x.value) ? x.children[0] : x.children[1];
            }
            z.parent = y;
            if (!y) root = z;
            else if (Number(val) < Number(y.value)) y.children[0] = z;
            else y.children[1] = z;
            z.children[0] = NIL;
            z.children[1] = NIL;
            z.meta.color = RED;
            fixInsert(z);
        };

        for (const v of values) insert(v);

        // Clean up NIL nodes for rendering — replace NIL references with null
        const cleanNil = (node) => {
            if (!node || node === NIL) return null;
            node.children[0] = cleanNil(node.children[0]);
            node.children[1] = cleanNil(node.children[1]);
            return node;
        };
        cleanNil(root);

        return { root: root === NIL ? null : root, nodes: null };
    }
}
