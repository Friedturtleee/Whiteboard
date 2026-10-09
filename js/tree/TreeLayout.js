export class TreeLayout {
    static layout(root, options = {}) {
        if (!root || root.value === null) return;
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
        const visited = new Set([root]);
        const stack = [{
            node: root,
            depth: 0,
            nextChildIndex: 0,
            firstChild: null,
            lastChild: null
        }];

        // Iterative postorder avoids call-stack overflow for imported chains
        // and skips per-node filtered child arrays.
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const children = frame.node.children || [];
            let child = null;
            while (frame.nextChildIndex < children.length) {
                const candidate = children[frame.nextChildIndex++];
                if (candidate && candidate.value !== null) {
                    child = candidate;
                    break;
                }
            }

            if (child) {
                if (!frame.firstChild) frame.firstChild = child;
                frame.lastChild = child;
                if (!visited.has(child)) {
                    visited.add(child);
                    stack.push({
                        node: child,
                        depth: frame.depth + 1,
                        nextChildIndex: 0,
                        firstChild: null,
                        lastChild: null
                    });
                }
                continue;
            }

            if (frame.firstChild) {
                frame.node.x = (frame.firstChild.x + frame.lastChild.x) / 2;
            } else {
                frame.node.x = leafX;
                leafX += spacingX;
            }
            frame.node.y = startY + frame.depth * spacingY;
            stack.pop();
        }
    }

    static getBounds(root) {
        if (!root || root.value === null) return { x: 0, y: 0, w: 0, h: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const visited = new Set();
        const stack = [root];
        while (stack.length) {
            const node = stack.pop();
            if (!node || node.value === null || visited.has(node)) continue;
            visited.add(node);
            if (node.x < minX) minX = node.x;
            if (node.x > maxX) maxX = node.x;
            if (node.y < minY) minY = node.y;
            if (node.y > maxY) maxY = node.y;
            if (node.children) {
                for (let index = node.children.length - 1; index >= 0; index--) {
                    stack.push(node.children[index]);
                }
            }
        }
        if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
        return {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY
        };
    }
}
