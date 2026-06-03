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
export class TreeParser {
    /**
     * Auto-detect input format and parse accordingly.
     * @param {string} text
     * @param {string} treeType - 'tree' | 'bst' | 'avl' | 'rb' | 'euler'
     * @returns {{ root, nodes, error, hasWeights, format }}
     */
    static autoDetectAndParse(text, treeType = 'tree') {
        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
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
        const n = parseInt(lines[0]);
        if (isNaN(n) || n <= 0) {
            return { root: null, nodes: new Map(), error: '第一行應為節點數 n', hasWeights: false };
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

        // Parse n-1 directed edges: parent → child [child_node_weight]
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length < 2) continue;
            const parentKey = parts[0];
            const childKey = parts[1];
            const weight = parts.length >= 3 ? parts[2] : null;

            const parentNode = getNode(parentKey);
            const childNode = getNode(childKey);

            if (weight !== null) {
                childNode.meta.nodeWeight = weight;
                hasWeights = true;
            }

            childNode.parent = parentNode;
            parentNode.children.push(childNode);
        }

        // Find root: first node with no parent
        let root = null;
        for (const [, node] of nodes) {
            if (!node.parent) { root = node; break; }
        }

        if (!root) {
            // Fallback: node '1'
            root = nodes.get('1') || null;
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
        const parents = lines.map(l => parseInt(l));
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

        return { root, nodes, error: errors.length ? errors.join('\n') : null, format: 'parent', hasWeights: false };
    }

    /**
     * Parse edge-list format.  Each line: u v [w]
     * Auto-detects edge weights.
     * @param {string[]} lines - pre-split, trimmed, non-empty lines
     */
    static parseEdgeFormat(lines) {
        const nodes = new Map();
        const edges = [];
        let hasWeights = false;

        const getNode = (val) => {
            const key = String(val);
            if (!nodes.has(key)) {
                nodes.set(key, { value: key, children: [], parent: null, x: 0, y: 0, meta: {} });
            }
            return nodes.get(key);
        };

        for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length < 2) continue;
            const u = parts[0], v = parts[1];
            let w = null;
            if (parts.length >= 3 && !isNaN(parseFloat(parts[2]))) {
                w = parts[2];
                hasWeights = true;
            }
            getNode(u);
            getNode(v);
            edges.push({ u, v, w });
        }

        if (edges.length === 0) {
            return { root: null, nodes, error: '沒有有效的邊', hasWeights, format: 'edge' };
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

        while (queue.length > 0) {
            const cur = queue.shift();
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
        const error = disconnected > 0 ? `有 ${disconnected} 個節點無法到達` : null;
        return { root, nodes, error, hasWeights, format: 'edge' };
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

        const createNode = (val) => ({ value: val, children: [], parent: null, x: 0, y: 0, meta: {} });
        const root = createNode(values[0]);

        const insert = (root, val) => {
            const node = createNode(val);
            let cur = root;
            while (true) {
                const numVal = parseFloat(val);
                const numCur = parseFloat(cur.value);
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
            const numVal = parseFloat(val);
            const numNode = parseFloat(node.value);
            if (numVal < numNode) {
                node.children[0] = insert(node.children[0], val);
                node.children[0].parent = node;
            } else {
                node.children[1] = insert(node.children[1], val);
                node.children[1].parent = node;
            }
            updateHeight(node);
            const bf = node.meta.bf;
            // Left Left
            if (bf > 1 && parseFloat(val) < parseFloat(node.children[0].value)) return rotateRight(node);
            // Right Right
            if (bf < -1 && parseFloat(val) > parseFloat(node.children[1].value)) return rotateLeft(node);
            // Left Right
            if (bf > 1 && parseFloat(val) > parseFloat(node.children[0].value)) {
                node.children[0] = rotateLeft(node.children[0]);
                return rotateRight(node);
            }
            // Right Left
            if (bf < -1 && parseFloat(val) < parseFloat(node.children[1].value)) {
                node.children[1] = rotateRight(node.children[1]);
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
                x = parseFloat(val) < parseFloat(x.value) ? x.children[0] : x.children[1];
            }
            z.parent = y;
            if (!y) root = z;
            else if (parseFloat(val) < parseFloat(y.value)) y.children[0] = z;
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
