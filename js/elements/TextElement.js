/**
 * TextElement — editable text on the canvas.
 * Bounding box exactly wraps all text including leading/trailing spaces.
 */
import { Element } from '../core/Element.js';

export class TextElement extends Element {
    constructor(x = 0, y = 0) {
        super('text', x, y, 100, 24);
        this.text = 'Text';
        this.fontSize = 16;
        this.fontFamily = "'Zen Maru Gothic', sans-serif";
        this.textAlign = 'left';
        this.isBold = false;
        this.isItalic = false;
        this.isUnderline = false;
        this.label = 'Text';
    }

    getFontString() {
        const style = this.isItalic ? 'italic ' : '';
        const weight = this.isBold ? 'bold ' : '';
        return `${style}${weight}${this.fontSize}px ${this.fontFamily}`;
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

        if (this.fillColor !== 'transparent') {
            ctx.fillRect(x, y, w, h);
        }

        const baseW = this._baseWidth || w;
        const baseH = this._baseHeight || h;
        const scaleX = baseW > 0 ? w / baseW : 1;
        const scaleY = baseH > 0 ? h / baseH : 1;

        ctx.translate(x, y);
        ctx.scale(scaleX, scaleY);

        ctx.fillStyle = this.getEffectiveColor(this.color);
        ctx.font = this.getFontString();
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        const lines = this.text.split('\n');
        const lineHeight = this.fontSize * 1.3;

        for (let i = 0; i < lines.length; i++) {
            const lineY = i * lineHeight;
            ctx.fillText(lines[i], 0, lineY);
            
            if (this.isUnderline) {
                const m = ctx.measureText(lines[i]);
                ctx.beginPath();
                ctx.moveTo(0, lineY + this.fontSize * 1.15);
                ctx.lineTo(m.width, lineY + this.fontSize * 1.15);
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = Math.max(1, this.fontSize * 0.08);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    autoSize(ctx) {
        ctx.save();
        ctx.font = this.getFontString();
        const lines = this.text.split('\n');
        const lineHeight = this.fontSize * 1.3;
        let maxWidth = 0;
        for (const line of lines) {
            const m = ctx.measureText(line);
            maxWidth = Math.max(maxWidth, m.width);
        }
        ctx.restore();
        
        const oldScaleX = (this._baseWidth && this._baseWidth > 0) ? this.width / this._baseWidth : 1;
        const oldScaleY = (this._baseHeight && this._baseHeight > 0) ? this.height / this._baseHeight : 1;
        
        const newBaseW = Math.max(this.fontSize, maxWidth);
        const newBaseH = Math.max(lineHeight, lines.length * lineHeight);
        
        this._baseWidth = newBaseW;
        this._baseHeight = newBaseH;
        this.width = newBaseW * oldScaleX;
        this.height = newBaseH * oldScaleY;
    }

    serialize() {
        return {
            ...super.serialize(),
            text: this.text,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            textAlign: this.textAlign,
            isBold: this.isBold,
            isItalic: this.isItalic,
            isUnderline: this.isUnderline,
            baseWidth: this._baseWidth,
            baseHeight: this._baseHeight
        };
    }

    static fromData(data) {
        const el = new TextElement(data.x, data.y);
        if (data.fontFamily && data.fontFamily.includes('Segoe UI')) {
            data.fontFamily = "'Zen Maru Gothic', sans-serif";
        }
        el.deserialize(data);
        el.isBold = !!data.isBold;
        el.isItalic = !!data.isItalic;
        el.isUnderline = !!data.isUnderline;
        el._baseWidth = data.baseWidth;
        el._baseHeight = data.baseHeight;
        return el;
    }
}
