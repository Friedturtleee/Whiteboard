/**
 * TreeElement — tree visualization container element.
 * Supports: Binary Tree, BST, AVL, Red-Black Tree.
 * Can be created from text input or value list.
 */
import { Element } from '../core/Element.js';
import { MAX_TREE_INPUT_LENGTH, MAX_TREE_NODES, TreeParser } from './TreeParser.js';
import { TreeLayout } from './TreeLayout.js';
import { TreeRenderer } from './TreeRenderer.js';

export class TreeElement extends Element {
    constructor(x = 0, y = 0) {
        super('tree', x, y, 300, 200);
        this.treeType = 'tree';  // 'tree' | 'bst' | 'avl' | 'rb' | 'euler'
        this.root = null;
        this.nodeRadius = 18;
        this.inputText = '';
        this.label = 'Tree';
        this.hasWeights = false;
        this._nodeValueOverrides = {};
        this._edgeWeightOverrides = {};
        this._draggingNode = null;
    }

    /**
     * Build tree from text input.
     * @param {string} text
     * @param {string} mode - 'auto' (auto-detect) | 'parent' | 'edge' | 'values'
     * @returns {string|null} error message if validation fails, null on success
     */
    buildFromText(text, mode = 'auto') {
        const input = String(text ?? '');
        if (input.length > MAX_TREE_INPUT_LENGTH) {
            return '樹資料不可超過 1 MB。';
        }
        let result;

        if (mode === 'auto') {
            result = TreeParser.autoDetectAndParse(input, this.treeType);
        } else if (mode === 'rooted') {
            const lines = input
                .replace(/\r/g, '')
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);
            result = TreeParser.parseRootedFormat(lines);
        } else if (mode === 'parent') {
            const lines = input.trim().split('\n').map(l => l.trim()).filter(l => l);
            result = TreeParser.parseParentFormat(lines);
        } else if (mode === 'edge') {
            const lines = input.trim().split('\n').map(l => l.trim()).filter(l => l);
            result = TreeParser.parseEdgeFormat(lines);
        } else {
            // values mode
            const values = input.trim().split(/[\s,\n]+/).filter(v => v);
            if (values.length > MAX_TREE_NODES) {
                return '節點數不可超過 ' + MAX_TREE_NODES + '。';
            }
            if (this.treeType === 'avl') {
                result = TreeParser.buildAVL(values);
            } else if (this.treeType === 'rb') {
                result = TreeParser.buildRBTree(values);
            } else {
                result = TreeParser.buildBST(values);
            }
        }

        if (result?.error) return result.error;
        if (!result?.root) return input.trim() ? '無法建立樹，請檢查輸入格式。' : null;

