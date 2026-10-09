/** Compute a proportional font size that fits text inside a canvas cell. */
export function fitCanvasTextFontSize(ctx, text, baseFontSize, maxWidth, maxHeight) {
    const base = Math.max(0.1, Number(baseFontSize) || 12);
    const value = String(text);
    const measuredWidth = typeof ctx.measureText === 'function'
        ? ctx.measureText(value).width
        : value.length * base * 0.6;
    const widthAtOnePx = measuredWidth / base;
    const byWidth = widthAtOnePx > 0 ? maxWidth / widthAtOnePx : base;
    const byHeight = maxHeight / 1.2;
    return Math.max(0.1, Math.min(base, byWidth, byHeight));
}
