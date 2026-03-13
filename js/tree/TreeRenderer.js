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
        const treeType = opts.treeType || 'tree';
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const opacity = opts.opacity ?? 1;
        const hasWeights = opts.hasWeights || false;

        ctx.globalAlpha = opacity;

        // Draw edges first (behind nodes)
        TreeRenderer._drawEdges(ctx, root, r, color, ox, oy, hasWeights);

        // Draw nodes
        TreeRenderer._drawNodes(ctx, root, r, color, treeType, ox, oy);

        ctx.globalAlpha = 1;
    }

    static _drawEdges(ctx, node, r, color, ox, oy, hasWeights) {
        if (!node) return;
        const children = (node.children || []).filter(c => c != null);
        for (const child of children) {
            const x1 = node.x + ox, y1 = node.y + oy + r;
            const x2 = child.x + ox, y2 = child.y + oy - r;

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            const savedAlpha = ctx.globalAlpha;
            ctx.globalAlpha = savedAlpha * 0.5;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.globalAlpha = savedAlpha;

            // Draw edge weight label
            if (hasWeights && child.meta && child.meta.edgeWeight != null) {
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                ctx.fillStyle = '#f0c040';
                ctx.font = '11px Consolas, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(child.meta.edgeWeight), mx + 10, my);
            }

            TreeRenderer._drawEdges(ctx, child, r, color, ox, oy, hasWeights);
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

        // Selected state highlight
        const isSelected = node.meta && node.meta.selected;

        // Circle
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'hsl(210, 50%, 30%)' : fillColor;
        ctx.fill();
        ctx.strokeStyle = isSelected ? 'hsl(210, 80%, 60%)' : strokeColor;
        ctx.lineWidth = isSelected ? 3 : 2;
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

        // Euler tour timestamps
        if (treeType === 'euler' && node.meta && node.meta.tin !== undefined) {
            ctx.fillStyle = '#6ec6ff';
            ctx.font = '10px Consolas, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`in:${node.meta.tin}`, nx + r + 3, ny - 5);
            ctx.fillStyle = '#ff8a65';
            ctx.fillText(`out:${node.meta.tout}`, nx + r + 3, ny + 9);
            ctx.textAlign = 'center';
        }

        // Node weight (shown below circle)
        if (node.meta && node.meta.nodeWeight != null) {
            ctx.fillStyle = '#a0e0ff';
            ctx.font = '10px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`w:${node.meta.nodeWeight}`, nx, ny + r + 3);
            ctx.textBaseline = 'middle';
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

    /**
     * Hit test tree edges — returns true if (wx, wy) is near any edge.
     */
    static hitTestEdge(root, wx, wy, opts = {}) {
        if (!root) return false;
        const r = opts.nodeRadius || 18;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const tol = opts.tolerance || 12;

        const children = (root.children || []).filter(c => c != null);
        for (const child of children) {
            const x1 = root.x + ox, y1 = root.y + oy + r;
            const x2 = child.x + ox, y2 = child.y + oy - r;
            if (_treePtSegDist(wx, wy, x1, y1, x2, y2) < tol) return true;
            if (TreeRenderer.hitTestEdge(child, wx, wy, opts)) return true;
        }
        return false;
    }
}

function _treePtSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
