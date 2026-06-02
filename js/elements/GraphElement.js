import { Element } from '../core/Element.js';

export class GraphElement extends Element {
    constructor(x = 0, y = 0) {
        super('graph', x, y, 400, 300);
        this.inputText = '';
        this.directed = false;
        this.nodes = new Map(); // id -> { id, label, x, y, vx, vy }
        this.edges = []; // { u, v, w }
        this.nodeRadius = 20;
        this.fontSize = 16;
        this._simulationRunning = false;
    }

    buildFromText(text, directed = false) {
        this.inputText = text;
        this.directed = directed;
        this.nodes.clear();
        this.edges = [];
        if (!text.trim()) {
            this.width = 0;
            this.height = 0;
            return null;
        }

        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) {
            this.width = 0;
            this.height = 0;
            return null;
        }

        // Skip first line if it matches N M format (two integers)
        let startIdx = 0;
        const firstLineParts = lines[0].split(/\s+/);
        if (firstLineParts.length === 2 && !isNaN(firstLineParts[0]) && !isNaN(firstLineParts[1])) {
            startIdx = 1;
        }

        for (let i = startIdx; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts.length >= 2) {
                const u = parts[0];
                const v = parts[1];
                const w = parts.length >= 3 ? parts[2] : null;

                if (!this.nodes.has(u)) this.nodes.set(u, this._createNode(u));
                if (!this.nodes.has(v)) this.nodes.set(v, this._createNode(v));

                this.edges.push({ u, v, w });
            }
        }

        this._layoutGraph();
        return null;
    }

    _createNode(id) {
        // Random initial position within bounds
        return {
            id,
            label: id,
            dx: Math.random() * (this.width - 40) + 20,
            dy: Math.random() * (this.height - 40) + 20,
            vx: 0,
            vy: 0
        };
    }

    _layoutGraph() {
        if (this.nodes.size === 0) return;

        // A simple force-directed layout iteration
        const nodes = Array.from(this.nodes.values());
        const k = Math.sqrt((this.width * this.height) / nodes.length);
        const repel = (x) => (k * k) / x;
        const attract = (x) => (x * x) / k;

        for (let i = 0; i < 50; i++) {
            // Repulsion
            for (let a = 0; a < nodes.length; a++) {
                for (let b = a + 1; b < nodes.length; b++) {
                    const n1 = nodes[a];
                    const n2 = nodes[b];
                    const dx = n1.dx - n2.dx;
                    const dy = n1.dy - n2.dy;
                    let dist = Math.hypot(dx, dy) || 1;
                    const force = repel(dist);
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    n1.vx += fx; n1.vy += fy;
                    n2.vx -= fx; n2.vy -= fy;
                }
            }

            // Attraction
            for (const e of this.edges) {
                const n1 = this.nodes.get(e.u);
                const n2 = this.nodes.get(e.v);
                if (!n1 || !n2) continue;
                const dx = n1.dx - n2.dx;
                const dy = n1.dy - n2.dy;
                let dist = Math.hypot(dx, dy) || 1;
                const force = attract(dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                n1.vx -= fx; n1.vy -= fy;
                n2.vx += fx; n2.vy += fy;
            }

            // Apply forces
            for (const n of nodes) {
                const maxD = 10;
                const v = Math.hypot(n.vx, n.vy);
                if (v > maxD) {
                    n.vx = (n.vx / v) * maxD;
                    n.vy = (n.vy / v) * maxD;
                }
                n.dx += n.vx;
                n.dy += n.vy;
                n.vx = 0;
                n.vy = 0;

                // Constrain to box
                n.dx = Math.max(this.nodeRadius + 10, Math.min(this.width - this.nodeRadius - 10, n.dx));
                n.dy = Math.max(this.nodeRadius + 10, Math.min(this.height - this.nodeRadius - 10, n.dy));
            }
        }
    }

    draw(ctx, camera) {
        this.applyStyle(ctx);
        const { x, y, width: w, height: h, rotation } = this;

        ctx.save();
        if (rotation) {
            const cx = x + w / 2, cy = y + h / 2;
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            ctx.translate(-cx, -cy);
        }

        ctx.translate(x, y);

        // Edges
        ctx.strokeStyle = this.color || 'var(--accent)';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 2;
        ctx.font = `14px sans-serif`;
        
        for (const e of this.edges) {
            const n1 = this.nodes.get(e.u);
            const n2 = this.nodes.get(e.v);
            if (!n1 || !n2) continue;

            const dx = n2.dx - n1.dx;
            const dy = n2.dy - n1.dy;
            const dist = Math.hypot(dx, dy);
            
            ctx.beginPath();
            ctx.moveTo(n1.dx, n1.dy);
            ctx.lineTo(n2.dx, n2.dy);
            ctx.stroke();

            // Draw arrow if directed
            if (this.directed && dist > this.nodeRadius * 2) {
                const arrowSize = 10;
                const ratio = (dist - this.nodeRadius) / dist;
                const ax = n1.dx + dx * ratio;
                const ay = n1.dy + dy * ratio;
                const angle = Math.atan2(dy, dx);
                
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax - arrowSize * Math.cos(angle - Math.PI/6), ay - arrowSize * Math.sin(angle - Math.PI/6));
                ctx.lineTo(ax - arrowSize * Math.cos(angle + Math.PI/6), ay - arrowSize * Math.sin(angle + Math.PI/6));
                ctx.fill();
            }

            // Draw weight
            if (e.w) {
                const mx = (n1.dx + n2.dx) / 2;
                const my = (n1.dy + n2.dy) / 2;
                const textW = ctx.measureText(e.w).width;
                ctx.fillStyle = '#1e1e1e';
                ctx.fillRect(mx - textW/2 - 2, my - 8, textW + 4, 16);
                ctx.fillStyle = this.getEffectiveColor(this.color);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(e.w, mx, my);
            }
        }

        // Nodes
        for (const n of this.nodes.values()) {
            ctx.beginPath();
            ctx.arc(n.dx, n.dy, this.nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#1e1e1e';
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = this.getEffectiveColor(this.color);
            ctx.font = `${this.fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.label, n.dx, n.dy);
            ctx.strokeStyle = this.color || 'var(--accent)'; // this might fail but it's set per edge earlier
        }

        ctx.restore();
    }

    serialize() {
        return {
            ...super.serialize(),
            directed: this.directed,
            inputText: this.inputText
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.directed = data.directed;
        this.buildFromText(data.inputText || '', this.directed);
        return this;
    }

    static fromData(data) {
        return new GraphElement(data.x, data.y).deserialize(data);
    }
}
