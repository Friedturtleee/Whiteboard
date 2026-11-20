/** Visible canvas corners expressed in the context's current coordinates. */
export function getLocalViewport(ctx, padding = 0) {
    if (!ctx.canvas || typeof ctx.getTransform !== 'function') return null;
    const { a, b, c, d, e, f } = ctx.getTransform();
    const determinant = a * d - b * c;
    if (![a, b, c, d, e, f, ctx.canvas.width, ctx.canvas.height].every(Number.isFinite) ||
        Math.abs(determinant) < 1e-24) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [sx, sy] of [[0, 0], [ctx.canvas.width, 0],
        [0, ctx.canvas.height], [ctx.canvas.width, ctx.canvas.height]]) {
        const x = (d * (sx - e) - c * (sy - f)) / determinant;
        const y = (a * (sy - f) - b * (sx - e)) / determinant;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX: minX - padding, minY: minY - padding,
        maxX: maxX + padding, maxY: maxY + padding };
}

export function intersectsViewport(viewport, minX, minY, maxX, maxY) {
    return !viewport || !(maxX < viewport.minX || minX > viewport.maxX ||
        maxY < viewport.minY || minY > viewport.maxY);
}
