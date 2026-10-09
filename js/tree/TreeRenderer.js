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
        const stack = node ? [{ node, childIndex: 0, entered: false }] : [];
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const current = frame.node;
            if (!frame.entered) {
                if (!current || current.value === null || visited.has(current)) {
                    stack.pop();
                    continue;
                }
                visited.add(current);
                frame.entered = true;
            }
            const children = current.children || [];
            if (frame.childIndex >= children.length) {
                stack.pop();
                continue;
            }
            const child = children[frame.childIndex++];
            if (!child || child.value === null) continue;

            const x1 = current.x + ox, y1 = current.y + oy + r;
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

            // Draw edge weights as text, keeping the canvas transparent and uncluttered.
            if (hasWeights) {
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                ctx.font = '11px Consolas, monospace';
                const rawWeight = child.meta?.edgeWeight;
                const hasWeight = rawWeight != null && String(rawWeight).trim() !== '';
                const label = hasWeight ? String(rawWeight) : '?';
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (typeof ctx.strokeText === 'function') {
                    ctx.strokeStyle = 'rgba(25, 25, 25, 0.95)';
                    ctx.lineWidth = 3;
                    ctx.strokeText(label, mx, my);
                }
                ctx.fillStyle = hasWeight ? '#f0c040' : 'rgba(240, 192, 64, 0.42)';
                ctx.fillText(label, mx, my);
                ctx.restore();
            }

            stack.push({ node: child, childIndex: 0, entered: false });
        }
    }

    static _drawNodes(ctx, node, r, color, treeType, ox, oy, visited = new Set()) {
        const stack = node ? [node] : [];
        while (stack.length) {
            const current = stack.pop();
            if (!current || current.value === null || visited.has(current)) continue;
            visited.add(current);
            const nx = current.x + ox;
            const ny = current.y + oy;

            // Node fill based on tree type
            let fillColor = '#2d2d2d';
            let strokeColor = color;

            if (treeType === 'rb' || treeType === 'red-black') {
                if (current.meta && current.meta.color === 'red') {
                    fillColor = 'hsl(0, 45%, 35%)';
                    strokeColor = 'hsl(0, 50%, 50%)';
                } else {
                    fillColor = '#1a1a1a';
                    strokeColor = '#888';
                }
            }

            // Selected state highlight
            const isSelected = current.meta && current.meta.selected;

            // A subtle halo makes the root easy to find in a dense tree.
            if (!current.parent) {
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
            ctx.fillText(String(current.value), nx, ny, r * 2 - 4);

            // AVL balance factor
            if (treeType === 'avl' && current.meta && current.meta.bf !== undefined) {
                ctx.fillStyle = '#888';
                ctx.font = '9px sans-serif';
                ctx.fillText(`bf:${current.meta.bf}`, nx, ny - r - 8);
            }

            // Euler tour timestamps
            if (treeType === 'euler' && current.meta && current.meta.tin !== undefined) {
                ctx.fillStyle = '#6ec6ff';
                ctx.font = '10px Consolas, monospace';
                ctx.textAlign = 'left';
                ctx.fillText(`in:${current.meta.tin}`, nx + r + 3, ny - 5);
                ctx.fillStyle = '#ff8a65';
                ctx.fillText(`out:${current.meta.tout}`, nx + r + 3, ny + 9);
                ctx.textAlign = 'center';
            }

            const children = current.children || [];
            for (let index = children.length - 1; index >= 0; index--) {
                if (children[index]) stack.push(children[index]);
            }
        }
    }

    /**
     * Hit test a tree: returns the node at (wx, wy) or null.
     */
    static hitTestNode(root, wx, wy, opts = {}, visited = new Set()) {
        const r = opts.nodeRadius || 18;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        if (r < 0) return null;
        const radiusSquared = r * r;
        const stack = root ? [root] : [];
        while (stack.length) {
            const node = stack.pop();
            if (!node || node.value === null || visited.has(node)) continue;
            visited.add(node);
            const dx = wx - (node.x + ox);
            const dy = wy - (node.y + oy);
            if (dx * dx + dy * dy <= radiusSquared) return node;
            const children = node.children || [];
            for (let index = children.length - 1; index >= 0; index--) {
                if (children[index]) stack.push(children[index]);
            }
        }
        return null;
    }

    /**
     * Hit test tree edges — returns true if (wx, wy) is near any edge.
     */
    static hitTestEdge(root, wx, wy, opts = {}, visited = new Set()) {
        const r = opts.nodeRadius || 18;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const tol = opts.tolerance || 12;
        if (tol < 0) return false;
        const tolSquared = tol * tol;
        if (!root || root.value === null || visited.has(root)) return false;
        visited.add(root);
        const stack = [{ node: root, childIndex: 0 }];
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const children = frame.node.children || [];
            if (frame.childIndex >= children.length) {
                stack.pop();
                continue;
            }
            const child = children[frame.childIndex++];
            if (!child || child.value === null) continue;
            const x1 = frame.node.x + ox, y1 = frame.node.y + oy + r;
            const x2 = child.x + ox, y2 = child.y + oy - r;
            if (_treePtSegDistSquared(wx, wy, x1, y1, x2, y2) < tolSquared) return true;
            if (!visited.has(child)) {
                visited.add(child);
                stack.push({ node: child, childIndex: 0 });
            }
        }
        return false;
    }

    /** Return the child node whose incoming edge is closest to the point. */
    static hitTestEdgeNode(root, wx, wy, opts = {}) {
        const best = { node: null, distanceSquared: Infinity };
        _findTreeEdgeNode(root, wx, wy, opts, new Set(), best);
        return best.node;
    }
}

function _findTreeEdgeNode(node, wx, wy, opts, visited, best) {
    const r = opts.nodeRadius || 18;
    const ox = opts.offsetX || 0;
    const oy = opts.offsetY || 0;
    const tol = opts.tolerance || 12;
    if (tol < 0) return;
    const tolSquared = tol * tol;

    if (!node || node.value === null || visited.has(node)) return;
    visited.add(node);
    const stack = [{ node, childIndex: 0 }];
    while (stack.length) {
        const frame = stack[stack.length - 1];
        const children = frame.node.children || [];
        if (frame.childIndex >= children.length) {
            stack.pop();
            continue;
        }
        const child = children[frame.childIndex++];
        if (!child || child.value === null) continue;
        const x1 = frame.node.x + ox, y1 = frame.node.y + oy + r;
        const x2 = child.x + ox, y2 = child.y + oy - r;
        const distanceSquared = _treePtSegDistSquared(wx, wy, x1, y1, x2, y2);
        if (distanceSquared <= tolSquared && distanceSquared < best.distanceSquared) {
            best.node = child;
            best.distanceSquared = distanceSquared;
        }
        if (!visited.has(child)) {
            visited.add(child);
            stack.push({ node: child, childIndex: 0 });
        }
    }
}

function _treePtSegDistSquared(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        const dx = px - x1;
        const dy = py - y1;
        return dx * dx + dy * dy;
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const offsetX = px - (x1 + t * dx);
    const offsetY = py - (y1 + t * dy);
    return offsetX * offsetX + offsetY * offsetY;
}
