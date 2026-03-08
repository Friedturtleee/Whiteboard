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

        // Build a set of reverse-edge pairs for bidirectional detection
        const edgeSet = new Set(edges.map(e => `${e.u}->${e.v}`));

        ctx.globalAlpha = opacity;

        // Draw edges
        for (const e of edges) {
            const u = nodes.get(e.u);
            const v = nodes.get(e.v);
            if (!u || !v) continue;

            const x1 = u.x + ox, y1 = u.y + oy;
            const x2 = v.x + ox, y2 = v.y + oy;

            const edgeColor = e.selected ? 'hsl(210, 80%, 60%)' : color;
            const edgeAlpha = e.selected ? opacity * 0.9 : opacity * 0.5;
            const edgeWidth = e.selected ? 2.5 : 1.5;

            ctx.strokeStyle = edgeColor;
            ctx.lineWidth = edgeWidth;
            ctx.globalAlpha = edgeAlpha;

            const isDirected = e.directed || directed;
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

                // Edge weight label — offset perpendicular to edge (above/below based on direction)
                if (e.w !== null && e.w !== undefined) {
                    ctx.globalAlpha = opacity * 0.85;
                    ctx.fillStyle = edgeColor;
                    ctx.font = '11px Consolas, monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const mx = (sx + ex) / 2;
                    const my = (sy + ey) / 2;
                    // Perpendicular offset: 14px on the "left" side of the directed edge
                    const labelOffset = 14;
                    ctx.fillText(String(e.w),
                        mx - Math.sin(angle) * labelOffset,
                        my + Math.cos(angle) * labelOffset);
                }
            } else {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                // Edge weight label — offset above the midpoint (perpendicular to edge)
                if (e.w !== null && e.w !== undefined) {
                    const angle = Math.atan2(y2 - y1, x2 - x1);
                    ctx.globalAlpha = opacity * 0.85;
                    ctx.fillStyle = edgeColor;
                    ctx.font = '11px Consolas, monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    // Perpendicular offset: pick the side that is "upward" on screen
                    const labelOffset = 14;
                    const px = -Math.sin(angle) * labelOffset;
                    const py =  Math.cos(angle) * labelOffset;
                    // Always pick the side where py < 0 (label goes above) if possible
                    const flip = py > 0 ? -1 : 1;
                    ctx.fillText(String(e.w), mx + flip * px, my + flip * py);
                }
            }

            ctx.globalAlpha = opacity;
        }

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

            ctx.fillStyle = isSelected ? 'hsl(210, 80%, 90%)' : color;
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
     * Hit test graph edges — wider tolerance for easy clicking.
     * Mirrors the exact offset geometry used in draw() so bidirectional
     * edge hit boxes align with the visible lines.
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

            const x1 = u.x + ox, y1 = u.y + oy;
            const x2 = v.x + ox, y2 = v.y + oy;
            const angle = Math.atan2(y2 - y1, x2 - x1);

            const isDirected = e.directed || directed;
            const hasBidirectional = isDirected && edgeSet.has(`${e.v}->${e.u}`);
            const OFFSET = hasBidirectional ? 10 : 0;
            const perpX = -Math.sin(angle) * OFFSET;
            const perpY =  Math.cos(angle) * OFFSET;

            // Match the exact start/end points from draw()
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
