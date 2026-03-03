/**
 * TreeParser — parses text input into a tree structure.
 *
 * Format 1 (parent spec):
 *   N
 *   nodeValue parentValue
 *   ...
 *   (root has parentValue = -1 or 0 or is the unmentioned parent)
 *
 * Format 2 (value list → auto-build BST/AVL/RBTree):
 *   val1 val2 val3 ...
 */
export class TreeParser {
    /**
     * Parse parent-format text.
     * Returns: { root, nodes: Map<value, { value, children: [], parent, x, y, meta }> }
     */
    static parseParentFormat(text) {
        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return null;

        const n = parseInt(lines[0]);
        if (isNaN(n)) return null;

        const nodes = new Map();
        const childSet = new Set();

        // Helper to get or create node
        const getNode = (val) => {
            if (!nodes.has(val)) {
                nodes.set(val, { value: val, children: [], parent: null, x: 0, y: 0, meta: {} });
            }
            return nodes.get(val);
        };

        for (let i = 1; i < lines.length && i <= n; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length < 2) continue;
            const nodeVal = parts[0];
            const parentVal = parts[1];

            const node = getNode(nodeVal);
            childSet.add(nodeVal);

            if (parentVal === '-1' || parentVal === 'null' || parentVal === 'NULL') {
                node.parent = null;  // this is root
            } else {
                const parentNode = getNode(parentVal);
                node.parent = parentNode;
                parentNode.children.push(node);
            }
        }

        // Find root: node not in childSet, or parentVal = -1
        let root = null;
        for (const [val, node] of nodes) {
            if (node.parent === null) {
                root = node;
                break;
            }
        }
        // Fallback: first node not appearing as child
        if (!root) {
            for (const [val, node] of nodes) {
                if (!childSet.has(val) || node.parent === null) {
                    root = node;
                    break;
                }
            }
        }
        if (!root && nodes.size > 0) {
            root = nodes.values().next().value;
        }

        return { root, nodes };
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
