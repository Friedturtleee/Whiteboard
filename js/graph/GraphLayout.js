/**
 * GraphLayout — Fruchterman-Reingold force-directed layout.
 */
export class GraphLayout {
    /**
     * Compute positions for all nodes.
     * @param {Map<string, {id, x, y}>} nodes
     * @param {Array<{u, v}>} edges
     * @param {Object} opts - { width, height, iterations, k }
     */
    static layout(nodes, edges, opts = {}) {
        const width = opts.width || 500;
        const height = opts.height || 400;
        const iterations = opts.iterations || 80;
        const nodeArr = Array.from(nodes.values());
        const n = nodeArr.length;
        if (n === 0) return;

        const area = width * height;
        const k = opts.k || Math.sqrt(area / n) * 0.8;

        // Initial placement: circular
        const cx = width / 2, cy = height / 2;
        const radius = Math.min(width, height) * 0.35;
        nodeArr.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / n;
            node.x = cx + radius * Math.cos(angle);
            node.y = cy + radius * Math.sin(angle);
        });

        // Build adjacency for quick lookup
        const adj = new Map();
        for (const node of nodeArr) adj.set(node.id, new Set());
        for (const e of edges) {
            if (adj.has(e.u)) adj.get(e.u).add(e.v);
            if (adj.has(e.v)) adj.get(e.v).add(e.u);
        }

        // Detect connected components
        const visited = new Set();
        const components = [];
        for (const node of nodeArr) {
            if (visited.has(node.id)) continue;
            const comp = [];
            const stack = [node.id];
            while (stack.length > 0) {
                const id = stack.pop();
                if (visited.has(id)) continue;
                visited.add(id);
                comp.push(id);
                for (const neighbor of (adj.get(id) || [])) {
                    if (!visited.has(neighbor)) stack.push(neighbor);
                }
            }
            components.push(comp);
        }

        // Temperature (max displacement per iteration)
        let temp = Math.max(width, height) * 0.1;
        const cooling = temp / (iterations + 1);

        const displacements = new Map();

        for (let iter = 0; iter < iterations; iter++) {
            // Initialize displacements
            for (const node of nodeArr) {
                displacements.set(node.id, { dx: 0, dy: 0 });
            }

            // Repulsive forces (all pairs within same component)
            for (const comp of components) {
                for (let i = 0; i < comp.length; i++) {
                    for (let j = i + 1; j < comp.length; j++) {
                        const u = nodes.get(comp[i]);
                        const v = nodes.get(comp[j]);
                        let dx = u.x - v.x;
                        let dy = u.y - v.y;
                        let dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1; }

                        const force = (k * k) / dist;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;

                        displacements.get(u.id).dx += fx;
                        displacements.get(u.id).dy += fy;
                        displacements.get(v.id).dx -= fx;
                        displacements.get(v.id).dy -= fy;
                    }
                }
            }

            // Attractive forces (edges)
            for (const e of edges) {
                const u = nodes.get(e.u);
                const v = nodes.get(e.v);
                if (!u || !v) continue;
                let dx = u.x - v.x;
                let dy = u.y - v.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.01) dist = 0.01;

                const force = (dist * dist) / k;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                displacements.get(u.id).dx -= fx;
                displacements.get(u.id).dy -= fy;
                displacements.get(v.id).dx += fx;
                displacements.get(v.id).dy += fy;
            }

            // Apply displacements with temperature limit
            for (const node of nodeArr) {
                const d = displacements.get(node.id);
                const dist = Math.sqrt(d.dx * d.dx + d.dy * d.dy);
                if (dist > 0) {
                    const cappedDist = Math.min(dist, temp);
                    node.x += (d.dx / dist) * cappedDist;
                    node.y += (d.dy / dist) * cappedDist;
                }
                // Keep within bounds
                node.x = Math.max(20, Math.min(width - 20, node.x));
                node.y = Math.max(20, Math.min(height - 20, node.y));
            }

            temp -= cooling;
            if (temp < 0.1) temp = 0.1;
        }
    }
}
