/**
 * GraphRenderer — draws graph nodes and edges on canvas.
 */
import { fitCanvasTextFontSize } from '../core/CanvasTextFit.js';

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
                cached.targets[index] !== edge.v || cached.edgeDirections[index] !== edge.directed ||
                cached.weightedEdges[index] !== (edge.w != null && edge.w !== '')) {
                isCurrent = false;
                break;
            }
        }
        if (isCurrent) return cached;
    }

    const laneCounts = new Map();
    const weightedGroups = new Set();
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
        if (edge.w != null && edge.w !== '') weightedGroups.add(key);
        if (edge.directed) hasDirectedEdges = true;
    }

    const edgeOffsets = new Float64Array(edges.length);
    const edgeLaneIndices = new Uint32Array(edges.length);
    const edgeSpacings = new Float64Array(edges.length);
    const laneIndices = new Map();
    for (let index = 0; index < edges.length; index++) {
        const key = groupKeys[index];
        const laneIndex = laneIndices.get(key) || 0;
        edgeLaneIndices[index] = laneIndex;
        edgeSpacings[index] = weightedGroups.has(key) ? 22 : 8;
        edgeOffsets[index] = (laneIndex - (laneCounts.get(key) - 1) / 2) * edgeSpacings[index];
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
        edgeSpacings,
        edgeOrientations,
        edgeHasReverse,
        sources: edges.map(edge => edge.u),
        targets: edges.map(edge => edge.v),
        edgeDirections: edges.map(edge => edge.directed),
        weightedEdges: edges.map(edge => edge.w != null && edge.w !== '')
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

function edgePath(u, v, radius, offset) {
    const dx = v.x - u.x, dy = v.y - u.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length, uy = dy / length;
    if (Math.abs(offset) < 1e-6) {
        const trim = Math.min(radius, length / 2);
        return { sx: u.x + ux * trim, sy: u.y + uy * trim,
            ex: v.x - ux * trim, ey: v.y - uy * trim, cx: null, cy: null,
            labelX: (u.x + v.x) / 2, labelY: (u.y + v.y) / 2, angle: Math.atan2(dy, dx) };
    }
    const cx = (u.x + v.x) / 2 - uy * offset * 2;
    const cy = (u.y + v.y) / 2 + ux * offset * 2;
    const fromLength = Math.hypot(cx - u.x, cy - u.y) || 1;
    const toLength = Math.hypot(cx - v.x, cy - v.y) || 1;
    const sx = u.x + (cx - u.x) / fromLength * radius;
    const sy = u.y + (cy - u.y) / fromLength * radius;
    const ex = v.x + (cx - v.x) / toLength * radius;
    const ey = v.y + (cy - v.y) / toLength * radius;
    return { sx, sy, ex, ey, cx, cy, labelX: (sx + 2 * cx + ex) / 4,
        labelY: (sy + 2 * cy + ey) / 4, angle: Math.atan2(ey - cy, ex - cx) };
}

function pointOnEdge(path, t) {
    const a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t;
    return { x: a * path.sx + b * path.cx + c * path.ex,
        y: a * path.sy + b * path.cy + c * path.ey };
}

function pathOffset(metadata, index, edge, directed) {
    if (edge.directed || directed) {
        // Keep every lane of each direction on its own side. Centering both
        // groups around +10 lets the outer lanes cross into the reverse group.
        return metadata.edgeHasReverse[index]
            ? Math.max(10, metadata.edgeSpacings[index] / 2) +
                metadata.edgeLaneIndices[index] * metadata.edgeSpacings[index]
            : metadata.edgeOffsets[index];
    }
    return metadata.edgeOffsets[index] * metadata.edgeOrientations[index];
}

export class GraphRenderer {
    /** Bounds include the visible lanes, self-loops, and their weight labels. */
    static getContentBounds(nodes, edges, opts = {}) {
        if (!nodes.size) return null;
        const r = opts.nodeRadius || 20;
        const directed = opts.directed || false;
        const metadata = getEdgeMetadata(nodes, edges, directed);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const include = (x, y, rx = 0, ry = rx) => {
            minX = Math.min(minX, x - rx); minY = Math.min(minY, y - ry);
            maxX = Math.max(maxX, x + rx); maxY = Math.max(maxY, y + ry);
        };
        for (const node of nodes.values()) include(node.x, node.y, r);
        for (let index = 0; index < edges.length; index++) {
            const edge = edges[index], u = metadata.sourceNodes[index], v = metadata.targetNodes[index];
            if (!u || !v) continue;
            let labelX, labelY;
            if (edge.u === edge.v) {
                const loopR = r * 0.75 + metadata.edgeLaneIndices[index] * metadata.edgeSpacings[index];
                include(u.x, u.y - r - loopR, loopR + 1);
                labelX = u.x; labelY = u.y - r - loopR * 2 - 12;
            } else {
                const path = edgePath(u, v, r, pathOffset(metadata, index, edge, directed));
                include(path.sx, path.sy, 2); include(path.ex, path.ey, 2);
                if (path.cx !== null) {
                    for (const [s, c, e] of [[path.sx, path.cx, path.ex], [path.sy, path.cy, path.ey]]) {
                        const denominator = s - 2 * c + e;
                        const t = denominator ? (s - c) / denominator : -1;
                        if (t > 0 && t < 1) {
                            const point = pointOnEdge(path, t);
                            include(point.x, point.y, 2);
                        }
                    }
                }
                labelX = path.labelX; labelY = path.labelY;
            }
            if (edge.w != null && edge.w !== '') {
                include(labelX, labelY, String(edge.w).length * 3.1 + 5, 10);
            }
        }
        return { minX, minY, maxX, maxY };
    }

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
            edgeLaneIndices, edgeSpacings,
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
                const loopR = r * 0.75 + edgeLaneIndices[edgeIndex] * edgeSpacings[edgeIndex];
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
                GraphRenderer._drawEdgeLabel(ctx, e, nx, ny - r - loopR * 2 - 12,
                    color, edgeAlpha, edgeLabelWidths);
                ctx.globalAlpha = opacity;
                continue;
            }

            const path = edgePath(u, v, r, pathOffset(edgeMetadata, edgeIndex, e, directed));
            ctx.beginPath();
            ctx.moveTo(path.sx + ox, path.sy + oy);
            if (path.cx === null) ctx.lineTo(path.ex + ox, path.ey + oy);
            else ctx.quadraticCurveTo(path.cx + ox, path.cy + oy, path.ex + ox, path.ey + oy);
            ctx.stroke();
            if (isDirected) {
                // Arrowhead
                const headLen = 10;
                const { angle } = path;
                const ex = path.ex + ox, ey = path.ey + oy;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headLen * Math.cos(angle - 0.35), ey - headLen * Math.sin(angle - 0.35));
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headLen * Math.cos(angle + 0.35), ey - headLen * Math.sin(angle + 0.35));
                ctx.stroke();

            }
            GraphRenderer._drawEdgeLabel(ctx, e, path.labelX + ox, path.labelY + oy,
                color, edgeAlpha, edgeLabelWidths);

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
            const label = String(node.label || id);
            const fontSize = fitCanvasTextFontSize(ctx, label, 13, r * 2 - 6, r * 1.5);
            ctx.font = `${fontSize}px Consolas, monospace`;
            ctx.fillText(label, nx, ny);

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
            edgeLaneIndices, edgeSpacings,
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

            // Self-loop: hit-test its loop circle
            if (e.u === e.v) {
                const loopR = r * 0.75 + laneIndex * edgeSpacings[edgeIndex];
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

            const path = edgePath(u, v, r, pathOffset(edgeMetadata, edgeIndex, e, directed));
            const px = wx - ox, py = wy - oy;
            const minX = Math.min(path.sx, path.ex, path.cx ?? path.sx) - tol;
            const maxX = Math.max(path.sx, path.ex, path.cx ?? path.sx) + tol;
            const minY = Math.min(path.sy, path.ey, path.cy ?? path.sy) - tol;
            const maxY = Math.max(path.sy, path.ey, path.cy ?? path.sy) + tol;
            if (px < minX || px > maxX || py < minY || py > maxY) {
                continue;
            }
            let distanceSquared;
            if (path.cx === null) {
                distanceSquared = _ptSegDistSquared(px, py, path.sx, path.sy, path.ex, path.ey);
            } else {
                distanceSquared = Infinity;
                const curvature = Math.hypot(path.sx - 2 * path.cx + path.ex, path.sy - 2 * path.cy + path.ey);
                const segments = Math.min(256, Math.max(12, Math.ceil(Math.sqrt(curvature / Math.max(0.1, tol)))));
                let previous = { x: path.sx, y: path.sy };
                for (let step = 1; step <= segments; step++) {
                    const point = pointOnEdge(path, step / segments);
                    distanceSquared = Math.min(distanceSquared,
                        _ptSegDistSquared(px, py, previous.x, previous.y, point.x, point.y));
                    previous = point;
                }
            }
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
