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

        // Run force-directed layout
        GraphLayout.layout(this.nodes, this.edges, {
            width: this.width - 40,
            height: this.height - 40,
            iterations: 80
        });

        // Offset node positions so they are relative to element origin
        // (layout gives positions in 0..width-40 range)
        return null;
    }

    /**
     * Add a new node at position (relative to element).
     */
    addNode(relX, relY) {
        while (this.nodes.has(String(this._nextNodeId))) {
            this._nextNodeId++;
        }
        const id = String(this._nextNodeId++);
        this.nodes.set(id, { id, x: relX, y: relY, label: id });
        return id;
    }

    _syncNextNodeId() {
        const numericIds = [...this.nodes.keys()]
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id >= 0);
        const nextFromNodes = numericIds.length ? Math.max(...numericIds) + 1 : 1;
        this._nextNodeId = Math.max(Number(this._nextNodeId) || 1, nextFromNodes);
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
        return super.containsPoint(wx, wy, camera);
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

    /**
     * Scale node positions proportionally when the element bounding box is resized.
     */
    onResize(newW, newH) {
        const origW = this._origResizeW;
        const origH = this._origResizeH;
        if (!origW || !origH || !this._origNodePos) return;
        // Interior area = element minus 20px padding on each side
        const scaleAxis = (nextSize, originalSize) => {
            if (!Number.isFinite(nextSize) || !Number.isFinite(originalSize) || originalSize <= 0) return 1;
            const ratio = originalSize > 40
                ? (nextSize - 40) / (originalSize - 40)
                : nextSize / originalSize;
            return Number.isFinite(ratio) ? Math.max(0.1, ratio) : 1;
        };
        const sx = scaleAxis(newW, origW);
        const sy = scaleAxis(newH, origH);
        for (const [id, node] of this.nodes) {
            const orig = this._origNodePos.get(id);
            if (orig) {
                node.x = orig.x * sx;
                node.y = orig.y * sy;
            }
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
            inputText: this.inputText,
            _nextNodeId: this._nextNodeId
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.directed = data.directed || false;
        this.zeroBased = data.zeroBased || false;
        this.graphMode = data.graphMode || 'edge-list';
        this.nodeRadius = data.nodeRadius || 20;
        this.inputText = data.inputText || '';
        this._nextNodeId = data._nextNodeId || 1;
        this.nodes = new Map();
        if (data.graphNodes) {
            for (const n of data.graphNodes) {
                this.nodes.set(n.id, n);
            }
        }
        this.edges = data.edges || [];
        this._syncNextNodeId();
        return this;
    }

    static fromData(data) {
        const el = new GraphElement(data.x, data.y);
        return el;
    }
}
