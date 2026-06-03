import { Element } from '../core/Element.js';

export class TreeElement extends Element {
    constructor(x = 0, y = 0) {
        super('tree', x, y, 400, 300);
        this.treeType = 'binary';
        this.inputText = '';
        this.root = null;
        this.nodeRadius = 20;
        this.fontSize = 16;
        this.levelHeight = 60;
        this.nodeSpacing = 40;
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
            // CP style tree edges mode: "u v" (parent child)
            const lines = text.trim().split('\n');
            const nodes = {};
            const inDegree = {};
            let rootVal = null;
            let firstNode = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const parts = line.split(/\s+/);

                if (parts.length === 1) {
                    const val = isNaN(Number(parts[0])) ? parts[0] : Number(parts[0]);
                    if (i === 0) {
                        // Usually N (number of nodes). Keep as fallback root.
                        rootVal = val;
                        if (!nodes[val]) nodes[val] = { value: val, left: null, right: null };
                    }
                } else if (parts.length >= 2) {
                    const u = isNaN(Number(parts[0])) ? parts[0] : Number(parts[0]); // parent
                    const v = isNaN(Number(parts[1])) ? parts[1] : Number(parts[1]); // child

                    if (firstNode === null) firstNode = u;

                    if (!nodes[u]) nodes[u] = { value: u, left: null, right: null };
                    if (!nodes[v]) nodes[v] = { value: v, left: null, right: null };

                    // Append child
                    if (!nodes[u].left) nodes[u].left = nodes[v];
                    else if (!nodes[u].right) nodes[u].right = nodes[v];

                    inDegree[v] = (inDegree[v] || 0) + 1;
                    if (inDegree[u] === undefined) inDegree[u] = 0;
                }
            }

            // Find root: node with in-degree 0
            let bestRoot = null;
            let maxChildren = -1;
            
            for (const key of Object.keys(nodes)) {
                if (!inDegree[key]) {
                    const childCount = (nodes[key].left ? 1 : 0) + (nodes[key].right ? 1 : 0);
                    if (childCount > maxChildren) {
                        maxChildren = childCount;
                        bestRoot = key;
                    }
                }
            }
            
            if (bestRoot !== null) {
                this.root = nodes[bestRoot];
            } else if (rootVal !== null && nodes[rootVal]) {
                this.root = nodes[rootVal];
            } else if (firstNode !== null) {
                this.root = nodes[firstNode];
            } else {
                const allVals = Object.keys(nodes);
                if (allVals.length > 0) this.root = nodes[allVals[0]];
            }
        }

        if (!this.root) {
            this.width = 0;
            this.height = 0;
            return null;
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
        const levelHeight = this.levelHeight || 60;
        const nodeSpacing = this.nodeSpacing || 40;
        
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

    onResizeStart() {
        this._origW = this.width;
        this._origH = this.height;
        this._origRadius = this.nodeRadius;
        this._origFontSize = this.fontSize;
        this._origLevelHeight = this.levelHeight || 60;
        this._origNodeSpacing = this.nodeSpacing || 40;
        this._origNodes = new Map();
        
        const traverse = (n) => {
            if (!n) return;
            this._origNodes.set(n, { x: n.x, y: n.y });
            traverse(n.left);
            traverse(n.right);
        };
        traverse(this.root);
    }

    onResize(newW, newH) {
        if (!this._origW || !this._origH) return;
        const scaleX = newW / this._origW;
        const scaleY = newH / this._origH;
        const scale = Math.min(scaleX, scaleY);
        
        this.nodeRadius = Math.max(5, this._origRadius * scale);
        this.fontSize = Math.max(8, this._origFontSize * scale);
        this.levelHeight = Math.max(20, this._origLevelHeight * scaleY);
        this.nodeSpacing = Math.max(10, this._origNodeSpacing * scaleX);
        
        const traverse = (n) => {
            if (!n) return;
            const orig = this._origNodes.get(n);
            if (orig) {
                n.x = orig.x * scaleX;
                n.y = orig.y * scaleY;
            }
            traverse(n.left);
            traverse(n.right);
        };
        traverse(this.root);
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
