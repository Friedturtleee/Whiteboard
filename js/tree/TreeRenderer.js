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

    static _drawEdges(ctx, node, r, color, ox, oy, hasWeights, visited = new Set()) {
        if (!node || node.value === null || visited.has(node)) return;
        visited.add(node);
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
                ctx.font = '11px Consolas, monospace';
                const label = String(child.meta.edgeWeight);
                const labelX = mx + 10;
                const labelWidth = ctx.measureText(label).width + 8;
                ctx.save();
                ctx.fillStyle = 'rgba(30, 30, 30, 0.92)';
                ctx.fillRect(labelX - labelWidth / 2, my - 9, labelWidth, 18);
                ctx.strokeStyle = '#f0c040';
                ctx.lineWidth = 1;
                ctx.strokeRect(labelX - labelWidth / 2, my - 9, labelWidth, 18);
                ctx.fillStyle = '#f0c040';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, labelX, my);
                ctx.restore();
            }

            TreeRenderer._drawEdges(ctx, child, r, color, ox, oy, hasWeights, visited);
        }
    }

    static _drawNodes(ctx, node, r, color, treeType, ox, oy, visited = new Set()) {
        if (!node || node.value === null || visited.has(node)) return;
        visited.add(node);
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

        // A subtle halo makes the root easy to find in a dense tree.
        if (!node.parent) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(nx, ny, r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.35;
            ctx.stroke();
            ctx.restore();
        }

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
            TreeRenderer._drawNodes(ctx, child, r, color, treeType, ox, oy, visited);
        }
    }

    /**
     * Hit test a tree: returns the node at (wx, wy) or null.
     */
    static hitTestNode(root, wx, wy, opts = {}, visited = new Set()) {
        if (!root || root.value === null || visited.has(root)) return null;
        visited.add(root);
        const r = opts.nodeRadius || 18;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;

        // Check current node
        const dist = Math.hypot(wx - (root.x + ox), wy - (root.y + oy));
        if (dist <= r) return root;

        // Check children
        const children = (root.children || []).filter(c => c != null);
        for (const child of children) {
            const hit = TreeRenderer.hitTestNode(child, wx, wy, opts, visited);
            if (hit) return hit;
        }
        return null;
    }

    /**
     * Hit test tree edges — returns true if (wx, wy) is near any edge.
     */
    static hitTestEdge(root, wx, wy, opts = {}, visited = new Set()) {
        if (!root || root.value === null || visited.has(root)) return false;
        visited.add(root);
        const r = opts.nodeRadius || 18;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const tol = opts.tolerance || 12;

        const children = (root.children || []).filter(c => c != null);
        for (const child of children) {
            const x1 = root.x + ox, y1 = root.y + oy + r;
            const x2 = child.x + ox, y2 = child.y + oy - r;
            if (_treePtSegDist(wx, wy, x1, y1, x2, y2) < tol) return true;
            if (TreeRenderer.hitTestEdge(child, wx, wy, opts, visited)) return true;
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
