/**
 * GraphParser — parses text input into a graph structure.
 *
 * Mode 'edge-list':
 *   N M
 *   u v [node_weight_of_v]   (repeated M times)
 *   The optional 3rd token is the node weight of the destination node v.
 *   Self-loops (u === v) are supported; their weight is assigned to that node.
 *
 * Mode 'adj-list':
 *   N
 *   M neighbor1 neighbor2 ... neighborM   (one row per node, N rows total)
 *   M = degree of this node; followed by exactly M neighbor IDs.
 */
export class GraphParser {
    /**
     * Parse graph from text.
     * @param {string} text
     * @param {boolean} directed
     * @param {boolean} zeroBased  - if true, node IDs in input are 0-based (0..N-1)
     * @param {string}  graphMode  - 'edge-list' | 'adj-list'
     * @returns {{ nodes: Map, edges: Array, directed }}
     */
    static parse(text, directed = false, zeroBased = false, graphMode = 'edge-list') {
        if (graphMode === 'adj-list') {
            return GraphParser._parseAdjList(text, directed, zeroBased);
        }
        return GraphParser._parseEdgeList(text, directed, zeroBased);
    }

    /** ── Edge-list mode ────────────────────────────────────────── */
    static _parseEdgeList(text, directed, zeroBased) {
        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return null;

        const firstLine = lines[0].split(/\s+/);
        const n = parseInt(firstLine[0]);
        const m = firstLine.length > 1 ? parseInt(firstLine[1]) : 0;
        const start = zeroBased ? 0 : 1;

        const nodes = new Map();
        const edges = [];

        // Create nodes start .. start+n-1
        for (let i = start; i < start + n; i++) {
            nodes.set(String(i), { id: String(i), x: 0, y: 0, label: String(i), nodeWeight: null });
        }

        // Parse up to M edges
        for (let i = 1; i < lines.length && edges.length < m; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length < 2) continue;
            const u = parts[0];
            const v = parts[1];
            // 3rd token = node weight of destination v (also of u when self-loop)
            const nodeW = parts.length >= 3 ? parts[2] : null;

            // Ensure nodes exist (in case IDs are outside expected range)
            if (!nodes.has(u)) nodes.set(u, { id: u, x: 0, y: 0, label: u, nodeWeight: null });
            if (!nodes.has(v)) nodes.set(v, { id: v, x: 0, y: 0, label: v, nodeWeight: null });

            if (nodeW !== null) {
                nodes.get(v).nodeWeight = nodeW;
                if (u === v) nodes.get(u).nodeWeight = nodeW; // self-loop
            }

            edges.push({ u, v, w: null, directed });
        }

        return { nodes, edges, directed };
    }

    /** ── Adjacency-list mode ───────────────────────────────────── */
    static _parseAdjList(text, directed, zeroBased) {
        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return null;

        const n = parseInt(lines[0]);
        if (isNaN(n) || n <= 0) return null;

        const start = zeroBased ? 0 : 1;
        const nodes = new Map();
        const edges = [];

        // Create n nodes
        for (let i = start; i < start + n; i++) {
            nodes.set(String(i), { id: String(i), x: 0, y: 0, label: String(i), nodeWeight: null });
        }

        // Parse N rows (lines[1] .. lines[n])
        for (let row = 0; row < n && (row + 1) < lines.length; row++) {
            const nodeId = String(start + row);
            const parts = lines[row + 1].split(/\s+/);
            if (parts.length === 0) continue;

            // First token = M (degree / neighbor count)
            const m = parseInt(parts[0]);
            if (isNaN(m) || m === 0) continue;

            // Next M tokens = neighbor IDs
            const neighbors = parts.slice(1, 1 + m);
            for (const nb of neighbors) {
                if (!nodes.has(nb)) nodes.set(nb, { id: nb, x: 0, y: 0, label: nb, nodeWeight: null });
                edges.push({ u: nodeId, v: nb, w: null, directed });
            }
        }

        return { nodes, edges, directed };
    }
}
