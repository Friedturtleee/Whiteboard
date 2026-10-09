/**
 * GraphRenderer — draws graph nodes and edges on canvas.
 */
const edgeMetadataCache = new WeakMap();
const edgeLabelWidthCaches = new WeakMap();

function getEdgeLabelWidthCache(ctx) {
    let cache = edgeLabelWidthCaches.get(ctx);
    if (!cache) {
        cache = new Map();
        edgeLabelWidthCaches.set(ctx, cache);
    }
    return cache;
}

function getEdgeMetadata(nodes, edges, directed) {
    const cached = edgeMetadataCache.get(edges);
    if (cached && cached.nodes === nodes && cached.directed === directed &&
        cached.sources.length === edges.length && cached.nodeRefs.length === nodes.size) {
        let isCurrent = true;
        let nodeIndex = 0;
        for (const [id, node] of nodes) {
            if (cached.nodeKeys[nodeIndex] !== id || cached.nodeRefs[nodeIndex] !== node) {
                isCurrent = false;
                break;
            }
            nodeIndex++;
        }
        for (let index = 0; index < edges.length; index++) {
            if (!isCurrent) break;
            const edge = edges[index];
            if (cached.sources[index] !== edge.u ||
                cached.targets[index] !== edge.v || cached.edgeDirections[index] !== edge.directed) {
                isCurrent = false;
                break;
            }
        }
        if (isCurrent) return cached;
    }

    const laneCounts = new Map();
    const groupKeys = new Array(edges.length);
    const sourceNodes = new Array(edges.length);
    const targetNodes = new Array(edges.length);
    const edgeOrientations = new Int8Array(edges.length);
    const nodeKeys = [];
    const nodeRefs = [];
    for (const [id, node] of nodes) {
        nodeKeys.push(id);
        nodeRefs.push(node);
    }
    let hasDirectedEdges = directed;
    for (let index = 0; index < edges.length; index++) {
        const edge = edges[index];
        sourceNodes[index] = nodes.get(edge.u);
        targetNodes[index] = nodes.get(edge.v);
        const source = String(edge.u);
        const target = String(edge.v);
        edgeOrientations[index] = source <= target ? 1 : -1;
        const key = getEdgeGroupKey(edge, directed, source, target);
        groupKeys[index] = key;
        laneCounts.set(key, (laneCounts.get(key) || 0) + 1);
        if (edge.directed) hasDirectedEdges = true;
    }

    const edgeOffsets = new Float64Array(edges.length);
    const edgeLaneIndices = new Uint32Array(edges.length);
    const laneIndices = new Map();
    for (let index = 0; index < edges.length; index++) {
        const key = groupKeys[index];
        const laneIndex = laneIndices.get(key) || 0;
        edgeLaneIndices[index] = laneIndex;
        edgeOffsets[index] = (laneIndex - (laneCounts.get(key) - 1) / 2) * 8;
        laneIndices.set(key, laneIndex + 1);
    }

    let edgeSet = null;
    if (hasDirectedEdges) {
        edgeSet = new Set();
        for (const edge of edges) edgeSet.add(getDirectedEdgeKey(edge.u, edge.v));
    }
    const edgeHasReverse = new Uint8Array(edges.length);
    if (edgeSet) {
        for (let index = 0; index < edges.length; index++) {
            const edge = edges[index];
            if ((edge.directed || directed) &&
                edgeSet.has(getDirectedEdgeKey(edge.v, edge.u))) {
                edgeHasReverse[index] = 1;
            }
        }
    }

    const metadata = {
        nodes,
        directed,
        nodeKeys,
        nodeRefs,
        sourceNodes,
        targetNodes,
        edgeOffsets,
        edgeLaneIndices,
        edgeOrientations,
        edgeHasReverse,
        sources: edges.map(edge => edge.u),
        targets: edges.map(edge => edge.v),
        edgeDirections: edges.map(edge => edge.directed)
    };
    edgeMetadataCache.set(edges, metadata);
    return metadata;
}

function getDirectedEdgeKey(u, v) {
    const source = String(u);
    const target = String(v);
    return `${source.length}:${source}${target.length}:${target}`;
}

