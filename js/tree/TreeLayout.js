/**
 * TreeLayout — Reingold-Tilford style tree layout algorithm.
 * Assigns (x, y) positions to each node for aesthetically pleasing display.
 */
export class TreeLayout {
    /**
     * Layout a tree rooted at `root`.
     * @param {Object} root - { value, children: [left, right] | [...], x, y, meta }
     * @param {Object} opts - { nodeSpacingX: 50, levelSpacingY: 70, startX: 0, startY: 0 }
     */
    static layout(root, opts = {}) {
        if (!root) return;
        const spacingX = opts.nodeSpacingX || 50;
        const spacingY = opts.levelSpacingY || 70;
        const startX = opts.startX || 0;
        const startY = opts.startY || 0;

        // Phase 1: assign preliminary x via post-order traversal
        TreeLayout._firstWalk(root, spacingX);

        // Phase 2: compute final x with accumulated modifiers
        TreeLayout._secondWalk(root, 0);

        // Phase 3: normalize — shift all x so minimum is startX
        let minX = Infinity;
        TreeLayout._traverse(root, (n) => { if (n.x < minX) minX = n.x; });
        const shiftX = startX - minX;

        // Phase 4: assign y based on depth, apply shift
        TreeLayout._assignY(root, startY, spacingY, shiftX);
    }

    static _firstWalk(node, spacing) {
        if (!node) return;
        const children = (node.children || []).filter(c => c != null);

        if (children.length === 0) {
            // Leaf
            node._prelim = 0;
            node._mod = 0;
            return;
        }

        for (const child of children) {
            TreeLayout._firstWalk(child, spacing);
        }

        if (children.length === 1) {
            node._prelim = children[0]._prelim;
            node._mod = 0;
        } else {
            // Place node at midpoint of children
            const first = children[0];
            const last = children[children.length - 1];

            // Separate subtrees
            for (let i = 1; i < children.length; i++) {
                TreeLayout._separateSubtrees(children, i, spacing);
            }

            const mid = (first._prelim + last._prelim) / 2;
            node._prelim = mid;
            node._mod = 0;
        }
    }

    static _separateSubtrees(children, i, spacing) {
        // Get right contour of left sibling and left contour of current
        const left = children[i - 1];
        const right = children[i];

        let shift = 0;
        let lRight = left;
        let rLeft = right;
        let lOffset = left._prelim;
        let rOffset = right._prelim;
        let depth = 0;

        while (lRight && rLeft) {
            const gap = (lOffset + spacing) - rOffset;
            if (gap > shift) shift = gap;

            // Descend
            const lrChildren = (lRight.children || []).filter(c => c != null);
            const rlChildren = (rLeft.children || []).filter(c => c != null);

            lRight = lrChildren.length > 0 ? lrChildren[lrChildren.length - 1] : null;
            rLeft = rlChildren.length > 0 ? rlChildren[0] : null;

            if (lRight) lOffset += lRight._prelim;
            if (rLeft) rOffset += rLeft._prelim;
            depth++;
        }

        if (shift > 0) {
            right._prelim += shift;
            right._mod += shift;
            // Distribute shift among intermediate siblings
            if (i > 1) {
                const portion = shift / i;
                for (let j = 1; j < i; j++) {
                    children[j]._prelim += portion * j;
                    children[j]._mod += portion * j;
                }
            }
        }
    }

    static _secondWalk(node, modSum) {
        if (!node) return;
        node.x = node._prelim + modSum;
        const children = (node.children || []).filter(c => c != null);
        for (const child of children) {
            TreeLayout._secondWalk(child, modSum + (node._mod || 0));
        }
    }

    static _assignY(node, y, spacingY, shiftX) {
        if (!node) return;
        node.x += shiftX;
        node.y = y;
        const children = (node.children || []).filter(c => c != null);
        for (const child of children) {
            TreeLayout._assignY(child, y + spacingY, spacingY, shiftX);
        }
    }

    static _traverse(node, fn) {
        if (!node) return;
        fn(node);
        const children = (node.children || []).filter(c => c != null);
        for (const child of children) {
            TreeLayout._traverse(child, fn);
        }
    }

    /** Get total count of nodes */
    static countNodes(root) {
        let count = 0;
        TreeLayout._traverse(root, () => count++);
        return count;
    }

    /** Get bounding box of laid out tree */
    static getBounds(root) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        TreeLayout._traverse(root, (n) => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x);
            maxY = Math.max(maxY, n.y);
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
}