        this.root = result.root;
        this.inputText = input;
        this.hasWeights = result.hasWeights || false;
        this._nodeValueOverrides = {};
        this._edgeWeightOverrides = {};
        // Compute Euler tour timestamps for euler tree type
        if (this.treeType === 'euler') {
            TreeParser.computeEulerTour(this.root);
        }
        this._layoutTree();
        return null;
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
            saturation: this.saturation,
            hasWeights: this.hasWeights
        });
        ctx.restore();
    }

    containsPoint(wx, wy, camera) {
        const point = this.toLocalPoint(wx, wy);
        // First check node hit
        if (this.root) {
            const { offsetX, offsetY } = this._getCurrentOffsets();
            const hitNode = TreeRenderer.hitTestNode(this.root, point.x, point.y, {
                nodeRadius: this.nodeRadius,
                offsetX, offsetY
            });
            if (hitNode) return true;

            // Check edge hit with wide tolerance
            const hitEdge = TreeRenderer.hitTestEdge(this.root, point.x, point.y, {
                nodeRadius: this.nodeRadius,
                offsetX, offsetY,
                tolerance: 12
            });
            if (hitEdge) return true;
        }
        // Fallback to bounding box
        return super.containsPoint(wx, wy, camera);
    }

    /**
     * Drag a specific tree node.
     */
    hitTestNode(wx, wy) {
        if (!this.root) return null;
        const point = this.toLocalPoint(wx, wy);
        const { offsetX, offsetY } = this._getCurrentOffsets();
        return TreeRenderer.hitTestNode(this.root, point.x, point.y, {
            nodeRadius: this.nodeRadius,
            offsetX, offsetY
        });
    }

    hitTestEdgeNode(wx, wy, tolerance = 12) {
        if (!this.root) return null;
        const point = this.toLocalPoint(wx, wy);
        const { offsetX, offsetY } = this._getCurrentOffsets();
        return TreeRenderer.hitTestEdgeNode(this.root, point.x, point.y, {
            nodeRadius: this.nodeRadius,
            offsetX,
            offsetY,
            tolerance
        });
    }

    /**
     * Connection ports = the actual tree nodes in world coordinates.
     */
    getConnectionPorts() {
        if (!this.root) return super.getConnectionPorts();
        const ports = [];
        const { offsetX, offsetY } = this._getCurrentOffsets();
        const visited = new Set();
        const usedPortIds = new Set();
        const pending = [{ node: this.root, path: 'r' }];
        while (pending.length) {
            const { node, path } = pending.pop();
            if (!node || node.value === null || visited.has(node)) continue;
            visited.add(node);
            const point = this.toWorldPoint(offsetX + node.x, offsetY + node.y);
            const legacyId = `node_${node.value}`;
            const id = usedPortIds.has(legacyId) ? `tree@${path}` : legacyId;
            usedPortIds.add(id);
            ports.push({ id, x: point.x, y: point.y });
            for (let index = (node.children?.length || 0) - 1; index >= 0; index--) {
                pending.push({ node: node.children[index], path: `${path}.${index}` });
            }
        }
        return ports;
    }

    moveNodes(dx, dy) {
        // No-op: offsets are now computed from this.x/this.y via _getCurrentOffsets()
    }

    /**
     * Snapshot state before resize drag begins.
     */
    onResizeStart() {
        this._origNodeRadius = this.nodeRadius;
        this._origResizeW = this.width;
        this._origResizeH = this.height;
    }

    captureResizeState() {
        const nodePositions = [];
        const pending = this.root ? [{ node: this.root, path: 'r' }] : [];
        const visited = new Set();
        while (pending.length) {
            const { node, path } = pending.pop();
            if (!node || visited.has(node)) continue;
            visited.add(node);
            nodePositions.push({ path, x: node.x, y: node.y });
            (node.children || []).forEach((child, index) => {
                if (child) pending.push({ node: child, path: `${path}.${index}` });
            });
        }
        return {
            nodeRadius: this.nodeRadius,
            nodePositions,
            relOffsetX: this._relOffsetX,
            relOffsetY: this._relOffsetY,
            offsetX: this._offsetX,
            offsetY: this._offsetY
        };
    }

    restoreResizeState(state) {
        if (!state) return;
        this.nodeRadius = state.nodeRadius;
        for (const { node, path, x, y } of state.nodePositions || []) {
            const currentNode = path ? this.getNodeAtPath(path) : node;
            if (!currentNode) continue;
            currentNode.x = x;
            currentNode.y = y;
        }
        this._relOffsetX = state.relOffsetX;
        this._relOffsetY = state.relOffsetY;
        this._offsetX = state.offsetX;
        this._offsetY = state.offsetY;
    }

    /**
     * Called when element is resized via handle. Rescales tree node radius.
     */
    onResize(newW, newH) {
        if (!this.root) return;
        const origW = this._origResizeW || this.width;
        const origH = this._origResizeH || this.height;
        const origR = this._origNodeRadius ?? this.nodeRadius;
        const scaleW = newW / origW;
        const scaleH = newH / origH;
        const scale = Math.min(scaleW, scaleH);
        this.nodeRadius = Math.max(8, Math.min(40, Math.round(origR * scale)));
        this._layoutTree();
    }

    setNodeValue(targetNode, value) {
        if (!this.root || !targetNode) return false;
        const pending = [{ node: this.root, path: 'r' }];
        const visited = new Set();
        while (pending.length) {
            const { node, path } = pending.pop();
            if (!node || visited.has(node)) continue;
            visited.add(node);
            if (node === targetNode) {
                node.value = value;
                this._nodeValueOverrides[path] = value;
                return true;
            }
            (node.children || []).forEach((child, index) => {
                if (child) pending.push({ node: child, path: `${path}.${index}` });
            });
        }
        return false;
    }

    getNodePath(targetNode) {
        if (!this.root || !targetNode) return null;
        const pending = [{ node: this.root, path: 'r' }];
        const visited = new Set();
        while (pending.length) {
            const { node, path } = pending.pop();
            if (!node || visited.has(node)) continue;
            visited.add(node);
            if (node === targetNode) return path;
            (node.children || []).forEach((child, index) => {
                if (child) pending.push({ node: child, path: `${path}.${index}` });
            });
        }
        return null;
    }

    getNodeAtPath(path) {
        if (!this.root || typeof path !== 'string' || !/^r(?:\.\d+)*$/.test(path)) return null;
        let node = this.root;
        for (const part of path.split('.').slice(1)) {
            node = node?.children?.[Number(part)];
            if (!node) return null;
        }
        return node;
    }

    setEdgeWeight(targetNode, value) {
        if (!this.root || !targetNode) return false;
        const pending = [{ node: this.root, path: 'r' }];
        const visited = new Set();
        while (pending.length) {
            const { node, path } = pending.pop();
            if (!node || visited.has(node)) continue;
            visited.add(node);
            if (node === targetNode) {
                if (path === 'r') return false;
                const weight = String(value ?? '').trim();
                if (weight && !Number.isFinite(Number(weight))) return false;
                node.meta ||= {};
                if (weight) {
                    node.meta.edgeWeight = weight;
                    this._edgeWeightOverrides[path] = weight;
                } else {
                    delete node.meta.edgeWeight;
                    this._edgeWeightOverrides[path] = null;
                }
                this.hasWeights = true;
                return true;
            }
            (node.children || []).forEach((child, index) => {
                if (child) pending.push({ node: child, path: `${path}.${index}` });
            });
        }
        return false;
    }

    _restoreNodeValueOverrides(overrides) {
        const entries = Object.entries(overrides || {});
        if (entries.length > MAX_TREE_NODES || (entries.length && !this.root)) {
            throw new TypeError('Saved tree node overrides are invalid.');
        }
        for (const [path, value] of entries) {
            if (!/^r(?:\.\d+)*$/.test(path) ||
                !(typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) ||
                (typeof value === 'string' && value.length > MAX_TREE_INPUT_LENGTH)) {
                throw new TypeError('Saved tree node overrides are invalid.');
            }
            let node = this.root;
            for (const part of path.split('.').slice(1)) {
                node = node?.children?.[Number(part)];
                if (!node) throw new TypeError('Saved tree node override path is invalid.');
            }
            node.value = value;
        }
        this._nodeValueOverrides = Object.fromEntries(entries);
    }

    _restoreEdgeWeightOverrides(overrides) {
        const entries = Object.entries(overrides || {});
        if (entries.length > MAX_TREE_NODES || (entries.length && !this.root)) {
            throw new TypeError('Saved tree edge-weight overrides are invalid.');
        }
        for (const [path, value] of entries) {
            const validValue = value === null ||
                typeof value === 'string' && value.length <= MAX_TREE_INPUT_LENGTH &&
                    (value === '' || Number.isFinite(Number(value))) ||
                typeof value === 'number' && Number.isFinite(value);
            if (!/^r(?:\.\d+)+$/.test(path) || !validValue) {
                throw new TypeError('Saved tree edge-weight overrides are invalid.');
            }
            let node = this.root;
            for (const part of path.split('.').slice(1)) {
                node = node?.children?.[Number(part)];
                if (!node) throw new TypeError('Saved tree edge-weight override path is invalid.');
            }
            node.meta ||= {};
            if (value === null || value === '') delete node.meta.edgeWeight;
            else node.meta.edgeWeight = String(value);
        }
        this._edgeWeightOverrides = Object.fromEntries(entries);
        if (entries.length) this.hasWeights = true;
    }

    serialize() {
        return {
            ...super.serialize(),
            treeType: this.treeType,
            nodeRadius: this.nodeRadius,
            inputText: this.inputText,
            hasWeights: this.hasWeights,
            nodeValueOverrides: { ...this._nodeValueOverrides },
            edgeWeightOverrides: { ...this._edgeWeightOverrides },
            _relOffsetX: this._relOffsetX,
            _relOffsetY: this._relOffsetY
        };
    }

    deserialize(data) {
        super.deserialize(data);
        // Reused elements (especially those updated by remote sync) must not
        // keep nodes or offsets from an older snapshot when the source is empty.
        this.root = null;
        this._offsetX = undefined;
        this._offsetY = undefined;
        const nodeValueOverrides = data.nodeValueOverrides || {};
        const edgeWeightOverrides = data.edgeWeightOverrides || {};
        if (!nodeValueOverrides || typeof nodeValueOverrides !== 'object' || Array.isArray(nodeValueOverrides)) {
            throw new TypeError('Saved tree node overrides are invalid.');
        }
        if (!edgeWeightOverrides || typeof edgeWeightOverrides !== 'object' || Array.isArray(edgeWeightOverrides)) {
            throw new TypeError('Saved tree edge-weight overrides are invalid.');
        }
        this.treeType = data.treeType || 'tree';
        this.nodeRadius = data.nodeRadius || 18;
        this.inputText = data.inputText || '';
        this.hasWeights = data.hasWeights || false;
        this._relOffsetX = data._relOffsetX;
        this._relOffsetY = data._relOffsetY;
        // Rebuild tree from saved text
        if (this.inputText) {
            let error = this.buildFromText(this.inputText, 'auto');
            // New editor entries use explicit rooted input regardless of the
            // display subtype; older auto-detection only recognized this form
            // for the generic tree type.
            if (error) error = this.buildFromText(this.inputText, 'rooted');
            if (error) throw new TypeError('Saved tree data is invalid: ' + error);
            // Restore relative offsets
            if (data._relOffsetX !== undefined) {
                this._relOffsetX = data._relOffsetX;
                this._relOffsetY = data._relOffsetY;
            }
        }
        this.hasWeights = Boolean(data.hasWeights) || this.hasWeights;
        this._restoreNodeValueOverrides(nodeValueOverrides);
        this._restoreEdgeWeightOverrides(edgeWeightOverrides);
        return this;
    }

    _detectMode(text) {
        return 'auto';
    }

    static fromData(data) {
        const el = new TreeElement(data.x, data.y);
        return el;
    }
}
