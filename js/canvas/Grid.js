/**
 * Grid — draws an infinite grid that adapts density to zoom level.
 */
export class Grid {
    constructor() {
        this.baseSpacing = 40;         // base grid spacing in world units
        this.majorEvery  = 5;          // draw major line every N lines
        this.minorColor  = 'rgba(200,200,200,0.06)';
        this.majorColor  = 'rgba(200,200,200,0.12)';
    }

    draw(ctx, camera, canvasWidth, canvasHeight) {
        // Determine adaptive spacing
        let spacing = this.baseSpacing;
        if (!Number.isFinite(spacing) || spacing <= 0 || !Number.isFinite(camera.zoom) || camera.zoom <= 0) return;
        while (spacing * camera.zoom < 20) spacing *= 2;
        while (spacing * camera.zoom > 80) spacing /= 2;

        // Visible world bounds
        const topLeft = camera.screenToWorld(0, 0);
        const bottomRight = camera.screenToWorld(canvasWidth, canvasHeight);

        const firstX = Math.floor(topLeft.x / spacing), lastX = Math.ceil(bottomRight.x / spacing);
        const firstY = Math.floor(topLeft.y / spacing), lastY = Math.ceil(bottomRight.y / spacing);
        if (![firstX, lastX, firstY, lastY].every(Number.isFinite) ||
            (lastX - firstX + lastY - firstY) > 4000) return;

        ctx.lineWidth = 1 / camera.zoom;  // constant screen-space width

        // Batch every line of a colour into a single path: two strokes per frame.
        ctx.beginPath();
        for (let i = firstX; i <= lastX; i++) {
            if (i % this.majorEvery === 0) continue;
            const x = i * spacing;
            ctx.moveTo(x, topLeft.y); ctx.lineTo(x, bottomRight.y);
        }
        for (let j = firstY; j <= lastY; j++) {
            if (j % this.majorEvery === 0) continue;
            const y = j * spacing;
            ctx.moveTo(topLeft.x, y); ctx.lineTo(bottomRight.x, y);
        }
        ctx.strokeStyle = this.minorColor;
        ctx.stroke();

        ctx.beginPath();
        for (let i = firstX; i <= lastX; i++) {
            if (i % this.majorEvery !== 0) continue;
            const x = i * spacing;
            ctx.moveTo(x, topLeft.y); ctx.lineTo(x, bottomRight.y);
        }
        for (let j = firstY; j <= lastY; j++) {
            if (j % this.majorEvery !== 0) continue;
            const y = j * spacing;
            ctx.moveTo(topLeft.x, y); ctx.lineTo(bottomRight.x, y);
        }
        ctx.strokeStyle = this.majorColor;
        ctx.stroke();
    }
}
