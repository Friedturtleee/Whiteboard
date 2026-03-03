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
        // Shift root so tree content starts at (x + pad, y + pad)
        // We use offset in draw instead
        this._offsetX = this.x + pad - bounds.x;
        this._offsetY = this.y + pad - bounds.y;
    }

    draw(ctx, camera) {
        if (!this.root) {
            // Draw placeholder
            this.applyStyle(ctx);
            ctx.save();
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
            offsetX: this._offsetX || this.x,
            offsetY: this._offsetY || this.y,
            opacity: this.opacity,
            saturation: this.saturation
        });
    }

    containsPoint(wx, wy, camera) {
        // First check node hit
        if (this.root) {
            const hitNode = TreeRenderer.hitTestNode(this.root, wx, wy, {
                nodeRadius: this.nodeRadius,
                offsetX: this._offsetX || this.x,
                offsetY: this._offsetY || this.y
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
        return TreeRenderer.hitTestNode(this.root, wx, wy, {
            nodeRadius: this.nodeRadius,
            offsetX: this._offsetX || this.x,
            offsetY: this._offsetY || this.y
        });
    }

    moveNodes(dx, dy) {
        // Move all internal nodes when the whole element is dragged
        this._offsetX = (this._offsetX || this.x) + dx;
        this._offsetY = (this._offsetY || this.y) + dy;
    }

    serialize() {
        return {
            ...super.serialize(),
            treeType: this.treeType,
            nodeRadius: this.nodeRadius,
            inputText: this.inputText,
            _offsetX: this._offsetX,
            _offsetY: this._offsetY
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.treeType = data.treeType || 'binary';
        this.nodeRadius = data.nodeRadius || 18;
        this.inputText = data.inputText || '';
        this._offsetX = data._offsetX;
        this._offsetY = data._offsetY;
        // Rebuild tree from saved text
        if (this.inputText) {
            this.buildFromText(this.inputText, this._detectMode(this.inputText));
            // Restore offsets
            if (data._offsetX !== undefined) {
                this._offsetX = data._offsetX;
                this._offsetY = data._offsetY;
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
