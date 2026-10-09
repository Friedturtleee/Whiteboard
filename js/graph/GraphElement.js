/**
 * GraphElement — graph visualization container element.
 * Supports directed & undirected graphs, text-to-graph, draggable nodes.
 */
import { Element } from '../core/Element.js';
import { GraphParser } from './GraphParser.js';
import { GraphLayout } from './GraphLayout.js';
import { GraphRenderer } from './GraphRenderer.js';

export class GraphElement extends Element {
    constructor(x = 0, y = 0) {
        super('graph', x, y, 400, 350);
        this.directed = false;
        this.zeroBased = false;
        this.graphMode = 'edge-list';
        this.nodes = new Map();   // id → { id, x, y, label, nodeWeight }
        this.edges = [];          // [{ u, v, w?, directed }]
        this.nodeRadius = 20;
        this._layoutBaseWidth = this.width;
        this._layoutBaseHeight = this.height;
        this.inputText = '';
        this.label = 'Graph';
        this._draggingNode = null;
        this._nextNodeId = 1;
    }

    /**
     * Build graph from text input.
     */
    buildFromText(text, directed = false, zeroBased = false, graphMode = 'edge-list') {
        const result = GraphParser.parse(text, directed, zeroBased, graphMode);
        if (!result) return null;
        if (result.error) return result.error;

        this.inputText = text;
        this.directed = directed;
        this.zeroBased = zeroBased;
        this.graphMode = graphMode;
        this.nodes = result.nodes;
        this.edges = result.edges;
        this._syncNextNodeId();

        // Run force-directed layout. Larger graphs need a larger drawing area
        // so the spring layout does not compress every node against the frame.
        const layoutSize = GraphLayout.layout(this.nodes, this.edges, {
            width: this._layoutBaseWidth - 40,
            height: this._layoutBaseHeight - 40,
            aspectRatio: this._layoutBaseWidth / this._layoutBaseHeight,
            nodeRadius: this.nodeRadius,
            iterations: 80
        });
        this.width = layoutSize.width + 40;
        this.height = layoutSize.height + 40;

        // Offset node positions so they are relative to element origin
        // (layout gives positions in 0..width-40 range)
        return null;
    }

    /**
     * Add a new node at position (relative to element).
     */
    addNode(relX, relY) {
        this._syncNextNodeId();
        let nextId = this._nextNodeId;
        const firstId = nextId;
        while (this.nodes.has(String(nextId))) {
            nextId = nextId >= Number.MAX_SAFE_INTEGER ? 1 : nextId + 1;
            if (nextId === firstId) throw new Error('No available graph node ID.');
        }
        this._nextNodeId = nextId >= Number.MAX_SAFE_INTEGER ? 1 : nextId + 1;
        const id = String(nextId);
        this.nodes.set(id, { id, x: relX, y: relY, label: id });
        return id;
    }

    _syncNextNodeId() {
        const numericIds = [...this.nodes.keys()]
            .map(id => Number(id))
            .filter(id => Number.isSafeInteger(id) && id >= 0);
        const maxNodeId = numericIds.length ? Math.max(...numericIds) : -1;
        const nextFromNodes = maxNodeId >= Number.MAX_SAFE_INTEGER ? 1 : maxNodeId + 1;
        const savedNextId = Number.isSafeInteger(this._nextNodeId) && this._nextNodeId >= 1
            ? this._nextNodeId
            : 1;
        this._nextNodeId = Math.max(savedNextId, nextFromNodes);
    }

    /**
     * Add an edge between two node IDs.
     */
    addEdge(uId, vId, w = null) {
        this.edges.push({ u: uId, v: vId, w, directed: this.directed });
    }

    /**
     * Remove a node and its connected edges.
     */
    removeNode(nodeId) {
        this.nodes.delete(nodeId);
        this.edges = this.edges.filter(e => e.u !== nodeId && e.v !== nodeId);
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        ctx.save();
        if (this.rotation) {
            const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(this.rotation);
            ctx.translate(-cx, -cy);
        }

        if (this.nodes.size === 0 && this.edges.length === 0) {
            // Placeholder
            ctx.strokeStyle = this.getEffectiveColor(this.color);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.setLineDash([]);
            ctx.fillStyle = '#666';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('雙擊輸入圖結構', this.x + this.width / 2, this.y + this.height / 2);
            ctx.restore();
            return;
        }

        GraphRenderer.draw(ctx, this.nodes, this.edges, {
            nodeRadius: this.nodeRadius,
            color: this.getEffectiveColor(this.color),
            offsetX: this.x + 20,
            offsetY: this.y + 20,
            opacity: this.opacity,
            directed: this.directed
        });
        ctx.restore();
    }

