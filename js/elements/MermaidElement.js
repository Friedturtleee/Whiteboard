import { Element } from '../core/Element.js';

export class MermaidElement extends Element {
    constructor(x = 0, y = 0, svgString = '') {
        super('mermaid', x, y, 200, 200);
        this.svgString = svgString;
        this.img = null;
        this.label = 'Graph';
        if (svgString) this._loadSvg();
    }

    _loadSvg() {
        const blob = new Blob([this.svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        this.img = new Image();
        this.img.onload = () => {
            this.width = this.img.width;
            this.height = this.img.height;
            URL.revokeObjectURL(url);
            // Try to trigger a render update
            if (window.appInstance) {
                window.appInstance.renderer.markDirty();
            }
        };
        this.img.src = url;
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
            ctx.fillStyle = '#fff';
            ctx.font = '12px sans-serif';
            ctx.fillText('Rendering Graph...', x + 10, y + 20);
        }

        // Selection border is handled by Renderer
        ctx.restore();
    }

    serialize() {
        return {
            ...super.serialize(),
            svgString: this.svgString
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.svgString = data.svgString;
        if (this.svgString) this._loadSvg();
        return this;
    }

    static fromData(data) {
        return new MermaidElement(data.x, data.y, '').deserialize(data);
    }
}