function getEdgeGroupKey(edge, directed, source = String(edge.u), target = String(edge.v)) {
    const isDirected = edge.directed || directed;
    const u = isDirected || source <= target ? source : target;
    const v = isDirected || source <= target ? target : source;
    return `${isDirected ? 'd' : 'u'}${u.length}:${u}${v.length}:${v}`;
}

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

        // Endpoint groups only change when the edge array or its endpoints
        // change. Reuse lane offsets and resolved node references across
        // redraws and hit tests while detecting in-place topology edits.
        const edgeMetadata = getEdgeMetadata(nodes, edges, directed);
        const {
            edgeOffsets, edgeLaneIndices, edgeOrientations, edgeHasReverse,
            sourceNodes, targetNodes
        } = edgeMetadata;
        const edgeLabelWidths = getEdgeLabelWidthCache(ctx);

        ctx.globalAlpha = opacity;

        // Draw edges
        for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
            const e = edges[edgeIndex];
            const u = sourceNodes[edgeIndex];
            const v = targetNodes[edgeIndex];
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
                const loopR = r * 0.75 + edgeLaneIndices[edgeIndex] * 8;
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
            const hasBidirectional = isDirected && edgeHasReverse[edgeIndex] === 1;

            if (isDirected) {
                const angle = Math.atan2(y2 - y1, x2 - x1);

                // Offset perpendicular so bidirectional edges don't overlap
                // The perpendicular vector reverses with edge direction, so
                // the same signed offset places reciprocal edges on opposite
                // physical sides of the node pair.
                const offset = (hasBidirectional ? 10 : 0) + edgeOffsets[edgeIndex];
                const perpX = -Math.sin(angle) * offset;
                const perpY =  Math.cos(angle) * offset;

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

                GraphRenderer._drawEdgeLabel(
                    ctx, e, (sx + ex) / 2, (sy + ey) / 2, color, edgeAlpha, edgeLabelWidths
                );
            } else {
                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const orientation = edgeOrientations[edgeIndex];
                const offset = edgeOffsets[edgeIndex] * orientation;
                const perpX = length ? -dy / length * offset : 0;
                const perpY = length ? dx / length * offset : 0;
                ctx.beginPath();
                ctx.moveTo(x1 + perpX, y1 + perpY);
                ctx.lineTo(x2 + perpX, y2 + perpY);
                ctx.stroke();
                GraphRenderer._drawEdgeLabel(
                    ctx, e, (x1 + x2) / 2 + perpX, (y1 + y2) / 2 + perpY,
                    color, edgeAlpha, edgeLabelWidths
                );
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

    static _drawEdgeLabel(ctx, edge, x, y, color, alpha, widthCache = null) {
        if (edge.w == null || edge.w === '') return;
        const label = String(edge.w);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '10px Consolas, monospace';
        const paddingX = 4;
        let textWidth = widthCache?.get(label);
        if (textWidth === undefined) {
            textWidth = ctx.measureText(label).width;
            // Contest graphs often repeat a small set of edge weights. Keep
            // this context-local and bounded so unique labels do not accumulate.
            if (widthCache && widthCache.size < 256) widthCache.set(label, textWidth);
        }
        const width = textWidth + paddingX * 2;
        ctx.fillStyle = 'rgba(30, 30, 30, 0.92)';
        ctx.fillRect(x - width / 2, y - 9, width, 18);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - width / 2, y - 9, width, 18);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.restore();
    }

    /**
     * Hit test graph nodes.
     * @returns {Object|null} The node hit at (wx, wy).
     */
    static hitTestNode(nodes, wx, wy, opts = {}) {
        const r = opts.nodeRadius || 20;
        const ox = opts.offsetX || 0;
        const oy = opts.offsetY || 0;
        if (r < 0) return null;
        const radiusSquared = r * r;

        for (const node of nodes.values()) {
            const dx = wx - (node.x + ox);
            const dy = wy - (node.y + oy);
            if (dx * dx + dy * dy <= radiusSquared) return node;
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
        if (tol < 0) return null;
        const directed = opts.directed || false;

        const edgeMetadata = getEdgeMetadata(nodes, edges, directed);
        const {
            edgeOffsets, edgeLaneIndices, edgeOrientations, edgeHasReverse,
            sourceNodes, targetNodes
        } = edgeMetadata;
        let closestEdge = null;
        let closestDistance = tol;

        for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
            const e = edges[edgeIndex];
            const u = sourceNodes[edgeIndex];
            const v = targetNodes[edgeIndex];
            if (!u || !v) continue;

            const laneIndex = edgeLaneIndices[edgeIndex];
            const laneOffset = edgeOffsets[edgeIndex];

            // Self-loop: hit-test its loop circle
            if (e.u === e.v) {
                const loopR = r * 0.75 + laneIndex * 8;
                const lx = u.x + ox;
                const ly = u.y + oy - r - loopR;
                const loopDx = wx - lx;
                const loopDy = wy - ly;
                const distance = Math.abs(Math.sqrt(loopDx * loopDx + loopDy * loopDy) - loopR);
                if (distance < closestDistance) {
                    closestEdge = e;
                    closestDistance = distance;
                    if (distance === 0) return e;
                }
                continue;
            }

            const x1 = u.x + ox, y1 = u.y + oy;
            const x2 = v.x + ox, y2 = v.y + oy;
            const isDirected = e.directed || directed;
            const hasBidirectional = isDirected && edgeHasReverse[edgeIndex] === 1;
            const orientation = edgeOrientations[edgeIndex];
            const laneOffsetWithReverse = (hasBidirectional ? 10 : 0) + laneOffset;
            const offset = isDirected ? laneOffsetWithReverse : laneOffset * orientation;
            const boundsPadding = r + Math.abs(offset) + tol;
            if (wx < Math.min(x1, x2) - boundsPadding ||
                wx > Math.max(x1, x2) + boundsPadding ||
                wy < Math.min(y1, y2) - boundsPadding ||
                wy > Math.max(y1, y2) + boundsPadding) {
                continue;
            }

            const angle = Math.atan2(y2 - y1, x2 - x1);
            const perpX = -Math.sin(angle) * offset;
            const perpY =  Math.cos(angle) * offset;

            const sx = x1 + r * Math.cos(angle) + perpX;
            const sy = y1 + r * Math.sin(angle) + perpY;
            const ex = x2 - r * Math.cos(angle) + perpX;
            const ey = y2 - r * Math.sin(angle) + perpY;

            const distanceSquared = _ptSegDistSquared(wx, wy, sx, sy, ex, ey);
            if (distanceSquared < closestDistance * closestDistance) {
                closestEdge = e;
                closestDistance = Math.sqrt(distanceSquared);
                if (distanceSquared === 0) return e;
            }
        }
        return closestEdge;
    }
}

function _ptSegDistSquared(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        const dx = px - x1;
        const dy = py - y1;
        return dx * dx + dy * dy;
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;
    const offsetX = px - nearestX;
    const offsetY = py - nearestY;
    return offsetX * offsetX + offsetY * offsetY;
}