    containsPoint(wx, wy, camera) {
        // Most pointer-move checks land inside the graph's selection box.
        // The base hit test is sufficient there and avoids scanning every
        // node and edge on large contest graphs just to return `true`.
        if (super.containsPoint(wx, wy, camera)) return true;

        const point = this.toLocalPoint(wx, wy);
        // Check node hit first
        if (this.nodes.size > 0) {
            const hitNode = GraphRenderer.hitTestNode(this.nodes, point.x, point.y, {
                nodeRadius: this.nodeRadius,
                offsetX: this.x + 20,
                offsetY: this.y + 20
            });
            if (hitNode) return true;

            const hitEdge = GraphRenderer.hitTestEdge(this.nodes, this.edges, point.x, point.y, {
                nodeRadius: this.nodeRadius,
                directed: this.directed,
                offsetX: this.x + 20,
                offsetY: this.y + 20,
                tolerance: 8
            });
            if (hitEdge) return true;
        }
        return false;
    }

    hitTestNode(wx, wy) {
        const point = this.toLocalPoint(wx, wy);
        return GraphRenderer.hitTestNode(this.nodes, point.x, point.y, {
            nodeRadius: this.nodeRadius,
            offsetX: this.x + 20,
            offsetY: this.y + 20
        });
    }

    hitTestEdge(wx, wy) {
        const point = this.toLocalPoint(wx, wy);
        return GraphRenderer.hitTestEdge(this.nodes, this.edges, point.x, point.y, {
            nodeRadius: this.nodeRadius,
            directed: this.directed,
            offsetX: this.x + 20,
            offsetY: this.y + 20,
            tolerance: 8
        });
    }

    /**
     * Connection ports = the actual graph nodes in world coordinates.
     */
    getConnectionPorts() {
        if (this.nodes.size === 0) return super.getConnectionPorts();
        const ports = [];
        for (const [id, node] of this.nodes) {
            const point = this.toWorldPoint(this.x + 20 + node.x, this.y + 20 + node.y);
            ports.push({
                id: `node_${id}`,
                x: point.x,
                y: point.y
            });
        }
        return ports;
    }

    moveNodes(dx, dy) {
        // This is called when the whole element is dragged — no need to move internal nodes
        // since they are drawn relative to (this.x, this.y)
    }

    /**
     * Snapshot node positions before a resize drag begins.
     */
    onResizeStart() {
        this._origResizeW = this.width;
        this._origResizeH = this.height;
        this._origNodePos = new Map();
        for (const [id, node] of this.nodes) {
            this._origNodePos.set(id, { x: node.x, y: node.y });
        }
    }

    captureResizeState() {
        const state = [...this.nodes.values()].map(node => ({
            id: String(node.id), x: node.x, y: node.y
        }));
        Object.defineProperty(state, 'layoutBaseSize', {
            value: { width: this._layoutBaseWidth, height: this._layoutBaseHeight }
        });
        return state;
    }

    restoreResizeState(state) {
        if (!state) return;
        if (state.layoutBaseSize) {
            this._layoutBaseWidth = state.layoutBaseSize.width;
            this._layoutBaseHeight = state.layoutBaseSize.height;
        }
        for (const { id, node, x, y } of state) {
            const currentNode = id !== undefined ? this.nodes.get(String(id)) : node;
            if (!currentNode) continue;
            currentNode.x = x;
            currentNode.y = y;
        }
    }

