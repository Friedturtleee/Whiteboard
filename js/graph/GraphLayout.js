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
        const requestedIterations = Math.max(1, Math.floor(options.iterations || 80));

        const nodesArr = Array.from(nodes.values());
        const attractionEdges = [];
        const seenPairs = new Set();
        for (const edge of edges) {
            if (!nodes.has(edge.u) || !nodes.has(edge.v) || edge.u === edge.v) continue;
            const [u, v] = [String(edge.u), String(edge.v)].sort();
            const key = JSON.stringify([u, v]);
            if (seenPairs.has(key)) continue;
            seenPairs.add(key);
            attractionEdges.push(edge);
        }

        // Keep interactive previews responsive on dense/parallel-edge inputs.
        // Parallel edges still render individually, but their endpoints only
        // need one attraction force during layout.
        const repulsionPairs = nodesArr.length * (nodesArr.length - 1) / 2;
        const estimatedWorkPerIteration = repulsionPairs + attractionEdges.length;
        const workBudget = options.workBudget || 6000000;
        const budgetedIterations = Math.max(
            8,
            Math.floor(workBudget / Math.max(1, estimatedWorkPerIteration))
        );
        const iterations = Math.min(requestedIterations, budgetedIterations);

        // Initialize positions if not set
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) / 3;
        const angleStep = (2 * Math.PI) / (nodesArr.length || 1);
        
        for (let i = 0; i < nodesArr.length; i++) {
            const n = nodesArr[i];
            if (n.x === undefined || isNaN(n.x) || (n.x === 0 && n.y === 0)) {
                // Keep the initial layout deterministic so live preview does
                // not make every node jump to a new random position.
                const jitter = 4;
                n.x = cx + radius * Math.cos(i * angleStep) + Math.cos(i * 2.399) * jitter;
                n.y = cy + radius * Math.sin(i * angleStep) + Math.sin(i * 1.713) * jitter;
            }
            n.vx = 0;
            n.vy = 0;
        }

        const k = Math.sqrt((width * height) / nodesArr.length);
        const repel = (x) => (k * k) / x;
        const attract = (x) => (x * x) / k;
        let t = width / 10; // Initial temperature for cooling

        for (let i = 0; i < iterations; i++) {
            // Repulsion
            for (let a = 0; a < nodesArr.length; a++) {
                for (let b = a + 1; b < nodesArr.length; b++) {
                    const n1 = nodesArr[a];
                    const n2 = nodesArr[b];
                    let dx = n1.x - n2.x;
                    let dy = n1.y - n2.y;
                    if (dx === 0 && dy === 0) {
                        dx = (Math.random() - 0.5) * 0.1;
                        dy = (Math.random() - 0.5) * 0.1;
                    }
                    let dist = Math.hypot(dx, dy) || 0.1;
                    const force = repel(dist);
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    n1.vx += fx; n1.vy += fy;
                    n2.vx -= fx; n2.vy -= fy;
                }
            }
            // Attraction
            for (const e of attractionEdges) {
                const n1 = nodes.get(e.u);
                const n2 = nodes.get(e.v);
                if (!n1 || !n2) continue;
                let dx = n1.x - n2.x;
                let dy = n1.y - n2.y;
                if (dx === 0 && dy === 0) {
                    dx = (Math.random() - 0.5) * 0.1;
                    dy = (Math.random() - 0.5) * 0.1;
                }
                let dist = Math.hypot(dx, dy) || 0.1;
                const force = attract(dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                n1.vx -= fx; n1.vy -= fy;
                n2.vx += fx; n2.vy += fy;
            }
            // Apply forces
            for (const n of nodesArr) {
                // Limit maximum displacement by temperature
                const vMag = Math.hypot(n.vx, n.vy) || 1;
                const limit = Math.min(vMag, t);
                n.x += (n.vx / vMag) * limit;
                n.y += (n.vy / vMag) * limit;
                
                // Reset velocity
                n.vx = 0;
                n.vy = 0;
                
                // Bounds
                n.x = Math.max(20, Math.min(width - 20, n.x));
                n.y = Math.max(20, Math.min(height - 20, n.y));
            }
            t *= 0.95; // Cool down
        }
    }
}
