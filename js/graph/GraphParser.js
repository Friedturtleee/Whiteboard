/**
 * Parses edge-list or adjacency-list text into a graph structure.
 *
 * Edge-list:
 *   N M
 *   u v [edge_weight]        (exactly M edge rows)
 *
 * Adjacency-list:
 *   N
 *   M neighbor1 ... neighborM (exactly N rows)
 */
const MAX_GRAPH_NODES = 500;
const MAX_GRAPH_EDGES = 100000;
const NON_NEGATIVE_INTEGER_TOKEN = /^\d+$/;
const SIGNED_INTEGER_TOKEN = /^-?\d+$/;

export class GraphParser {
    static parse(text, directed = false, zeroBased = false, graphMode = 'edge-list') {
        if (typeof text !== 'string' || !text.trim()) return null;
        if (text.length > 1000000) {
            return { error: '圖資料不得超過 1 MB。' };
        }
        if (graphMode === 'adj-list') {
            return GraphParser._parseAdjList(text, directed, zeroBased);
        }
        if (graphMode !== 'edge-list') {
            return { error: '未知的圖輸入格式：' + graphMode };
        }
        return GraphParser._parseEdgeList(text, directed, zeroBased);
    }

    static _nonNegativeInteger(token, field, lineNumber) {
        if (!NON_NEGATIVE_INTEGER_TOKEN.test(token)) {
            return { error: '第 ' + lineNumber + ' 行：' + field + ' 須為非負整數。' };
        }
        const value = Number(token);
        if (!Number.isSafeInteger(value)) {
            return { error: '第 ' + lineNumber + ' 行：' + field + ' 超出安全範圍。' };
        }
        return { value };
    }

    static _parseEdgeList(text, directed, zeroBased) {
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const header = lines[0].split(/\s+/);
        if (header.length !== 2) {
            return { error: '邊列表標頭格式錯誤，應為 N M。' };
        }

        const nResult = GraphParser._nonNegativeInteger(header[0], 'N', 1);
        if (nResult.error) return nResult;
        const mResult = GraphParser._nonNegativeInteger(header[1], 'M', 1);
        if (mResult.error) return mResult;
        const n = nResult.value;
        const m = mResult.value;
        if (n === 0) return { error: 'N 須大於 0。' };
        if (n > MAX_GRAPH_NODES || m > MAX_GRAPH_EDGES) {
            return { error: '圖資料上限為 500 個節點、100,000 條邊。' };
        }

        if (lines.length - 1 !== m) {
            return {
                error: '標頭宣告 ' + m + ' 條邊，實際有 ' +
                    (lines.length - 1) + ' 行。'
            };
        }

        const start = zeroBased ? 0 : 1;
        const nodes = new Map();
        const edges = [];
        for (let i = start; i < start + n; i++) {
            const id = String(i);
            nodes.set(id, { id, x: 0, y: 0, label: id, nodeWeight: null });
        }

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length < 2 || parts.length > 3) {
                return { error: '第 ' + (i + 1) + ' 行格式錯誤，應為 u v [w]。' };
            }
            const uToken = parts[0];
            const vToken = parts[1];
            const weight = parts.length === 3 ? parts[2] : null;
            const uNumber = Number(uToken);
            const vNumber = Number(vToken);
            if (!SIGNED_INTEGER_TOKEN.test(uToken) || !Number.isSafeInteger(uNumber) ||
                !SIGNED_INTEGER_TOKEN.test(vToken) || !Number.isSafeInteger(vNumber)) {
                return { error: '第 ' + (i + 1) + ' 行節點編號須為安全整數。' };
            }
            if (uNumber < start || uNumber >= start + n ||
                vNumber < start || vNumber >= start + n) {
                return {
                    error: '第 ' + (i + 1) + ' 行節點編號須介於 ' +
                        start + ' 至 ' + (start + n - 1) + '。'
                };
            }
            const u = String(uNumber);
            const v = String(vNumber);

            if (weight !== null) {
                if (weight.trim() === '' || !Number.isFinite(Number(weight))) {
                    return { error: '第 ' + (i + 1) + ' 行權重須為有限數值。' };
                }
            }
            edges.push({ u, v, w: weight, directed });
        }

        return { nodes, edges, directed };
    }

    static _parseAdjList(text, directed, zeroBased) {
        const lines = text.split(/\r?\n/).map(line => line.trim());
        const firstContentIndex = lines.findIndex(Boolean);
        const header = lines[firstContentIndex].split(/\s+/);
        if (header.length !== 1) {
            return { error: '鄰接列表標頭應為 N。' };
        }
        const nResult = GraphParser._nonNegativeInteger(header[0], 'N', firstContentIndex + 1);
        if (nResult.error) return nResult;
        const n = nResult.value;
        if (n === 0) return { error: 'N 須大於 0。' };
        if (n > MAX_GRAPH_NODES) {
            return { error: '圖資料最多支援 500 個節點。' };
        }

        const rowStart = firstContentIndex + 1;
        const availableRows = lines.length - rowStart;
        let invalidRows = availableRows < n;
        for (let row = 0; !invalidRows && row < n; row++) {
            if (!lines[rowStart + row]) invalidRows = true;
        }
        for (let index = rowStart + n; !invalidRows && index < lines.length; index++) {
            if (lines[index]) invalidRows = true;
        }
        if (invalidRows) {
            return { error: '鄰接列表須有 ' + n + ' 行非空資料。' };
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
            const parts = lines[rowStart + row].split(/\s+/);
            const lineNumber = rowStart + row + 1;
            const degreeResult = GraphParser._nonNegativeInteger(parts[0], '鄰居數', lineNumber);
            if (degreeResult.error) return degreeResult;
            const degree = degreeResult.value;
            if (degree > MAX_GRAPH_EDGES || totalAdjacencyEntries + degree > MAX_GRAPH_EDGES) {
                return { error: '鄰接列表鄰居總數上限為 100,000。' };
            }
            totalAdjacencyEntries += degree;
            const actualNeighbors = parts.length - 1;
            if (actualNeighbors !== degree) {
                return {
                    error: '第 ' + lineNumber + ' 行鄰居數宣告 ' + degree +
                        '，實際有 ' + actualNeighbors + ' 個。'
                };
            }

            const nodeId = String(start + row);
            for (let partIndex = 1; partIndex < parts.length; partIndex++) {
                const neighbor = parts[partIndex];
                const neighborNumber = Number(neighbor);
                if (!SIGNED_INTEGER_TOKEN.test(neighbor) || !Number.isSafeInteger(neighborNumber)) {
                    return { error: '第 ' + lineNumber + ' 行鄰居編號須為安全整數。' };
                }
                if (neighborNumber < start || neighborNumber >= start + n) {
                    return {
                        error: '第 ' + lineNumber + ' 行鄰居編號須介於 ' +
                            start + ' 至 ' + (start + n - 1) + '。'
                    };
                }
                const neighborId = String(neighborNumber);
                if (directed) {
                    edges.push({ u: nodeId, v: neighborId, w: null, directed: true });
                    continue;
                }

                // IDs are canonical safe-integer strings, so a comma is an
                // unambiguous separator and lexical ordering matches Array#sort.
                const u = nodeId < neighborId ? nodeId : neighborId;
                const v = nodeId < neighborId ? neighborId : nodeId;
                const key = u + ',' + v;
                let pair = undirectedPairs.get(key);
                if (!pair) {
                    pair = { u, v, forward: 0, reverse: 0 };
                    undirectedPairs.set(key, pair);
                }
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
