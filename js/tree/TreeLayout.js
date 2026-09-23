export class TreeLayout {
    static layout(root, options = {}) {
        if (!root) return;
        const spacingX = options.nodeSpacingX || 40;
        const spacingY = options.levelSpacingY || 60;
        const startX = options.startX || 0;
        const startY = options.startY || 0;

        // Check if tree is binary (i.e. strictly 2 children slots, left and right)
        // A tree is binary if it has exactly 2 children slots, which is true for BST, AVL, RB built by TreeParser
        // But for generic parent/edge trees, children length can be any number.
        // We can just rely on post-order generic traversal, but for binary trees, in-order gives better visualization.
        // Do not infer the tree shape from the root only. A generic tree can
        // have two children at the root and three children deeper down; the
        // old check then used binary traversal and silently dropped nodes.
        const isBinary = TreeLayout._isBinaryTree(root);

        if (isBinary) {
            let currentIndex = 0;
            const visited = new Set();
            function traverseBinary(node, depth) {
                if (!node || node.value === null || visited.has(node)) return; // Ignore NIL/cycles.
                visited.add(node);
                const children = node.children || [];
                traverseBinary(children[0], depth + 1);
                node.x = startX + currentIndex * spacingX;
                node.y = startY + depth * spacingY;
                currentIndex++;
                traverseBinary(children[1], depth + 1);
            }
            traverseBinary(root, 0);
        } else {
            let leafX = startX;
            const visited = new Set();
            function postOrder(node, depth) {
                if (!node || node.value === null || visited.has(node)) return;
                visited.add(node);
                
                const validChildren = (node.children || []).filter(c => c && c.value !== null);
                if (validChildren.length > 0) {
                    for (const child of validChildren) {
                        postOrder(child, depth + 1);
                    }
                    const firstX = validChildren[0].x;
                    const lastX = validChildren[validChildren.length - 1].x;
                    node.x = (firstX + lastX) / 2;
                } else {
                    node.x = leafX;
                    leafX += spacingX;
                }
                node.y = startY + depth * spacingY;
            }
            postOrder(root, 0);
        }
    }

    static _isBinaryTree(root) {
        const visited = new Set();
        const visit = (node) => {
            if (!node || node.value === null) return true;
            if (visited.has(node)) return false;
            visited.add(node);

            const children = (node.children || []).filter(child =>
                child && child.value !== null
            );
            if (children.length > 2) return false;
            return children.every(visit);
        };
        return visit(root);
    }

    static getBounds(root) {
        if (!root || root.value === null) return { x: 0, y: 0, w: 0, h: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const visited = new Set();
        function walk(node) {
            if (!node || node.value === null || visited.has(node)) return;
            visited.add(node);
            if (node.x < minX) minX = node.x;
            if (node.x > maxX) maxX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.y > maxY) maxY = node.y;
            if (node.children) {
                for (const child of node.children) {
                    walk(child);
                }
            }
        }
        walk(root);
        if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
        return {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY
        };
    }
}
