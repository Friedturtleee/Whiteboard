/**
 * GraphRenderer — draws graph nodes and edges on canvas.
 */
export class GraphRenderer {
    /**
     * Draw the entire graph.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Map<string, {id, x, y, label, nodeWeight}>} nodes
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

        // Build a set of directed pairs for bidirectional detection
        const edgeSet = new Set(edges.map(e => `${e.u}->${e.v}`));

        ctx.globalAlpha = opacity;

        // Draw edges
        for (const e of edges) {
            const u = nodes.get(e.u);
            const v = nodes.get(e.v);
            if (!u || !v) continue;

            const edgeColor = e.selected ? 'hsl(210, 80%, 60%)' : color;
            const edgeAlpha = e.selected ? opacity * 0.9 : opacity * 0.5;
            const edgeWidth = e.selected ? 2.5 : 1.5;

            ctx.strokeStyle = edgeColor;
            ctx.lineWidth = edgeWidth;
            ctx.globalAlpha = edgeAlpha;

            const isDirected = e.directed || directed;

            // ── Self-loop ────────────────────────────────────────────
            if (e.u === e.v) {
                const nx = u.x + ox, ny = u.y + oy;
                const loopR = r * 0.75;
                // Draw the loop as a circle sitting on top of the node
                ctx.beginPath();
                ctx.arc(nx, ny - r - loopR, loopR, 0, Math.PI * 2);
                ctx.stroke();
                // Arrowhead at bottom of loop for directed self-loops
                if (isDirected) {
                    ctx.globalAlpha = edgeAlpha;
                    const tipX = nx - loopR * 0.3;
                    const tipY = ny - r;
                    ctx.beginPath();
                    ctx.moveTo(tipX, tipY);
                    ctx.lineTo(tipX - 7, tipY - 6);
                    ctx.moveTo(tipX, tipY);
                    ctx.lineTo(tipX + 4, tipY - 8);
                    ctx.stroke();
                }
                ctx.globalAlpha = opacity;
                continue;
            }

            const x1 = u.x + ox, y1 = u.y + oy;
            const x2 = v.x + ox, y2 = v.y + oy;

            // Check if there is also a reverse edge (bidirectional pair)
            const hasBidirectional = isDirected && edgeSet.has(`${e.v}->${e.u}`);

            if (isDirected) {
                const angle = Math.atan2(y2 - y1, x2 - x1);

                // Offset perpendicular so bidirectional edges don't overlap
                const OFFSET = hasBidirectional ? 10 : 0;
                const perpX = -Math.sin(angle) * OFFSET;
                const perpY =  Math.cos(angle) * OFFSET;

                const sx = x1 + r * Math.cos(angle) + perpX;
                const sy = y1 + r * Math.sin(angle) + perpY;
                const ex = x2 - r * Math.cos(angle) + perpX;
                const ey = y2 - r * Math.sin(angle) + perpY;

                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                // Arrowhead
                const headLen = 10;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headLen * Math.cos(angle - 0.35), ey - headLen * Math.sin(angle - 0.35));
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headLen * Math.cos(angle + 0.35), ey - headLen * Math.sin(angle + 0.35));
                ctx.stroke();

            } else {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            ctx.globalAlpha = opacity;
        }

        ctx.globalAlpha = opacity;

        // Draw nodes
        for (const [id, node] of nodes) {
            const nx = node.x + ox;
            const ny = node.y + oy;

            const isSelected = node.selected;
            ctx.beginPath();
            ctx.arc(nx, ny, r, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? 'hsl(210, 50%, 30%)' : '#2d2d2d';
            ctx.fill();
            ctx.strokeStyle = isSelected ? 'hsl(210, 80%, 60%)' : color;
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.globalAlpha = opacity;
            ctx.stroke();

            // Node label
            ctx.fillStyle = isSelected ? 'hsl(210, 80%, 90%)' : color;
            ctx.font = '13px Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.label || id, nx, ny, r * 2 - 4);

            // Node weight (shown below the circle)
            if (node.nodeWeight != null) {
                ctx.fillStyle = '#a0e0ff';
                ctx.font = '10px Consolas, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(`w:${node.nodeWeight}`, nx, ny + r + 3);
                ctx.textBaseline = 'middle';
            }
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
     * Hit test graph edges — wider tolerance for easy clicking.
     * Self-loops are hit-tested against their loop circle.
     * @returns {Object|null} The edge hit at (wx, wy).
     */
    static hitTestEdge(nodes, edges, wx, wy, opts = {}) {
        const r = opts.nodeRadius || 20;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        const tol = opts.tolerance || 12;
        const directed = opts.directed || false;

        // Same edgeSet as draw() for bidirectional detection
        const edgeSet = new Set(edges.map(e => `${e.u}->${e.v}`));

        for (const e of edges) {
            const u = nodes.get(e.u);
            const v = nodes.get(e.v);
            if (!u || !v) continue;

            // Self-loop: hit-test its loop circle
            if (e.u === e.v) {
                const loopR = r * 0.75;
                const lx = u.x + ox;
                const ly = u.y + oy - r - loopR;
                if (Math.abs(Math.hypot(wx - lx, wy - ly) - loopR) < tol) return e;
                continue;
            }

            const x1 = u.x + ox, y1 = u.y + oy;
            const x2 = v.x + ox, y2 = v.y + oy;
            const angle = Math.atan2(y2 - y1, x2 - x1);

            const isDirected = e.directed || directed;
            const hasBidirectional = isDirected && edgeSet.has(`${e.v}->${e.u}`);
            const OFFSET = hasBidirectional ? 10 : 0;
            const perpX = -Math.sin(angle) * OFFSET;
            const perpY =  Math.cos(angle) * OFFSET;

            const sx = x1 + r * Math.cos(angle) + perpX;
            const sy = y1 + r * Math.sin(angle) + perpY;
            const ex = x2 - r * Math.cos(angle) + perpX;
            const ey = y2 - r * Math.sin(angle) + perpY;

            if (_ptSegDist(wx, wy, sx, sy, ex, ey) < tol) return e;
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
