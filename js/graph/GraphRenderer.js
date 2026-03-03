/**
 * GraphRenderer — draws graph nodes and edges on canvas.
 */
export class GraphRenderer {
    /**
     * Draw the entire graph.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Map<string, {id, x, y, label}>} nodes
     * @param {Array<{u, v, w?, directed}>} edges
     * @param {Object} opts - { nodeRadius, color, offsetX, offsetY, opacity, directed }
     */
    static draw(ctx, nodes, edges, opts = {}) {
        const r = opts.nodeRadius || 20;
        const color = opts.color || '#e0e0e0';
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const opacity = opts.opacity ?? 1;
        const directed = opts.directed || false;

        ctx.globalAlpha = opacity;

        // Draw edges
        for (const e of edges) {
            const u = nodes.get(e.u);
            const v = nodes.get(e.v);
            if (!u || !v) continue;

            const x1 = u.x + ox, y1 = u.y + oy;
            const x2 = v.x + ox, y2 = v.y + oy;

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = opacity * 0.5;
            ctx.beginPath();

            if (e.directed || directed) {
                // Draw line stopping at node radius
                const angle = Math.atan2(y2 - y1, x2 - x1);
                const endX = x2 - r * Math.cos(angle);
                const endY = y2 - r * Math.sin(angle);
                const startX = x1 + r * Math.cos(angle);
                const startY = y1 + r * Math.sin(angle);

                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                // Arrowhead
                const headLen = 10;
                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(endX - headLen * Math.cos(angle - 0.35), endY - headLen * Math.sin(angle - 0.35));
                ctx.moveTo(endX, endY);
                ctx.lineTo(endX - headLen * Math.cos(angle + 0.35), endY - headLen * Math.sin(angle + 0.35));
                ctx.stroke();
            } else {
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // Edge weight label
            if (e.w !== null && e.w !== undefined) {
                ctx.globalAlpha = opacity * 0.7;
                ctx.fillStyle = '#aaa';
                ctx.font = '11px Consolas, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2 - 4;
                ctx.fillText(String(e.w), mx, my);
            }
            ctx.globalAlpha = opacity;
        }

        // Draw nodes
        for (const [id, node] of nodes) {
            const nx = node.x + ox;
            const ny = node.y + oy;

            // Circle
            ctx.beginPath();
            ctx.arc(nx, ny, r, 0, Math.PI * 2);
            ctx.fillStyle = '#2d2d2d';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label
            ctx.fillStyle = color;
            ctx.font = '13px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.label || id, nx, ny, r * 2 - 4);
        }

        ctx.globalAlpha = 1;
    }

    /**
     * Hit test graph nodes.
     * @returns {Object|null} The node hit at (wx, wy).
     */
    static hitTestNode(nodes, wx, wy, opts = {}) {
        const r = opts.nodeRadius || 20;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;

        for (const [id, node] of nodes) {
            const dist = Math.hypot(wx - (node.x + ox), wy - (node.y + oy));
            if (dist <= r) return node;
        }
        return null;
    }

    /**
     * Hit test graph edges.
     * @returns {Object|null} The edge hit at (wx, wy).
     */
    static hitTestEdge(nodes, edges, wx, wy, opts = {}) {
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const tol = opts.tolerance || 6;

        for (const e of edges) {
            const u = nodes.get(e.u);
            const v = nodes.get(e.v);
            if (!u || !v) continue;
            const dist = _ptSegDist(wx, wy, u.x + ox, u.y + oy, v.x + ox, v.y + oy);
            if (dist < tol) return e;
        }
        return null;
    }
}

function _ptSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
