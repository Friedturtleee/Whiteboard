/**
 * TextElement — editable text on the canvas.
 */
import { Element } from '../core/Element.js';

export class TextElement extends Element {
    constructor(x = 0, y = 0) {
        super('text', x, y, 160, 40);
        this.text = 'Text';
        this.fontSize = 16;
        this.fontFamily = 'Segoe UI, sans-serif';
        this.textAlign = 'left';
        this.label = 'Text';
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

        // Background fill
        if (this.fillColor !== 'transparent') {
            ctx.fillRect(x, y, w, h);
        }

        // Text
        ctx.fillStyle = this.getEffectiveColor(this.color);
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = this.textAlign;

        const padding = 4;
        const lines = this.text.split('\n');
        const lineHeight = this.fontSize * 1.3;
        let tx = x + padding;
        if (this.textAlign === 'center') tx = x + w / 2;
        else if (this.textAlign === 'right') tx = x + w - padding;

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], tx, y + padding + i * lineHeight, w - padding * 2);
        }

        ctx.restore();
    }

    /** Auto-size height based on text content */
    autoSize(ctx) {
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        const lines = this.text.split('\n');
        const lineHeight = this.fontSize * 1.3;
        let maxWidth = 0;
        for (const line of lines) {
            maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
        }
        this.width = Math.max(60, maxWidth + 16);
        this.height = Math.max(30, lines.length * lineHeight + 12);
    }

    serialize() {
        return {
            ...super.serialize(),
            text: this.text,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            textAlign: this.textAlign
        };
    }

    static fromData(data) {
        const el = new TextElement(data.x, data.y);
        return el;
    }
}
