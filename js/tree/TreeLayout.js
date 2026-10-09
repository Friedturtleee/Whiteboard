export class TreeLayout {
    static layout(root, options = {}) {
        if (!root) return;
        const nodeRadius = Math.max(1, options.nodeRadius || 18);
        const minimumSpacing = nodeRadius * 2 + 8;
        const spacingX = Math.max(options.nodeSpacingX || 40, minimumSpacing);
        const spacingY = Math.max(options.levelSpacingY || 60, minimumSpacing);
        const startX = options.startX || 0;
        const startY = options.startY || 0;

        // Assign horizontal space to leaves, then center each parent over its
        // child span. Unlike a plain in-order index, this keeps unary chains
        // vertical and avoids reserving a full column for every node.
        let leafX = startX;
        const visited = new Set();
        function postOrder(node, depth) {
            if (!node || node.value === null || visited.has(node)) return;
            visited.add(node);
            const children = (node.children || []).filter(child =>
                child && child.value !== null
            );
            for (const child of children) postOrder(child, depth + 1);

            if (children.length) {
                node.x = (children[0].x + children[children.length - 1].x) / 2;
            } else {
                node.x = leafX;
                leafX += spacingX;
            }
            node.y = startY + depth * spacingY;
        }
        postOrder(root, 0);
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
