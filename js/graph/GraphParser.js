/**
 * Parses edge-list or adjacency-list text into a graph structure.
 *
 * Edge-list:
 *   N M
 *   u v [node_weight_of_v]   (exactly M edge rows)
 *
 * Adjacency-list:
 *   N
 *   M neighbor1 ... neighborM (exactly N rows)
 */
const MAX_GRAPH_NODES = 500;
const MAX_GRAPH_EDGES = 100000;

export class GraphParser {
    static parse(text, directed = false, zeroBased = false, graphMode = 'edge-list') {
        if (typeof text !== 'string' || !text.trim()) return null;
        if (text.length > 1000000) {
            return { error: 'Graph input cannot exceed 1 MB.' };
        }
        if (graphMode === 'adj-list') {
            return GraphParser._parseAdjList(text, directed, zeroBased);
        }
        if (graphMode !== 'edge-list') {
            return { error: 'Unknown graph input format: ' + graphMode };
        }
        return GraphParser._parseEdgeList(text, directed, zeroBased);
    }

    static _nonNegativeInteger(token, field, lineNumber) {
        if (!/^\d+$/.test(token)) {
            return { error: 'Line ' + lineNumber + ': ' + field + ' must be a non-negative integer.' };
        }
        const value = Number(token);
        if (!Number.isSafeInteger(value)) {
            return { error: 'Line ' + lineNumber + ': ' + field + ' is too large.' };
        }
        return { value };
    }

    static _parseEdgeList(text, directed, zeroBased) {
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const header = lines[0].split(/\s+/);
        if (header.length !== 2) {
            return { error: 'Edge-list header must contain exactly N and M.' };
        }

        const nResult = GraphParser._nonNegativeInteger(header[0], 'N', 1);
        if (nResult.error) return nResult;
        const mResult = GraphParser._nonNegativeInteger(header[1], 'M', 1);
        if (mResult.error) return mResult;
        const n = nResult.value;
        const m = mResult.value;
        if (n === 0) return { error: 'N must be greater than zero.' };
        if (n > MAX_GRAPH_NODES || m > MAX_GRAPH_EDGES) {
            return { error: 'Graph header exceeds the supported size (N <= 500, M <= 100000).' };
        }

        const edgeLines = lines.slice(1);
        if (edgeLines.length !== m) {
            return {
                error: 'Header declares ' + m + ' edges, but found ' +
                    edgeLines.length + ' non-empty edge row(s).'
            };
        }

        const start = zeroBased ? 0 : 1;
        const nodes = new Map();
        const edges = [];
        for (let i = start; i < start + n; i++) {
            const id = String(i);
            nodes.set(id, { id, x: 0, y: 0, label: id, nodeWeight: null });
        }

        for (let i = 0; i < edgeLines.length; i++) {
            const parts = edgeLines[i].split(/\s+/);
            if (parts.length < 2 || parts.length > 3) {
                return { error: 'Line ' + (i + 2) + ': edge row must be \"u v [destination-node-weight]\".' };
            }
            const uToken = parts[0];
            const vToken = parts[1];
            const nodeWeight = parts.length === 3 ? parts[2] : null;
            if (!/^-?\d+$/.test(uToken) || !Number.isSafeInteger(Number(uToken)) ||
                !/^-?\d+$/.test(vToken) || !Number.isSafeInteger(Number(vToken))) {
                return { error: 'Line ' + (i + 2) + ': node IDs must be safe integers.' };
            }
            const uNumber = Number(uToken);
            const vNumber = Number(vToken);
            if (uNumber < start || uNumber >= start + n ||
                vNumber < start || vNumber >= start + n) {
                return {
                    error: 'Line ' + (i + 2) + ': node IDs must be within the declared range ' +
                        start + ' to ' + (start + n - 1) + '.'
                };
            }
            const u = String(uNumber);
            const v = String(vNumber);

            if (nodeWeight !== null) {
                if (!Number.isFinite(Number(nodeWeight))) {
                    return { error: 'Line ' + (i + 2) + ': node weight must be a finite number.' };
                }
                const target = nodes.get(v);
                if (target.nodeWeight !== null && Number(target.nodeWeight) !== Number(nodeWeight)) {
                    return { error: 'Line ' + (i + 2) + ': conflicting weights were assigned to node ' + v + '.' };
                }
                target.nodeWeight = nodeWeight;
            }
            edges.push({ u, v, w: null, directed });
        }

        return { nodes, edges, directed };
    }

