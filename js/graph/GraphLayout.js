export class GraphLayout {
    /**
     * Run a simple force-directed layout on the given nodes and edges.
     * @param {Map} nodes Map of node objects { id, x, y, ... }
     * @param {Array} edges Array of edge objects { u, v, ... }
     * @param {Object} options Layout options
     */
    static layout(nodes, edges, options = {}) {
        if (nodes.size === 0) return;

        const width = options.width || 400;
        const height = options.height || 300;
        const iterations = options.iterations || 80;

        const nodesArr = Array.from(nodes.values());

        // Initialize positions if not set
        for (const n of nodesArr) {
            if (n.x === undefined || isNaN(n.x)) n.x = Math.random() * width;
            if (n.y === undefined || isNaN(n.y)) n.y = Math.random() * height;
            n.vx = 0;
            n.vy = 0;
        }

        const k = Math.sqrt((width * height) / nodesArr.length);
        const repel = (x) => (k * k) / x;
        const attract = (x) => (x * x) / k;

        for (let i = 0; i < iterations; i++) {
            // Repulsion
            for (let a = 0; a < nodesArr.length; a++) {
                for (let b = a + 1; b < nodesArr.length; b++) {
                    const n1 = nodesArr[a];
                    const n2 = nodesArr[b];
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    let dist = Math.hypot(dx, dy) || 1;
                    const force = repel(dist);
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    n1.vx += fx; n1.vy += fy;
                    n2.vx -= fx; n2.vy -= fy;
                }
            }
            // Attraction
            for (const e of edges) {
                const n1 = nodes.get(e.u);
                const n2 = nodes.get(e.v);
                if (!n1 || !n2) continue;
                const dx = n1.x - n2.x;
                const dy = n1.y - n2.y;
                let dist = Math.hypot(dx, dy) || 1;
                const force = attract(dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                n1.vx -= fx; n1.vy -= fy;
                n2.vx += fx; n2.vy += fy;
            }
            // Apply forces
            for (const n of nodesArr) {
                n.x += n.vx;
                n.y += n.vy;
                n.vx *= 0.8; // friction
                n.vy *= 0.8;
                // Bounds
                n.x = Math.max(0, Math.min(width, n.x));
                n.y = Math.max(0, Math.min(height, n.y));
            }
        }
    }
}
