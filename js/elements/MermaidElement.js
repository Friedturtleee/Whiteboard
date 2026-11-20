import { Element } from '../core/Element.js';

const MAX_SVG_LENGTH = 2_000_000;
const MAX_INTRINSIC_DIMENSION = 10000;
const BLOCKED_SVG_ELEMENTS = new Set([
    'script', 'iframe', 'object', 'embed', 'link', 'base', 'audio', 'video', 'foreignobject'
]);

function hasExternalCssUrl(css) {
    if (/@import\b/i.test(css)) return true;
    for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
        if (!match[2].trim().startsWith('#')) return true;
    }
    return false;
}

function sanitizeSvg(svg) {
    if (typeof svg !== 'string' || svg.length > MAX_SVG_LENGTH || typeof DOMParser === 'undefined') return '';

    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = document.documentElement;
    if (!root || root.localName !== 'svg' || document.querySelector('parsererror')) return '';

    for (const element of [root, ...root.querySelectorAll('*')]) {
        if (BLOCKED_SVG_ELEMENTS.has(element.localName.toLowerCase())) {
            element.remove();
            continue;
        }
        for (const attribute of [...element.attributes]) {
            const name = attribute.localName.toLowerCase();
            const value = attribute.value.trim();
            if (name.startsWith('on') || name === 'src' ||
                ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#')) ||
                hasExternalCssUrl(value)) {
                element.removeAttributeNode(attribute);
            }
        }
        if (element.localName.toLowerCase() === 'style' && hasExternalCssUrl(element.textContent || '')) {
            element.remove();
        }
    }

    for (const dimension of ['width', 'height']) {
        const raw = root.getAttribute(dimension);
        if (raw == null) continue;
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value) || value <= 0) root.removeAttribute(dimension);
        else if (value > MAX_INTRINSIC_DIMENSION) root.setAttribute(dimension, String(MAX_INTRINSIC_DIMENSION));
    }

    return new XMLSerializer().serializeToString(root);
}

export class MermaidElement extends Element {
    constructor(x = 0, y = 0, svgString = '') {
        super('mermaid', x, y, 200, 200);
        this.svgString = '';
        this.img = null;
        this.label = 'Graph';
        // Source kept verbatim when the SVG is too large to sanitize/render, so
        // saving the board does not silently lose it. Drawn as a placeholder.
        this.oversizedSvgSource = null;
        if (svgString) {
            if (typeof svgString === 'string' && svgString.length > MAX_SVG_LENGTH) {
                this.oversizedSvgSource = svgString;
            } else {
                this.svgString = sanitizeSvg(svgString);
                if (this.svgString) this._loadSvg({ fitToImage: true });
            }
        }
    }

    _loadSvg({ fitToImage = false } = {}) {
        this.svgString = sanitizeSvg(this.svgString);
        if (!this.svgString) {
            this.img = null;
            return;
        }
        const blob = new Blob([this.svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const image = new Image();
        this.img = image;
        image.onload = () => {
            URL.revokeObjectURL(url);
            if (this.img !== image) return;
            if (fitToImage) {
                this.width = Math.min(image.width, MAX_INTRINSIC_DIMENSION);
                this.height = Math.min(image.height, MAX_INTRINSIC_DIMENSION);
            }
            // Try to trigger a render update
            window.__whiteboard?.renderer.markDirty();
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            if (this.img !== image) return;
            this.img = null;
            window.__whiteboard?.renderer.markDirty();
        };
        image.src = url;
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

        if (this.img && this.img.complete && this.img.width > 0) {
            ctx.drawImage(this.img, x, y, w, h);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = this.oversizedSvgSource ? '#f2a2a2' : '#fff';
            ctx.font = '12px sans-serif';
            ctx.fillText(this.oversizedSvgSource ? 'SVG 過大，無法顯示' : 'Rendering Graph...',
                x + 10, y + 20, Math.max(10, w - 20));
        }

        // Selection border is handled by Renderer
        ctx.restore();
    }

    serialize() {
        return {
            ...super.serialize(),
            // An oversized (unrenderable) source is persisted as-is.
            svgString: this.oversizedSvgSource ?? this.svgString
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.oversizedSvgSource = null;
        if (typeof data.svgString === 'string' && data.svgString.length > MAX_SVG_LENGTH) {
            // Too large to sanitize/render: keep the text and show a
            // placeholder instead of silently emptying the element.
            this.oversizedSvgSource = data.svgString;
            this.svgString = '';
            this.img = null;
            globalThis.window?.__whiteboard?.renderer.markDirty();
        } else {
            this.svgString = sanitizeSvg(data.svgString);
        }
        if (this.svgString) this._loadSvg();
        else if (!this.oversizedSvgSource) {
            this.img = null;
            globalThis.window?.__whiteboard?.renderer.markDirty();
        }
        return this;
    }

    static fromData(data) {
        return new MermaidElement(data.x, data.y);
    }
}