    static _parseAdjList(text, directed, zeroBased) {
        const rawLines = text.split(/\r?\n/).map(line => line.trim());
        const firstContentIndex = rawLines.findIndex(Boolean);
        const lines = rawLines.slice(firstContentIndex);
        const header = lines[0].split(/\s+/);
        if (header.length !== 1) {
            return { error: 'Adjacency-list header must contain exactly N.' };
        }
        const nResult = GraphParser._nonNegativeInteger(header[0], 'N', 1);
        if (nResult.error) return nResult;
        const n = nResult.value;
        if (n === 0) return { error: 'N must be greater than zero.' };
        if (n > MAX_GRAPH_NODES) {
            return { error: 'Graph header exceeds the supported size (N <= 500).' };
        }

        const rows = lines.slice(1);
        if (rows.length < n || rows.slice(0, n).some(line => !line) ||
            rows.slice(n).some(line => line)) {
            return { error: 'Adjacency-list input must contain exactly ' + n + ' non-empty row(s).' };
        }

        const start = zeroBased ? 0 : 1;
        const nodes = new Map();
        const edges = [];
        const undirectedPairs = new Map();
        let totalAdjacencyEntries = 0;
        for (let i = start; i < start + n; i++) {
            const id = String(i);
            nodes.set(id, { id, x: 0, y: 0, label: id, nodeWeight: null });
        }

        for (let row = 0; row < n; row++) {
            const parts = rows[row].split(/\s+/);
            const lineNumber = row + 2;
            const degreeResult = GraphParser._nonNegativeInteger(parts[0], 'degree', lineNumber);
            if (degreeResult.error) return degreeResult;
            const degree = degreeResult.value;
            if (degree > MAX_GRAPH_EDGES || totalAdjacencyEntries + degree > MAX_GRAPH_EDGES) {
                return { error: 'Adjacency-list input exceeds the supported size (M <= 100000).' };
            }
            totalAdjacencyEntries += degree;
            const actualNeighbors = parts.length - 1;
            if (actualNeighbors !== degree) {
                return {
                    error: 'Line ' + lineNumber + ': degree declares ' + degree +
                        ' neighbor(s), but found ' + actualNeighbors + '.'
                };
            }

            const nodeId = String(start + row);
            for (const neighbor of parts.slice(1)) {
                if (!/^-?\d+$/.test(neighbor) || !Number.isSafeInteger(Number(neighbor))) {
                    return { error: 'Line ' + lineNumber + ': neighbor IDs must be safe integers.' };
                }
                const neighborNumber = Number(neighbor);
                if (neighborNumber < start || neighborNumber >= start + n) {
                    return {
                        error: 'Line ' + lineNumber + ': neighbor IDs must be within the declared range ' +
                            start + ' to ' + (start + n - 1) + '.'
                    };
                }
                const neighborId = String(neighborNumber);
                if (directed) {
                    edges.push({ u: nodeId, v: neighborId, w: null, directed: true });
                    continue;
                }

                const [u, v] = [nodeId, neighborId].sort();
                const key = JSON.stringify([u, v]);
                if (!undirectedPairs.has(key)) {
                    undirectedPairs.set(key, { u, v, forward: 0, reverse: 0 });
                }
                const pair = undirectedPairs.get(key);
                if (u === v || nodeId === u) pair.forward++;
                else pair.reverse++;
            }
        }

        if (!directed) {
            for (const pair of undirectedPairs.values()) {
                // Reciprocal rows describe the same undirected edge; retain
                // repeated parallel neighbors by keeping the larger count.
                const count = pair.u === pair.v
                    ? pair.forward
                    : Math.max(pair.forward, pair.reverse);
                for (let i = 0; i < count; i++) {
                    edges.push({ u: pair.u, v: pair.v, w: null, directed: false });
                }
            }
        }

        return { nodes, edges, directed };
    }
}
