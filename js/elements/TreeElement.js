import { Element } from '../core/Element.js';

export class TreeElement extends Element {
    constructor(x = 0, y = 0) {
        super('tree', x, y, 400, 300);
        this.treeType = 'binary';
        this.inputText = '';
        this.root = null;
        this.nodeRadius = 20;
        this.fontSize = 16;
    }

    _detectMode(text) {
        const lines = text.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 1) return 'parent';
        }
        return 'values';
    }

    buildFromText(text, mode = 'values') {
        this.inputText = text;
        this.root = null;
        if (!text.trim()) {
            this.width = 0;
            this.height = 0;
            return null;
        }

        if (mode === 'values') {
            const values = text.trim().split(/[\s,]+/).map(v => isNaN(Number(v)) ? v : Number(v));
            if (this.treeType === 'bst' || this.treeType === 'avl' || this.treeType === 'rb') {
                for (const val of values) {
                    this.root = this._bstInsert(this.root, val);
                }
            } else {
                // simple level order
                if (values.length > 0) {
                    this.root = { value: values[0], left: null, right: null };
                    const queue = [this.root];
                    let i = 1;
                    while (i < values.length) {
                        const node = queue.shift();
                        if (i < values.length && values[i] !== 'null' && values[i] !== null) {
                            node.left = { value: values[i], left: null, right: null };
                            queue.push(node.left);
                        }
                        i++;
                        if (i < values.length && values[i] !== 'null' && values[i] !== null) {
                            node.right = { value: values[i], left: null, right: null };
                            queue.push(node.right);
                        }
                        i++;
                    }
                }
            }
        } else {
            // parent mode: "val parent"
            const lines = text.trim().split('\n');
            const nodes = {};
            let rootVal = null;
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length > 0 && parts[0]) {
                    const val = isNaN(Number(parts[0])) ? parts[0] : Number(parts[0]);
                    const parent = parts.length > 1 ? (isNaN(Number(parts[1])) ? parts[1] : Number(parts[1])) : null;
                    if (!nodes[val]) nodes[val] = { value: val, left: null, right: null };
                    if (parent) {
                        if (!nodes[parent]) nodes[parent] = { value: parent, left: null, right: null };
                        if (!nodes[parent].left) nodes[parent].left = nodes[val];
                        else if (!nodes[parent].right) nodes[parent].right = nodes[val];
                    } else {
                        rootVal = val;
                    }
                }
            }
            if (rootVal !== null && nodes[rootVal]) {
                this.root = nodes[rootVal];
            } else {
                const allVals = Object.keys(nodes);
                if (allVals.length > 0) this.root = nodes[allVals[0]];
            }
        }

        this._layoutTree();
        return null;
    }

    _bstInsert(node, val) {
        if (!node) return { value: val, left: null, right: null };
        if (val < node.value) node.left = this._bstInsert(node.left, val);
        else if (val > node.value) node.right = this._bstInsert(node.right, val);
        return node;
    }

    _layoutTree() {
        if (!this.root) return;
        const levelHeight = 60;
        const nodeSpacing = 40;
        
        const computePos = (node, depth, minX) => {
            if (!node) return minX;
            if (!node.left && !node.right) {
                node.x = minX + nodeSpacing;
                node.y = depth * levelHeight;
                return node.x;
            }
            const leftMax = node.left ? computePos(node.left, depth + 1, minX) : minX;
            const rightMax = node.right ? computePos(node.right, depth + 1, leftMax) : leftMax;
            
            node.x = (minX + rightMax + nodeSpacing) / 2;
            node.y = depth * levelHeight;
            return rightMax;
        };

        computePos(this.root, 0, 0);

        let minDx = Infinity, maxDx = -Infinity, maxDy = -Infinity;
        const traverse = (n) => {
            if(!n) return;
            minDx = Math.min(minDx, n.x);
            maxDx = Math.max(maxDx, n.x);
            maxDy = Math.max(maxDy, n.y);
            traverse(n.left);
            traverse(n.right);
        };
        traverse(this.root);

        const treeW = maxDx - minDx;
        const treeH = maxDy;
        
        this.width = Math.max(200, treeW + this.nodeRadius * 4);
        this.height = Math.max(150, treeH + this.nodeRadius * 4);

        const offsetX = this.width / 2 - (treeW / 2 + minDx);
        const offsetY = this.nodeRadius * 2;

        const applyOffset = (n) => {
            if(!n) return;
            n.x += offsetX;
            n.y += offsetY;
            applyOffset(n.left);
            applyOffset(n.right);
        };
        applyOffset(this.root);
    }

    _getCurrentOffsets() {
        return { offsetX: this.x, offsetY: this.y };
    }

    updateTextFromNodes() {
        // basic stub to avoid crash when edited inline
    }

    hitTestNode(wx, wy) {
        if (!this.root) return null;
        
        let found = null;
        let lx = wx - this.x;
        let ly = wy - this.y;
        
        if (this.rotation) {
            const cx = this.width / 2;
            const cy = this.height / 2;
            const dx = lx - cx;
            const dy = ly - cy;
            const cos = Math.cos(-this.rotation);
            const sin = Math.sin(-this.rotation);
            lx = dx * cos - dy * sin + cx;
            ly = dx * sin + dy * cos + cy;
        }

        const traverse = (n) => {
            if (!n || found) return;
            const dist = Math.hypot(n.x - lx, n.y - ly);
            if (dist <= this.nodeRadius) found = n;
            traverse(n.left);
            traverse(n.right);
        };
        traverse(this.root);
        return found;
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
        ctx.lineWidth = 2;
        const drawEdges = (n) => {
            if(!n) return;
            if (n.left) {
                ctx.beginPath();
                ctx.moveTo(n.x, n.y);
                ctx.lineTo(n.left.x, n.left.y);
                ctx.stroke();
                drawEdges(n.left);
            }
            if (n.right) {
                ctx.beginPath();
                ctx.moveTo(n.x, n.y);
                ctx.lineTo(n.right.x, n.right.y);
                ctx.stroke();
                drawEdges(n.right);
            }
        };
        drawEdges(this.root);

        // Nodes
        const drawNodes = (n) => {
            if(!n) return;
            ctx.beginPath();
            ctx.arc(n.x, n.y, this.nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#1e1e1e';
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = this.getEffectiveColor(this.color);
            ctx.font = `${this.fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.value, n.x, n.y);
            
            drawNodes(n.left);
            drawNodes(n.right);
        };
        drawNodes(this.root);

        ctx.restore();
    }

    serialize() {
        return {
            ...super.serialize(),
            treeType: this.treeType,
            inputText: this.inputText
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.treeType = data.treeType;
        this.buildFromText(data.inputText || '', this._detectMode(data.inputText || ''));
        return this;
    }

    static fromData(data) {
        return new TreeElement(data.x, data.y).deserialize(data);
    }
}
