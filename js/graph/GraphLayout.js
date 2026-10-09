/**
 * Force-directed layout for graphs.
 *
 * The layout grows its working area with the node count, starts nodes on a
 * deterministic grid, and runs a final collision pass. This keeps the usual
 * spring layout while preventing dense inputs from collapsing into the canvas
 * boundaries or leaving nodes on top of each other.
 */
export class GraphLayout {
    static layout(nodes, edges = [], options = {}) {
        const requestedWidth = Number.isFinite(options.width)
            ? Math.max(1, options.width)
            : 400;
        const requestedHeight = Number.isFinite(options.height)
            ? Math.max(1, options.height)
            : 300;
        if (nodes.size === 0) return { width: requestedWidth, height: requestedHeight };

        const nodesArr = Array.from(nodes.values());
        const nodeIndex = new Map(nodesArr.map((node, index) => [node, index]));
        const nodeRadius = Number.isFinite(options.nodeRadius)
            ? Math.max(1, options.nodeRadius)
            : 20;
        const minDistance = Math.max(
            2 * nodeRadius + 8,
            options.minNodeDistance || 0
        );
        const dimensions = GraphLayout._fitArea(
            nodesArr.length,
            requestedWidth,
            requestedHeight,
            minDistance,
            options.aspectRatio
        );
        const width = dimensions.width;
        const height = dimensions.height;

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
        const degrees = new Array(nodesArr.length).fill(0);
        for (const edge of attractionEdges) {
            const firstIndex = nodeIndex.get(nodes.get(edge.u));
            const secondIndex = nodeIndex.get(nodes.get(edge.v));
            if (firstIndex !== undefined) degrees[firstIndex]++;
            if (secondIndex !== undefined) degrees[secondIndex]++;
        }
        const placementOrder = nodesArr.map((_, index) => index).sort((first, second) =>
            degrees[second] - degrees[first] || first - second
        );

        // Keep interactive previews responsive on dense/parallel-edge inputs.
        // Parallel edges still render individually, but only one attraction
        // force per endpoint pair is needed for the layout.
        const repulsionPairs = nodesArr.length * (nodesArr.length - 1) / 2;
        const estimatedWorkPerIteration = repulsionPairs + attractionEdges.length;
        const workBudget = Number.isFinite(options.workBudget) && options.workBudget > 0
            ? options.workBudget
            : 6000000;
        const budgetedIterations = Math.max(
            8,
            Math.floor(workBudget / Math.max(1, estimatedWorkPerIteration))
        );
        const requestedIterations = options.iterations === undefined
            ? 80
            : Number.isFinite(Number(options.iterations))
                ? Math.max(0, Math.floor(Number(options.iterations)))
                : 80;
        const iterations = Math.min(requestedIterations, budgetedIterations);

        if (nodesArr.length === 1) {
            const node = nodesArr[0];
            node.x = width / 2;
            node.y = height / 2;
            node.vx = 0;
            node.vy = 0;
            return { width, height };
        }

        const grid = GraphLayout._makeInitialGrid(nodesArr.length, width, height, minDistance);
        for (let gridIndex = 0; gridIndex < nodesArr.length; gridIndex++) {
            const node = nodesArr[placementOrder[gridIndex]];
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y) ||
                (node.x === 0 && node.y === 0)) {
                node.x = grid.positions[gridIndex].x;
                node.y = grid.positions[gridIndex].y;
            }
            node.vx = 0;
            node.vy = 0;
        }

        if (options.preservePositions && !GraphLayout._hasOverlaps(nodesArr, minDistance)) {
            return GraphLayout._ensureBounds(nodesArr, nodeRadius + 4, width, height);
        }

        const k = Math.sqrt((width * height) / nodesArr.length);
        const repel = distance => (k * k) / distance;
        const attract = distance => (distance * distance) / k;
        let temperature = Math.min(width, height) / 10;
        const margin = nodeRadius + 4;

        for (let iteration = 0; iteration < iterations; iteration++) {
            // Repulsion
            for (let a = 0; a < nodesArr.length; a++) {
                for (let b = a + 1; b < nodesArr.length; b++) {
                    const first = nodesArr[a];
                    const second = nodesArr[b];
                    let dx = first.x - second.x;
                    let dy = first.y - second.y;
                    if (dx === 0 && dy === 0) {
                        [dx, dy] = GraphLayout._stableDirection(a, b, 0.01);
                    }
                    const distance = Math.hypot(dx, dy) || 0.1;
                    const force = repel(distance);
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    first.vx += fx;
                    first.vy += fy;
                    second.vx -= fx;
                    second.vy -= fy;
                }
            }

            // Attraction
            for (const edge of attractionEdges) {
                const first = nodes.get(edge.u);
                const second = nodes.get(edge.v);
                if (!first || !second) continue;
                let dx = first.x - second.x;
                let dy = first.y - second.y;
                if (dx === 0 && dy === 0) {
                    const firstIndex = nodeIndex.get(first);
                    const secondIndex = nodeIndex.get(second);
                    [dx, dy] = GraphLayout._stableDirection(firstIndex, secondIndex, 0.01);
                }
                const distance = Math.hypot(dx, dy) || 0.1;
                const force = attract(distance);
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                first.vx -= fx;
                first.vy -= fy;
                second.vx += fx;
                second.vy += fy;
            }

            // Apply forces. The working area has enough capacity for the nodes;
            // clamping here keeps the spring simulation stable.
            for (const node of nodesArr) {
                const magnitude = Math.hypot(node.vx, node.vy) || 1;
                const displacement = Math.min(magnitude, temperature);
                node.x += (node.vx / magnitude) * displacement;
                node.y += (node.vy / magnitude) * displacement;
                node.vx = 0;
                node.vy = 0;
                node.x = Math.max(margin, Math.min(width - margin, node.x));
                node.y = Math.max(margin, Math.min(height - margin, node.y));
            }
            temperature *= 0.95;
        }

        GraphLayout._resolveOverlaps(nodesArr, minDistance, degrees, options.maxCollisionPasses);
        if (GraphLayout._hasOverlaps(nodesArr, minDistance)) {
            // A very dense complete graph can keep pulling a tight cluster
            // together faster than the local collision solver can untangle
            // it. Use a spaced grid only for that unresolved case.
            const grid = GraphLayout._makeInitialGrid(nodesArr.length, width, height, minDistance);
            for (let gridIndex = 0; gridIndex < nodesArr.length; gridIndex++) {
                const node = nodesArr[placementOrder[gridIndex]];
                node.x = grid.positions[gridIndex].x;
                node.y = grid.positions[gridIndex].y;
            }
            return { width, height };
        }
        if (options.preservePositions) {
            return GraphLayout._ensureBounds(nodesArr, margin, width, height);
        }
        return GraphLayout._normalizeAndMeasure(nodesArr, margin, width, height);
    }

    static _fitArea(count, width, height, minDistance, requestedAspectRatio) {
        // Keep the grid shape tied to the requested outer frame. Recomputing
        // the ratio from the expanded content area feeds the grid's rounded
        // row/column counts back into the next resize and can make repeated
        // shrink operations drift toward an extremely wide or tall frame.
        const aspectRatio = Number.isFinite(requestedAspectRatio) && requestedAspectRatio > 0
            ? requestedAspectRatio
            : width / height;
        const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspectRatio)));
        const rows = Math.ceil(count / columns);
        return {
            width: Math.max(width, columns * minDistance),
            height: Math.max(height, rows * minDistance)
        };
    }

    static _makeInitialGrid(count, width, height, minDistance) {
        const aspectRatio = width / height;
        const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspectRatio)));
        const rows = Math.ceil(count / columns);
        const spacingX = Math.max(minDistance, width / columns);
        const spacingY = Math.max(minDistance, height / rows);
        const gridWidth = spacingX * columns;
        const gridHeight = spacingY * rows;
        const left = (width - gridWidth) / 2 + spacingX / 2;
        const top = (height - gridHeight) / 2 + spacingY / 2;
        const positions = Array.from({ length: count }, (_, index) => ({
            x: left + (index % columns) * spacingX,
            y: top + Math.floor(index / columns) * spacingY
        }));
        const centerX = width / 2;
        const centerY = height / 2;
        positions.sort((first, second) => {
            const firstDistance = (first.x - centerX) ** 2 + (first.y - centerY) ** 2;
            const secondDistance = (second.x - centerX) ** 2 + (second.y - centerY) ** 2;
            return firstDistance - secondDistance || first.y - second.y || first.x - second.x;
        });
        return { positions };
    }

    /**
     * Resolve circle collisions with a spatial hash. Rebuilding the grid on
     * each pass keeps each node's candidate set local while nodes are moved.
     */
    static _resolveOverlaps(nodes, minDistance, degrees = null, requestedPasses = null) {
        const minDistanceSquared = minDistance * minDistance;
        const cellSize = minDistance;
        // Large force simulations can leave a few hundred close pairs behind.
        // A fixed 40 passes sent many 250+ node graphs back to the fallback
        // grid even when local separation was converging. Scale the budget
        // with graph size, with a cap to keep dense inputs responsive.
        const passes = Number.isFinite(requestedPasses)
            ? Math.max(0, Math.floor(requestedPasses))
            : Math.min(1000, Math.max(40, nodes.length * 2));

        for (let pass = 0; pass < passes; pass++) {
            const buckets = new Map();
            const nodeCells = new Array(nodes.length);
            const cellOf = node => ({
                x: Math.floor(node.x / cellSize),
                y: Math.floor(node.y / cellSize)
            });
            for (let index = 0; index < nodes.length; index++) {
                const cell = cellOf(nodes[index]);
                nodeCells[index] = cell;
                const key = `${cell.x},${cell.y}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(index);
            }

            let resolvedAny = false;
            for (let firstIndex = 0; firstIndex < nodes.length; firstIndex++) {
                const first = nodes[firstIndex];
                const cell = nodeCells[firstIndex];
                for (let offsetY = -1; offsetY <= 1; offsetY++) {
                    for (let offsetX = -1; offsetX <= 1; offsetX++) {
                        const neighbors = buckets.get(`${cell.x + offsetX},${cell.y + offsetY}`);
                        if (!neighbors) continue;
                        for (const secondIndex of neighbors) {
                            if (secondIndex <= firstIndex) continue;
                            const second = nodes[secondIndex];
                            let dx = second.x - first.x;
                            let dy = second.y - first.y;
                            let distanceSquared = dx * dx + dy * dy;
                            if (distanceSquared >= minDistanceSquared) continue;

                            if (distanceSquared < 1e-8) {
                                [dx, dy] = GraphLayout._stableDirection(firstIndex, secondIndex, 1);
                                distanceSquared = 1;
                            }
                            const distance = Math.sqrt(distanceSquared);
                            // Slight over-relaxation clears crowded clusters
                            // faster. High-degree nodes get less mobility so
                            // collision repair keeps graph hubs near the center.
                            const correction = (minDistance - distance + 0.01) * 1.2;
                            const firstMobility = degrees ? 1 / (1 + degrees[firstIndex]) : 1;
                            const secondMobility = degrees ? 1 / (1 + degrees[secondIndex]) : 1;
                            const mobilityTotal = firstMobility + secondMobility;
                            const firstPush = correction * firstMobility / mobilityTotal;
                            const secondPush = correction * secondMobility / mobilityTotal;
                            first.x -= dx / distance * firstPush;
                            first.y -= dy / distance * firstPush;
                            second.x += dx / distance * secondPush;
                            second.y += dy / distance * secondPush;
                            resolvedAny = true;
                        }
                    }
                }
            }
            if (!resolvedAny) break;
        }
    }

    static _hasOverlaps(nodes, minDistance) {
        const minDistanceSquared = minDistance * minDistance - 1e-6;
        if (nodes.some(node => !Number.isFinite(node.x) || !Number.isFinite(node.y))) {
            return true;
        }
        for (let first = 0; first < nodes.length; first++) {
            for (let second = first + 1; second < nodes.length; second++) {
                const dx = nodes[second].x - nodes[first].x;
                const dy = nodes[second].y - nodes[first].y;
                if (dx * dx + dy * dy < minDistanceSquared) return true;
            }
        }
        return false;
    }

    static hasOverlaps(nodes, minDistance) {
        const nodeList = nodes instanceof Map ? Array.from(nodes.values()) : nodes;
        return GraphLayout._hasOverlaps(nodeList, minDistance);
    }

    static _normalizeAndMeasure(nodes, margin, minimumWidth, minimumHeight) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const node of nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        }
        const width = Math.max(minimumWidth, maxX - minX + margin * 2);
        const height = Math.max(minimumHeight, maxY - minY + margin * 2);
        const offsetX = (width - (maxX - minX)) / 2 - minX;
        const offsetY = (height - (maxY - minY)) / 2 - minY;
        for (const node of nodes) {
            node.x += offsetX;
            node.y += offsetY;
        }
        return {
            width,
            height
        };
    }

    static _ensureBounds(nodes, margin, minimumWidth, minimumHeight) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const node of nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        }
        const offsetX = Math.max(0, margin - minX);
        const offsetY = Math.max(0, margin - minY);
        for (const node of nodes) {
            node.x += offsetX;
            node.y += offsetY;
        }
        return {
            width: Math.max(minimumWidth, maxX + offsetX + margin),
            height: Math.max(minimumHeight, maxY + offsetY + margin)
        };
    }

    static _stableDirection(firstIndex, secondIndex, magnitude) {
        // Antisymmetric, stable direction for a coincident node pair.
        const lowIndex = Math.min(firstIndex, secondIndex);
        const highIndex = Math.max(firstIndex, secondIndex);
        const seed = Math.imul(lowIndex + 1, 73856093) ^ Math.imul(highIndex + 1, 19349663);
        const angle = ((seed >>> 0) / 0x100000000) * Math.PI * 2;
        const sign = firstIndex <= secondIndex ? 1 : -1;
        return [Math.cos(angle) * magnitude * sign, Math.sin(angle) * magnitude * sign];
    }
}
