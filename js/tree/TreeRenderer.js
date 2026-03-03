/**
 * TreeRenderer — draws tree nodes and edges on a canvas context.
 */
export class TreeRenderer {
    /**
     * Draw the entire tree.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} root - tree root node with x, y, children, value, meta
     * @param {Object} opts - { nodeRadius, color, treeType, offsetX, offsetY, opacity, saturation }
     */
    static draw(ctx, root, opts = {}) {
        if (!root) return;
        const r = opts.nodeRadius || 18;
        const color = opts.color || '#e0e0e0';
        const treeType = opts.treeType || 'binary';
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const opacity = opts.opacity ?? 1;

        ctx.globalAlpha = opacity;

        // Draw edges first (behind nodes)
        TreeRenderer._drawEdges(ctx, root, r, color, ox, oy);

        // Draw nodes
        TreeRenderer._drawNodes(ctx, root, r, color, treeType, ox, oy);

        ctx.globalAlpha = 1;
    }

    static _drawEdges(ctx, node, r, color, ox, oy) {
        if (!node) return;
        const children = (node.children || []).filter(c => c != null);
        for (const child of children) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.5;
            ctx.beginPath();
            ctx.moveTo(node.x + ox, node.y + oy + r);
            ctx.lineTo(child.x + ox, child.y + oy - r);
            ctx.stroke();
            ctx.globalAlpha = (ctx.globalAlpha || 1) / 0.5 || 1;
            TreeRenderer._drawEdges(ctx, child, r, color, ox, oy);
        }
    }

    static _drawNodes(ctx, node, r, color, treeType, ox, oy) {
        if (!node) return;
        const nx = node.x + ox;
        const ny = node.y + oy;

        // Node fill based on tree type
        let fillColor = '#2d2d2d';
        let strokeColor = color;

        if (treeType === 'rb' || treeType === 'red-black') {
            if (node.meta && node.meta.color === 'red') {
                fillColor = 'hsl(0, 45%, 35%)';
                strokeColor = 'hsl(0, 50%, 50%)';
            } else {
                fillColor = '#1a1a1a';
                strokeColor = '#888';
            }
        }

        // Circle
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Value text
        ctx.fillStyle = color;
        ctx.font = '13px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.value), nx, ny, r * 2 - 4);

        // AVL balance factor
        if (treeType === 'avl' && node.meta && node.meta.bf !== undefined) {
            ctx.fillStyle = '#888';
            ctx.font = '9px sans-serif';
            ctx.fillText(`bf:${node.meta.bf}`, nx, ny - r - 8);
        }

        // Recurse
        const children = (node.children || []).filter(c => c != null);
        for (const child of children) {
            TreeRenderer._drawNodes(ctx, child, r, color, treeType, ox, oy);
        }
    }

    /**
     * Hit test a tree: returns the node at (wx, wy) or null.
     */
    static hitTestNode(root, wx, wy, opts = {}) {
        if (!root) return null;
        const r = opts.nodeRadius || 18;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;

        // Check current node
        const dist = Math.hypot(wx - (root.x + ox), wy - (root.y + oy));
        if (dist <= r) return root;

        // Check children
        const children = (root.children || []).filter(c => c != null);
        for (const child of children) {
            const hit = TreeRenderer.hitTestNode(child, wx, wy, opts);
            if (hit) return hit;
        }
        return null;
    }
}
