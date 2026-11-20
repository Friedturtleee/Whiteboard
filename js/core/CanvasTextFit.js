const MAX_CACHE_ENTRIES = 512;
const MAX_CACHED_TEXT_LENGTH = 4096;
let contextCaches = new WeakMap();
let cacheVersion = 0;

/** A late web-font load invalidates widths previously measured in fallback fonts. */
export function clearCanvasTextCaches() {
    contextCaches = new WeakMap();
    cacheVersion++;
}

export function getCanvasTextCacheVersion() { return cacheVersion; }

export function getNodeTextBounds(text, radius) {
    if (/[\r\n]/.test(String(text))) {
        const side = Math.max(1, radius * Math.SQRT2 - 2);
        return { width: side, height: side };
    }
    return { width: Math.max(1, radius * 2 - 6), height: radius * 1.5 };
}

function contextCache(ctx) {
    let cache = contextCaches.get(ctx);
    if (!cache) {
        cache = { metrics: new Map(), layouts: new Map() };
        contextCaches.set(ctx, cache);
    }
    return cache;
}

function remember(cache, key, value) {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
}

function fontKey(ctx) {
    return `${ctx.font}|${ctx.fontKerning || ''}|${ctx.letterSpacing || ''}|${ctx.wordSpacing || ''}|` +
        `${ctx.fontStretch || ''}|${ctx.fontVariantCaps || ''}|${ctx.direction || ''}|${ctx.textAlign || ''}|${ctx.textBaseline || ''}`;
}

export function measureCanvasText(ctx, text) {
    if (typeof ctx.measureText !== 'function') return null;
    if (text.length > MAX_CACHED_TEXT_LENGTH) return ctx.measureText(text);
    const cache = contextCache(ctx).metrics;
    const key = `${fontKey(ctx)}\n${text}`;
    const cached = cache.get(key);
    if (cached) return cached;
    return remember(cache, key, ctx.measureText(text));
}

/**
 * Level-of-detail row stride: when rows are thinner than half a screen pixel, draw
 * every Nth row only. Shared by canvas text drawing (CanvasTextFit, TextElement).
 * @param {CanvasRenderingContext2D} ctx - context carrying the current transform
 * @param {number} lineHeight - row height in the context's local units
 */
export function getTextLodStride(ctx, lineHeight) {
    const transform = ctx.getTransform?.();
    const scale = transform ? Math.hypot(transform.c, transform.d) : 1;
    return Math.max(1, Math.floor(0.5 / (lineHeight * scale)));
}

/** Compute a proportional font size that fits text inside a canvas cell. */
export function fitCanvasTextFontSize(ctx, text, baseFontSize, maxWidth, maxHeight) {
    const base = Math.max(0.1, Number(baseFontSize) || 12);
    const value = String(text);
    const measuredWidth = measureCanvasText(ctx, value)?.width ?? value.length * base * 0.6;
    const widthAtOnePx = measuredWidth / base;
    const byWidth = widthAtOnePx > 0 ? maxWidth / widthAtOnePx : base;
    const byHeight = maxHeight / 1.2;
    return Math.max(0.000001, Math.min(base, byWidth, byHeight));
}

/** Shared multiline metrics for rendered values and their native editors. */
export function layoutCanvasCellText(ctx, text, baseFontSize, maxWidth, maxHeight) {
    const value = String(text);
    const base = Math.max(0.1, Number(baseFontSize) || 12);
    const cache = value.length <= MAX_CACHED_TEXT_LENGTH ? contextCache(ctx).layouts : null;
    const key = cache ? `${fontKey(ctx)}|${base}|${maxWidth}|${maxHeight}\n${value}` : null;
    const cached = cache?.get(key);
    if (cached) return cached;
    const lines = value.replace(/\r\n?/g, '\n').split('\n');
    let fontSize = base;
    for (const line of lines) {
        fontSize = Math.min(fontSize, fitCanvasTextFontSize(ctx, line, base, maxWidth, maxHeight / lines.length));
    }
    const lineHeight = fontSize * 1.2;
    const layout = { lines, fontSize, lineHeight, height: lineHeight * lines.length };
    return cache ? remember(cache, key, layout) : layout;
}

/** Center all rows as one block, preserving font proportions. */
export function drawCanvasCellText(ctx, text, baseFontSize, maxWidth, maxHeight, x, y) {
    ctx.font = `${baseFontSize}px Consolas, monospace`;
    const layout = layoutCanvasCellText(ctx, text, baseFontSize, maxWidth, maxHeight);
    ctx.font = `${layout.fontSize}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const metrics = measureCanvasText(ctx, 'Mg');
    const ascent = metrics?.fontBoundingBoxAscent ?? layout.fontSize;
    const descent = metrics?.fontBoundingBoxDescent ?? layout.fontSize * 0.25;
    const baseline = (layout.lineHeight - ascent - descent) / 2 + ascent;
    const stride = getTextLodStride(ctx, layout.lineHeight);
    for (let index = 0; index < layout.lines.length; index += stride) {
        if (layout.lines[index]) ctx.fillText(layout.lines[index], x,
            y - layout.height / 2 + index * layout.lineHeight + baseline);
    }
    return layout;
}
