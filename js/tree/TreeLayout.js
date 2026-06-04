export class TreeLayout {
    static layout(root, options = {}) {
        if (!root) return;
        const spacingX = options.nodeSpacingX || 40;
        const spacingY = options.levelSpacingY || 60;
        const startX = options.startX || 0;
        const startY = options.startY || 0;

        const isBinary = root.left !== undefined || root.right !== undefined;

        if (isBinary) {
            let currentIndex = 0;
            function traverseBinary(node, depth) {
                if (!node) return;
                traverseBinary(node.left, depth + 1);
                node.x = startX + currentIndex * spacingX;
                node.y = startY + depth * spacingY;
                currentIndex++;
                traverseBinary(node.right, depth + 1);
            }
            traverseBinary(root, 0);
        } else {
            let leafX = startX;
            function postOrder(node, depth) {
                if (!node) return;
                if (node.children && node.children.length > 0) {
                    for (const child of node.children) {
                        postOrder(child, depth + 1);
                    }
                    const firstX = node.children[0].x;
                    const lastX = node.children[node.children.length - 1].x;
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

    static getBounds(root) {
        if (!root) return { x: 0, y: 0, w: 0, h: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function walk(node) {
            if (!node) return;
            if (node.x < minX) minX = node.x;
            if (node.x > maxX) maxX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.y > maxY) maxY = node.y;
            walk(node.left);
            walk(node.right);
            if (node.children) node.children.forEach(walk);
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
