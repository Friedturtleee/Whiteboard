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
    return Math.max(0.000001, Math.min(base, byWidth, byHeight));
}

/** Shared multiline metrics for rendered values and their native editors. */
export function layoutCanvasCellText(ctx, text, baseFontSize, maxWidth, maxHeight) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let fontSize = baseFontSize;
    for (const line of lines) {
        fontSize = Math.min(fontSize, fitCanvasTextFontSize(ctx, line, baseFontSize, maxWidth, maxHeight / lines.length));
    }
    const lineHeight = fontSize * 1.2;
    return { lines, fontSize, lineHeight, height: lineHeight * lines.length };
}

/** Center all rows as one block, preserving font proportions. */
export function drawCanvasCellText(ctx, text, baseFontSize, maxWidth, maxHeight, x, y) {
    ctx.font = `${baseFontSize}px Consolas, monospace`;
    const layout = layoutCanvasCellText(ctx, text, baseFontSize, maxWidth, maxHeight);
    ctx.font = `${layout.fontSize}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText?.('Mg');
    const ascent = metrics?.fontBoundingBoxAscent ?? layout.fontSize;
    const descent = metrics?.fontBoundingBoxDescent ?? layout.fontSize * 0.25;
    const baseline = (layout.lineHeight - ascent - descent) / 2 + ascent;
    const transform = ctx.getTransform?.();
    const scale = transform ? Math.hypot(transform.c, transform.d) : 1;
    const stride = Math.max(1, Math.floor(0.5 / (layout.lineHeight * scale)));
    for (let index = 0; index < layout.lines.length; index += stride) {
        if (layout.lines[index]) ctx.fillText(layout.lines[index], x,
            y - layout.height / 2 + index * layout.lineHeight + baseline);
    }
    return layout;
}
