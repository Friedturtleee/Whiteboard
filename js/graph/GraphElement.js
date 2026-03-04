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
        this.nodes = new Map();   // id → { id, x, y, label }
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
    buildFromText(text, directed = false) {
        this.inputText = text;
        this.directed = directed;
        const result = GraphParser.parse(text, directed);
        if (!result) return;

        this.nodes = result.nodes;
        this.edges = result.edges;

        // Run force-directed layout
        GraphLayout.layout(this.nodes, this.edges, {
            width: this.width - 40,
            height: this.height - 40,
            iterations: 80
        });

        // Offset node positions so they are relative to element origin
        // (layout gives positions in 0..width-40 range)
    }

    /**
     * Add a new node at position (relative to element).
     */
    addNode(relX, relY) {
        const id = String(this._nextNodeId++);
        this.nodes.set(id, { id, x: relX, y: relY, label: id });
        return id;
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
        // Check node hit first
        if (this.nodes.size > 0) {
            const hitNode = GraphRenderer.hitTestNode(this.nodes, wx, wy, {
                nodeRadius: this.nodeRadius,
                offsetX: this.x + 20,
                offsetY: this.y + 20
            });
            if (hitNode) return true;

            const hitEdge = GraphRenderer.hitTestEdge(this.nodes, this.edges, wx, wy, {
                offsetX: this.x + 20,
                offsetY: this.y + 20,
                tolerance: 8
            });
            if (hitEdge) return true;
        }
        return super.containsPoint(wx, wy, camera);
    }

    hitTestNode(wx, wy) {
        return GraphRenderer.hitTestNode(this.nodes, wx, wy, {
            nodeRadius: this.nodeRadius,
            offsetX: this.x + 20,
            offsetY: this.y + 20
        });
    }

    /**
     * Connection ports = the actual graph nodes in world coordinates.
     */
    getConnectionPorts() {
        if (this.nodes.size === 0) return super.getConnectionPorts();
        const ports = [];
        for (const [id, node] of this.nodes) {
            ports.push({
                id: `node_${id}`,
                x: this.x + 20 + node.x,
                y: this.y + 20 + node.y
            });
        }
        return ports;
    }

    moveNodes(dx, dy) {
        // This is called when the whole element is dragged — no need to move internal nodes
        // since they are drawn relative to (this.x, this.y)
    }

    serialize() {
        const nodesArr = [];
        for (const [id, node] of this.nodes) {
            nodesArr.push({ ...node });
        }
        return {
            ...super.serialize(),
            directed: this.directed,
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
        return this;
    }

    static fromData(data) {
        const el = new GraphElement(data.x, data.y);
        return el;
    }
}
