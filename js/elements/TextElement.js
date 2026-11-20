/**
 * TextElement — editable text on the canvas.
 * Bounding box exactly wraps all text including leading/trailing spaces.
 */
import { Element } from '../core/Element.js';
import { getLocalViewport } from '../canvas/Viewport.js';
import { measureCanvasText, getCanvasTextCacheVersion } from '../core/CanvasTextFit.js';

const MAX_ELEMENT_DIMENSION = 10_000_000;

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

    _getLines() {
        if (this._linesText !== this.text) {
            this._linesText = this.text;
            this._lines = this.text.split('\n');
        }
        return this._lines;
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
        if (this.isEditing) {
            ctx.restore();
            return;
        }

        const baseW = this._baseWidth || w;
        const baseH = this._baseHeight || h;
        const scaleX = baseW > 0 ? w / baseW : 1;
        const scaleY = baseH > 0 ? h / baseH : 1;

        ctx.translate(x, y);
        ctx.scale(scaleX, scaleY);

        ctx.fillStyle = this.getEffectiveColor(this.color);
        ctx.font = this.getFontString();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        const lines = this._getLines();
        const lineHeight = this.fontSize * 1.3;
        const metrics = measureCanvasText(ctx, 'Mg');
        const ascent = metrics?.fontBoundingBoxAscent ?? this.fontSize;
        const descent = metrics?.fontBoundingBoxDescent ?? this.fontSize * 0.25;
        const baseline = (lineHeight - ascent - descent) / 2 + ascent;

        // Skip offscreen rows, including rotated and nonuniformly scaled text.
        let firstLine = 0, lastLine = lines.length;
        const viewport = getLocalViewport(ctx);
        if (viewport) {
            firstLine = Math.max(0, Math.floor(viewport.minY / lineHeight) - 1);
            lastLine = Math.min(lines.length, Math.ceil(viewport.maxY / lineHeight) + 1);
        }
        const transform = ctx.getTransform?.();
        const screenScale = transform ? Math.hypot(transform.c, transform.d) : 1;
        const stride = Math.max(1, Math.floor(0.5 / (lineHeight * screenScale)));
        for (let i = firstLine; i < lastLine; i += stride) {
            const lineY = i * lineHeight;
            ctx.fillText(lines[i], 0, lineY + baseline);
            
            if (this.isUnderline) {
                const m = measureCanvasText(ctx, lines[i]);
                ctx.beginPath();
                ctx.moveTo(0, lineY + this.fontSize * 1.15);
                ctx.lineTo(m?.width ?? 0, lineY + this.fontSize * 1.15);
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = Math.max(1, this.fontSize * 0.08);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    autoSize(ctx) {
        const previousWidth = this.width, previousHeight = this.height;
        ctx.save();
        ctx.font = this.getFontString();
        const lines = this._getLines();
        const lineHeight = this.fontSize * 1.3;
        const version = getCanvasTextCacheVersion();
        const measurementKey = `${ctx.font}|${ctx.fontKerning || ''}|${ctx.letterSpacing || ''}|${ctx.wordSpacing || ''}`;
        const reusable = this._measureContext === ctx && this._measurementKey === measurementKey &&
            this._measurementVersion === version;
        const oldLines = reusable ? this._measuredLines : null;
        const oldWidths = reusable ? this._measuredWidths : null;
        let firstChanged = 0, oldEnd = oldLines?.length || 0, newEnd = lines.length;
        if (oldLines) {
            while (firstChanged < oldEnd && firstChanged < newEnd && oldLines[firstChanged] === lines[firstChanged]) firstChanged++;
            while (oldEnd > firstChanged && newEnd > firstChanged && oldLines[oldEnd - 1] === lines[newEnd - 1]) {
                oldEnd--; newEnd--;
            }
        }
        const widths = new Float64Array(lines.length);
        if (oldWidths) {
            widths.set(oldWidths.subarray(0, firstChanged));
            widths.set(oldWidths.subarray(oldEnd), newEnd);
        }
        let maxWidth = 0;
        for (let index = 0; index < lines.length; index++) {
            if (index >= firstChanged && index < newEnd) widths[index] = measureCanvasText(ctx, lines[index])?.width ?? lines[index].length * this.fontSize * 0.6;
            maxWidth = Math.max(maxWidth, widths[index]);
        }
        this._measureContext = ctx;
        this._measurementKey = measurementKey;
        this._measurementVersion = version;
        this._measuredLines = lines;
        this._measuredWidths = widths;
        ctx.restore();
        
        const oldScaleX = (this._baseWidth && this._baseWidth > 0) ? this.width / this._baseWidth : 1;
        const oldScaleY = (this._baseHeight && this._baseHeight > 0) ? this.height / this._baseHeight : 1;
        
        const newBaseW = Math.max(this.fontSize, maxWidth);
        const newBaseH = Math.max(lineHeight, lines.length * lineHeight);
        
        this._baseWidth = newBaseW;
        this._baseHeight = newBaseH;
        this.width = Math.min(MAX_ELEMENT_DIMENSION, newBaseW * oldScaleX);
        this.height = Math.min(MAX_ELEMENT_DIMENSION, newBaseH * oldScaleY);
        if (this.rotation) {
            // Growing a rotated frame moves its rotation center. Compensate
            // for that shift so the visible first character stays anchored.
            const dx = (previousWidth - this.width) / 2;
            const dy = (previousHeight - this.height) / 2;
            const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
            this.x += dx * (1 - cos) + dy * sin;
            this.y += dy * (1 - cos) - dx * sin;
        }
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
        return new TextElement(data.x, data.y);
    }

    deserialize(data) {
        const normalized = data.fontFamily?.includes('Segoe UI')
            ? { ...data, fontFamily: "'Zen Maru Gothic', sans-serif" }
            : data;
        super.deserialize(normalized);
        const positiveFinite = value => Number.isFinite(value) && value > 0 ? value : null;
        this._baseWidth = positiveFinite(data.baseWidth) ??
            positiveFinite(data._baseWidth) ?? positiveFinite(this.width) ?? 1;
        this._baseHeight = positiveFinite(data.baseHeight) ??
            positiveFinite(data._baseHeight) ?? positiveFinite(this.height) ?? 1;
        return this;
    }
}
