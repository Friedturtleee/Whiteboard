/**
 * TreeElement — tree visualization container element.
 * Supports: Binary Tree, BST, AVL, Red-Black Tree.
 * Can be created from text input or value list.
 */
import { Element } from '../core/Element.js';
import { TreeParser } from './TreeParser.js';
import { TreeLayout } from './TreeLayout.js';
import { TreeRenderer } from './TreeRenderer.js';

export class TreeElement extends Element {
    constructor(x = 0, y = 0) {
        super('tree', x, y, 300, 200);
        this.treeType = 'binary';  // 'binary' | 'bst' | 'avl' | 'rb'
        this.root = null;
        this.nodeRadius = 18;
        this.inputText = '';
        this.label = 'Tree';
        this._draggingNode = null;
    }

    /**
     * Build tree from text input.
     * @param {string} text
     * @param {string} mode - 'parent' (node/parent format) or 'values' (auto-build)
     * @returns {string|null} error message if validation fails, null on success
     */
    buildFromText(text, mode = 'parent') {
        this.inputText = text;
        let result;

        if (mode === 'parent') {
            result = TreeParser.parseParentFormat(text);
        } else {
            const values = text.trim().split(/[\s,\n]+/).filter(v => v);
            if (this.treeType === 'avl') {
                result = TreeParser.buildAVL(values);
            } else if (this.treeType === 'rb') {
                result = TreeParser.buildRBTree(values);
            } else {
                result = TreeParser.buildBST(values);
            }
        }

        if (result && result.root) {
            this.root = result.root;
            this._layoutTree();
        }

        return result?.error || null;
    }

    _layoutTree() {
        if (!this.root) return;
        TreeLayout.layout(this.root, {
            nodeSpacingX: this.nodeRadius * 2.5,
            levelSpacingY: this.nodeRadius * 3.5,
            startX: 0,
            startY: 0
        });

        // Update element bounds
        const bounds = TreeLayout.getBounds(this.root);
        const pad = this.nodeRadius + 10;
        this.width = bounds.w + pad * 2;
        this.height = bounds.h + pad * 2;
        // Store relative offsets (independent of position) so they survive drag
        this._relOffsetX = pad - bounds.x;
        this._relOffsetY = pad - bounds.y;
        this._offsetX = this.x + this._relOffsetX;
        this._offsetY = this.y + this._relOffsetY;
    }

    /** Compute current offsets based on element position */
    _getCurrentOffsets() {
        if (this._relOffsetX !== undefined) {
            return {
                offsetX: this.x + this._relOffsetX,
                offsetY: this.y + this._relOffsetY
            };
        }
        return {
            offsetX: this._offsetX || this.x,
            offsetY: this._offsetY || this.y
        };
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

        if (!this.root) {
            // Draw placeholder
            ctx.strokeStyle = this.getEffectiveColor(this.color);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.setLineDash([]);
            ctx.fillStyle = '#666';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('雙擊輸入樹結構', this.x + this.width / 2, this.y + this.height / 2);
            ctx.restore();
            return;
        }

        TreeRenderer.draw(ctx, this.root, {
            nodeRadius: this.nodeRadius,
            color: this.getEffectiveColor(this.color),
            treeType: this.treeType,
            offsetX: this._getCurrentOffsets().offsetX,
            offsetY: this._getCurrentOffsets().offsetY,
            opacity: this.opacity,
            saturation: this.saturation
        });
        ctx.restore();
    }

    containsPoint(wx, wy, camera) {
        // First check node hit
        if (this.root) {
            const { offsetX, offsetY } = this._getCurrentOffsets();
            const hitNode = TreeRenderer.hitTestNode(this.root, wx, wy, {
                nodeRadius: this.nodeRadius,
                offsetX, offsetY
            });
            if (hitNode) return true;
        }
        // Fallback to bounding box
        return super.containsPoint(wx, wy, camera);
    }

    /**
     * Drag a specific tree node.
     */
    hitTestNode(wx, wy) {
        if (!this.root) return null;
        const { offsetX, offsetY } = this._getCurrentOffsets();
        return TreeRenderer.hitTestNode(this.root, wx, wy, {
            nodeRadius: this.nodeRadius,
            offsetX, offsetY
        });
    }

    /**
     * Connection ports = the actual tree nodes in world coordinates.
     */
    getConnectionPorts() {
        if (!this.root) return super.getConnectionPorts();
        const ports = [];
        const { offsetX, offsetY } = this._getCurrentOffsets();
        const walk = (node) => {
            if (!node) return;
            ports.push({ id: `node_${node.value}`, x: offsetX + node.x, y: offsetY + node.y });
            walk(node.left);
            walk(node.right);
            if (node.children) node.children.forEach(walk);
        };
        walk(this.root);
        return ports;
    }

    moveNodes(dx, dy) {
        // No-op: offsets are now computed from this.x/this.y via _getCurrentOffsets()
    }

    /**
     * Called when element is resized via handle. Rescales tree node radius.
     */
    onResize(newW, newH) {
        if (!this.root) return;
        // Compute the tree's natural bounds at current nodeRadius
        const bounds = {
            w: this.width,
            h: this.height
        };
        // Scale nodeRadius proportionally to the smaller dimension ratio
        const scaleW = newW / (bounds.w || newW);
        const scaleH = newH / (bounds.h || newH);
        const scale = Math.min(scaleW, scaleH);
        this.nodeRadius = Math.max(8, Math.min(40, Math.round(this.nodeRadius * scale)));
        this._layoutTree();
    }

    serialize() {
        return {
            ...super.serialize(),
            treeType: this.treeType,
            nodeRadius: this.nodeRadius,
            inputText: this.inputText,
            _relOffsetX: this._relOffsetX,
            _relOffsetY: this._relOffsetY
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.treeType = data.treeType || 'binary';
        this.nodeRadius = data.nodeRadius || 18;
        this.inputText = data.inputText || '';
        this._relOffsetX = data._relOffsetX;
        this._relOffsetY = data._relOffsetY;
        // Rebuild tree from saved text
        if (this.inputText) {
            this.buildFromText(this.inputText, this._detectMode(this.inputText));
            // Restore relative offsets
            if (data._relOffsetX !== undefined) {
                this._relOffsetX = data._relOffsetX;
                this._relOffsetY = data._relOffsetY;
            }
        }
        return this;
    }

    _detectMode(text) {
        const lines = text.trim().split('\n');
        if (lines.length > 1) {
            const firstLine = lines[0].trim().split(/\s+/);
            if (firstLine.length === 1 && !isNaN(parseInt(firstLine[0]))) {
                return 'parent';
            }
        }
        return 'values';
    }

    static fromData(data) {
        const el = new TreeElement(data.x, data.y);
        return el;
    }
}