    /**
     * Scale node positions proportionally when the element bounding box is resized.
     */
    onResize(newW, newH) {
        this._layoutBaseWidth = Number.isFinite(newW)
            ? Math.max(40, newW)
            : this.width;
        this._layoutBaseHeight = Number.isFinite(newH)
            ? Math.max(40, newH)
            : this.height;
        const origW = this._origResizeW;
        const origH = this._origResizeH;
        let scaledPositionsOverlap = false;
        if (origW && origH && this._origNodePos) {
            // Interior area = element minus 20px padding on each side.
            const scaleAxis = (nextSize, originalSize) => {
                if (!Number.isFinite(nextSize) || !Number.isFinite(originalSize) || originalSize <= 0) return 1;
                const ratio = originalSize > 40
                    ? (nextSize - 40) / (originalSize - 40)
                    : nextSize / originalSize;
                return Number.isFinite(ratio) ? Math.max(0.1, ratio) : 1;
            };
            const sx = scaleAxis(newW, origW);
            const sy = scaleAxis(newH, origH);
            const scaledPositions = [...this.nodes].map(([id, node]) => {
                const original = this._origNodePos.get(id);
                return original
                    ? { x: original.x * sx, y: original.y * sy }
                    : { x: node.x, y: node.y };
            });
            scaledPositionsOverlap = GraphLayout.hasOverlaps(
                scaledPositions,
                this.nodeRadius * 2 + 8
            );
            for (const [id, node] of this.nodes) {
                const orig = this._origNodePos.get(id);
                if (orig) {
                    node.x = orig.x * sx;
                    node.y = orig.y * sy;
                }
            }
        }

        // Resizing can compress fixed-size node circles into one another.
        // Reflow them and let the element grow if the requested frame is too
        // small to hold the graph at its minimum node spacing.
        if (this.nodes.size > 0) {
            const layoutSize = GraphLayout.layout(this.nodes, this.edges, {
                width: this._layoutBaseWidth - 40,
                height: this._layoutBaseHeight - 40,
                aspectRatio: this._layoutBaseWidth / this._layoutBaseHeight,
                nodeRadius: this.nodeRadius,
                iterations: 0,
                // Keep each pointer-move reflow bounded. If a large resize
                // leaves unresolved collisions, GraphLayout uses its spaced
                // grid fallback before returning, so nodes still stay clear.
                maxCollisionPasses: scaledPositionsOverlap ? 40 : undefined
            });
            this.width = layoutSize.width + 40;
            this.height = layoutSize.height + 40;
        }
    }

    serialize() {
        const nodesArr = [];
        for (const [id, node] of this.nodes) {
            nodesArr.push({ ...node });
        }
        return {
            ...super.serialize(),
            directed: this.directed,
            zeroBased: this.zeroBased,
            graphMode: this.graphMode,
            graphNodes: nodesArr,
            edges: this.edges,
            nodeRadius: this.nodeRadius,
            _layoutBaseWidth: this._layoutBaseWidth,
            _layoutBaseHeight: this._layoutBaseHeight,
            inputText: this.inputText,
            _nextNodeId: this._nextNodeId
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this._origResizeW = undefined;
        this._origResizeH = undefined;
        this._origNodePos = null;
        this.directed = data.directed || false;
        this.zeroBased = data.zeroBased || false;
        this.graphMode = data.graphMode || 'edge-list';
        this.nodeRadius = Number.isFinite(data.nodeRadius)
            ? Math.max(1, Math.min(200, data.nodeRadius))
            : 20;
        const savedBaseWidth = Number(data._layoutBaseWidth);
        const savedBaseHeight = Number(data._layoutBaseHeight);
        this._layoutBaseWidth = Number.isFinite(savedBaseWidth) && savedBaseWidth >= 40 && savedBaseWidth <= 1e7
            ? savedBaseWidth
            : this.width;
        this._layoutBaseHeight = Number.isFinite(savedBaseHeight) && savedBaseHeight >= 40 && savedBaseHeight <= 1e7
            ? savedBaseHeight
            : this.height;
        this.inputText = data.inputText || '';
        this._nextNodeId = Number.isSafeInteger(data._nextNodeId) && data._nextNodeId >= 1
            ? data._nextNodeId
            : 1;
        this.nodes = new Map();
        if (data.graphNodes) {
            for (const n of data.graphNodes) {
                const id = String(n.id);
                this.nodes.set(id, { ...n, id });
            }
        }
        this.edges = (data.edges || []).map(edge => ({
            ...edge,
            u: String(edge.u),
            v: String(edge.v)
        }));
        this._syncNextNodeId();

        // Older or externally authored boards may contain nodes at the same
        // coordinates. Repair only those layouts so valid saved positions
        // remain untouched during import.
        const nodeList = [...this.nodes.values()];
        const padding = this.nodeRadius + 4;
        const contentWidth = this.width - 40;
        const contentHeight = this.height - 40;
        const hasOverlaps = GraphLayout.hasOverlaps(nodeList, this.nodeRadius * 2 + 8);
        const hasNodesOutsideFrame = nodeList.some(node =>
            node.x < padding || node.y < padding ||
            node.x > contentWidth - padding || node.y > contentHeight - padding
        );
        if (hasOverlaps || hasNodesOutsideFrame) {
            const layoutSize = GraphLayout.layout(this.nodes, this.edges, {
                width: Math.max(1, this.width - 40),
                height: Math.max(1, this.height - 40),
                aspectRatio: this._layoutBaseWidth / this._layoutBaseHeight,
                nodeRadius: this.nodeRadius,
                iterations: 0,
                preservePositions: true
            });
            this.width = Math.max(this.width, layoutSize.width + 40);
            this.height = Math.max(this.height, layoutSize.height + 40);
        }
        return this;
    }

    static fromData(data) {
        const el = new GraphElement(data.x, data.y);
        return el;
    }
}
