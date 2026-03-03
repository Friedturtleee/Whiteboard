/**
 * GraphParser — parses text input into a graph structure.
 *
 * Format:
 *   N M
 *   u v [w]
 *   ...
 */
export class GraphParser {
    /**
     * Parse graph from text.
     * @param {string} text
     * @param {boolean} directed
     * @returns {{ nodes: Map<string, {id, x, y}>, edges: [{u, v, w?}] }}
     */
    static parse(text, directed = false) {
        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return null;

        const firstLine = lines[0].split(/\s+/);
        const n = parseInt(firstLine[0]);
        const m = firstLine.length > 1 ? parseInt(firstLine[1]) : 0;

        const nodes = new Map();
        const edges = [];

        // Create nodes 1..N
        for (let i = 1; i <= n; i++) {
            nodes.set(String(i), { id: String(i), x: 0, y: 0, label: String(i) });
        }

        // Parse edges
        for (let i = 1; i < lines.length && edges.length < m; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length < 2) continue;
            const u = parts[0];
            const v = parts[1];
            const w = parts.length > 2 ? parts[2] : null;

            // Ensure nodes exist
            if (!nodes.has(u)) nodes.set(u, { id: u, x: 0, y: 0, label: u });
            if (!nodes.has(v)) nodes.set(v, { id: v, x: 0, y: 0, label: v });

            edges.push({ u, v, w, directed });
        }

        return { nodes, edges, directed };
    }
}
