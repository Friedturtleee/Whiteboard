/**
 * Element — abstract base class for all whiteboard elements.
 */
const TRANSIENT_STATE_FIELDS = new Set([
    'img', 'nodes', 'root', 'selectedCells', 'selectedIndices', '_draggingNode',
    '_hoverEdge', '_lastCellKey', '_lastItemIdx', '_offsetX', '_offsetY',
    '_naturalW', '_naturalH', '_rendering', '_renderRevision',
    '_origCellHeight', '_origCellSize', '_origCellWidth', '_origNodePos',
    '_origNodeRadius', '_origResizeH', '_origResizeW',
    'isEditing', 'isEditingNode', 'isEditingEdge'
]);
const PERSISTED_INTERNAL_FIELDS = new Set([
    '_baseWidth', '_baseHeight', '_nextNodeId', '_relOffsetX', '_relOffsetY'
]);

export class Element {
    constructor(type, x = 0, y = 0, w = 100, h = 100) {
        this.id = crypto.randomUUID();
        this.type = type;
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
        this.rotation = 0;           // radians
        this.color = '#e0e0e0';
        this.fillColor = 'transparent';
        this.opacity = 1;            // 0..1
        this.saturation = 1;         // 0..1
        this.strokeWidth = 2;
        this.zIndex = Date.now();
        this.hidden = false;
        this.locked = false;
        this.label = type;
    }

    /** Override in subclasses */
    draw(ctx, camera) {}

    /** Get axis-aligned bounding box (before rotation) */
    getBounds() {
        return { x: this.x, y: this.y, w: this.width, h: this.height };
    }

    getRotationCenter() {
        return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
    }

    toLocalPoint(wx, wy) {
        if (!this.rotation) return { x: wx, y: wy };
        const { x: cx, y: cy } = this.getRotationCenter();
        const cos = Math.cos(-this.rotation), sin = Math.sin(-this.rotation);
        const dx = wx - cx, dy = wy - cy;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    }

    toWorldPoint(lx, ly) {
        if (!this.rotation) return { x: lx, y: ly };
        const { x: cx, y: cy } = this.getRotationCenter();
        const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
        const dx = lx - cx, dy = ly - cy;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    }

    getRotatedBounds() {
        const bounds = this.getBounds();
        if (!this.rotation) return bounds;
        const corners = [
            [bounds.x, bounds.y],
            [bounds.x + bounds.w, bounds.y],
            [bounds.x, bounds.y + bounds.h],
            [bounds.x + bounds.w, bounds.y + bounds.h]
        ].map(([x, y]) => this.toWorldPoint(x, y));
        const xs = corners.map(point => point.x);
        const ys = corners.map(point => point.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /**
     * Returns connection port positions in world coords, for line/arrow snapping.
     * Each port: { id, x, y }
     * Default: center + 4 cardinal points. Override for special shapes.
     */
    getConnectionPorts() {
        const b = this.getBounds();
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        return [
            { id: 'center', x: cx,          y: cy          },
            { id: 'top',    x: cx,          y: b.y         },
            { id: 'right',  x: b.x + b.w,  y: cy          },
            { id: 'bottom', x: cx,          y: b.y + b.h   },
            { id: 'left',   x: b.x,         y: cy          },
        ].map(port => ({ ...port, ...this.toWorldPoint(port.x, port.y) }));
    }

    /** Point-in-element test (world coords). Override for non-rect shapes. */
    containsPoint(wx, wy, camera) {
        const b = this.getBounds();
        const point = this.toLocalPoint(wx, wy);
        return point.x >= b.x && point.x <= b.x + b.w &&
            point.y >= b.y && point.y <= b.y + b.h;
    }

    /** Compute the effective color with saturation applied */
    getEffectiveColor(baseColor) {
        const c = baseColor || this.color;
        if (this.saturation >= 1) return c;
        // Parse hex to HSL, adjust saturation
        return this._adjustSaturation(c, this.saturation);
    }

    _adjustSaturation(hex, sat) {
        // Convert hex to rgb
        let r, g, b;
        if (hex.startsWith('#')) {
            const n = parseInt(hex.slice(1), 16);
            if (hex.length === 4) {
                r = ((n >> 8) & 0xf) * 17; g = ((n >> 4) & 0xf) * 17; b = (n & 0xf) * 17;
            } else {
                r = (n >> 16) & 0xff; g = (n >> 8) & 0xff; b = n & 0xff;
            }
        } else if (hex.startsWith('hsl')) {
            return hex; // already HSL, skip for simplicity
        } else {
            return hex;
        }
        // To HSL
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return `hsl(${Math.round(h * 360)}, ${Math.round(s * sat * 100)}%, ${Math.round(l * 100)}%)`;
    }

    /** Apply opacity + saturation before drawing */
    applyStyle(ctx) {
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = this.getEffectiveColor(this.color);
        ctx.fillStyle = this.fillColor !== 'transparent'
            ? this.getEffectiveColor(this.fillColor)
            : 'transparent';
        ctx.lineWidth = this.strokeWidth;
    }

    /** Serialize to plain object */
    serialize() {
        return {
            id: this.id, type: this.type,
            x: this.x, y: this.y, width: this.width, height: this.height,
            rotation: this.rotation, color: this.color, fillColor: this.fillColor,
            opacity: this.opacity, saturation: this.saturation,
            strokeWidth: this.strokeWidth, zIndex: this.zIndex,
            hidden: this.hidden, locked: this.locked, label: this.label
        };
    }

    /** Deserialize from plain object */
    deserialize(data) {
        // Imported JSON is untrusted: don't let serialized keys replace class
        // methods/accessors or invoke Object.prototype setters such as __proto__.
        const reservedKeys = new Set();
        for (let prototype = Object.getPrototypeOf(this); prototype; prototype = Object.getPrototypeOf(prototype)) {
            for (const key of Object.getOwnPropertyNames(prototype)) reservedKeys.add(key);
        }
        for (const [key, value] of Object.entries(data)) {
            if (reservedKeys.has(key) || TRANSIENT_STATE_FIELDS.has(key) ||
                (key.startsWith('_') && !PERSISTED_INTERNAL_FIELDS.has(key))) continue;
            this[key] = value;
        }
        return this;
    }

    /** Reset the global ID counter (No longer needed with UUID) */
    static resetIdCounter(maxId) {
        // No-op for backward compatibility
    }
}
