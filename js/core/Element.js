/**
 * Element — abstract base class for all whiteboard elements.
 */
let _nextId = 1;

export class Element {
    constructor(type, x = 0, y = 0, w = 100, h = 100) {
        this.id = _nextId++;
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
        this.zIndex = _nextId;
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
        ];
    }

    /** Point-in-element test (world coords). Override for non-rect shapes. */
    containsPoint(wx, wy, camera) {
        const b = this.getBounds();
        // Transform point into local space if rotated
        let lx = wx, ly = wy;
        if (this.rotation) {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const cos = Math.cos(-this.rotation);
            const sin = Math.sin(-this.rotation);
            const dx = wx - cx, dy = wy - cy;
            lx = cx + dx * cos - dy * sin;
            ly = cy + dx * sin + dy * cos;
        }
        return lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h;
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
        Object.assign(this, data);
        return this;
    }

    /** Reset the global ID counter (used after import) */
    static resetIdCounter(maxId) {
        _nextId = maxId + 1;
    }
}
