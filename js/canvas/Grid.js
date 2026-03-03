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
        if (camera.zoom < 0.25) spacing *= 4;
        else if (camera.zoom < 0.5) spacing *= 2;
        else if (camera.zoom > 4) spacing /= 2;

        // Visible world bounds
        const topLeft = camera.screenToWorld(0, 0);
        const bottomRight = camera.screenToWorld(canvasWidth, canvasHeight);

        const startX = Math.floor(topLeft.x / spacing) * spacing;
        const endX   = Math.ceil(bottomRight.x / spacing) * spacing;
        const startY = Math.floor(topLeft.y / spacing) * spacing;
        const endY   = Math.ceil(bottomRight.y / spacing) * spacing;

        ctx.lineWidth = 1 / camera.zoom;  // constant screen-space width

        // Vertical lines
        for (let x = startX; x <= endX; x += spacing) {
            const idx = Math.round(x / spacing);
            ctx.strokeStyle = (idx % this.majorEvery === 0) ? this.majorColor : this.minorColor;
            ctx.beginPath();
            ctx.moveTo(x, topLeft.y);
            ctx.lineTo(x, bottomRight.y);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = startY; y <= endY; y += spacing) {
            const idx = Math.round(y / spacing);
            ctx.strokeStyle = (idx % this.majorEvery === 0) ? this.majorColor : this.minorColor;
            ctx.beginPath();
            ctx.moveTo(topLeft.x, y);
            ctx.lineTo(bottomRight.x, y);
            ctx.stroke();
        }
    }
}
