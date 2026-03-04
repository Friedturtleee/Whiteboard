/**
 * Transform — handles drag, resize, rotate interactions.
 */
export class Transform {
    constructor(app) {
        this.app = app;
        this.mode = null;          // 'drag' | 'resize' | 'rotate'
        this.handleIndex = -1;      // which resize handle
        this.startX = 0;
        this.startY = 0;
        this.startBounds = null;
        this.startRotation = 0;
        this.startPositions = [];   // for multi-drag
    }

    startEndpoint(wx, wy, epIndex, el) {
        this.mode = 'endpoint';
        this.epIndex = epIndex;
        this.targetElement = el;
        // Snapshot both endpoints
        this._ep = {
            p1x: el.x,              p1y: el.y,
            p2x: el.x + el.width,  p2y: el.y + el.height
        };
    }

    startDrag(wx, wy) {
        const sel = this.app.selectionManager;
        this.mode = 'drag';
        this.startX = wx;
        this.startY = wy;
        this.startPositions = sel.selectedElements.map(el => ({
            el, x: el.x, y: el.y
        }));
    }

    startResize(wx, wy, handleIndex, el) {
        this.mode = 'resize';
        this.handleIndex = handleIndex;
        this.startX = wx;
        this.startY = wy;
        this.startBounds = { x: el.x, y: el.y, w: el.width, h: el.height };
        this.targetElement = el;
    }

    startRotate(wx, wy, el) {
        this.mode = 'rotate';
        const b = el.getBounds();
        this.rotCenter = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        this.startRotation = el.rotation;
        this.startAngle = Math.atan2(wy - this.rotCenter.y, wx - this.rotCenter.x);
        this.targetElement = el;
    }

    update(wx, wy, shiftKey = false) {
        if (!this.mode) return;

        if (this.mode === 'endpoint') {
            const el = this.targetElement;
            const ep = this._ep;
            if (this.epIndex === 0) {
                el.x = wx; el.y = wy;
                el.width  = ep.p2x - wx;
                el.height = ep.p2y - wy;
            } else {
                el.x = ep.p1x; el.y = ep.p1y;
                el.width  = wx - ep.p1x;
                el.height = wy - ep.p1y;
            }
        }

        if (this.mode === 'drag') {
            const dx = wx - this.startX;
            const dy = wy - this.startY;
            for (const sp of this.startPositions) {
                sp.el.x = sp.x + dx;
                sp.el.y = sp.y + dy;
            }
        }

        if (this.mode === 'resize') {
            const el = this.targetElement;
            const sb = this.startBounds;
            const dx = wx - this.startX;
            const dy = wy - this.startY;

            switch (this.handleIndex) {
                case 0: // NW
                    el.x = sb.x + dx; el.y = sb.y + dy;
                    el.width = sb.w - dx; el.height = sb.h - dy;
                    break;
                case 1: // NE
                    el.y = sb.y + dy;
                    el.width = sb.w + dx; el.height = sb.h - dy;
                    break;
                case 2: // SE
                    el.width = sb.w + dx; el.height = sb.h + dy;
                    break;
                case 3: // SW
                    el.x = sb.x + dx;
                    el.width = sb.w - dx; el.height = sb.h + dy;
                    break;
                case 4: // N
                    el.y = sb.y + dy; el.height = sb.h - dy;
                    break;
                case 5: // E
                    el.width = sb.w + dx;
                    break;
                case 6: // S
                    el.height = sb.h + dy;
                    break;
                case 7: // W
                    el.x = sb.x + dx; el.width = sb.w - dx;
                    break;
            }
            // Enforce minimum size
            if (el.width < 10) { el.width = 10; }
            if (el.height < 10) { el.height = 10; }

            // Notify element of resize so it can update internal layout
            if (el.onResize) el.onResize(el.width, el.height);
        }

        if (this.mode === 'rotate') {
            const angle = Math.atan2(wy - this.rotCenter.y, wx - this.rotCenter.x);
            let newRot = this.startRotation + (angle - this.startAngle);
            // Snap to 15° if shift held
            if (shiftKey) {
                const snap = Math.PI / 12;
                newRot = Math.round(newRot / snap) * snap;
            }
            this.targetElement.rotation = newRot;
        }

        this.app.renderer.markDirty();
    }

    finish() {
        if (!this.mode) return null;
        const info = { mode: this.mode };

        if (this.mode === 'endpoint') {
            info.element = this.targetElement;
            info.epIndex = this.epIndex;
            info._ep = { ...this._ep };
        }
        if (this.mode === 'drag') {
            info.elements = this.startPositions.map(sp => ({
                el: sp.el,
                fromX: sp.x, fromY: sp.y,
                toX: sp.el.x, toY: sp.el.y
            }));
        }
        if (this.mode === 'resize') {
            info.element = this.targetElement;
            info.fromBounds = { ...this.startBounds };
            info.toBounds = { x: this.targetElement.x, y: this.targetElement.y, w: this.targetElement.width, h: this.targetElement.height };
        }
        if (this.mode === 'rotate') {
            info.element = this.targetElement;
            info.fromRotation = this.startRotation;
            info.toRotation = this.targetElement.rotation;
        }

        this.mode = null;
        this.handleIndex = -1;
        this.startPositions = [];
        this.targetElement = null;
        return info;
    }

    cancel() {
        if (this.mode === 'endpoint' && this.targetElement) {
            const el = this.targetElement;
            const ep = this._ep;
            el.x = ep.p1x; el.y = ep.p1y;
            el.width  = ep.p2x - ep.p1x;
            el.height = ep.p2y - ep.p1y;
        }
        if (this.mode === 'drag') {
            for (const sp of this.startPositions) {
                sp.el.x = sp.x;
                sp.el.y = sp.y;
            }
        }
        if (this.mode === 'resize' && this.targetElement) {
            Object.assign(this.targetElement, {
                x: this.startBounds.x, y: this.startBounds.y,
                width: this.startBounds.w, height: this.startBounds.h
            });
        }
        if (this.mode === 'rotate' && this.targetElement) {
            this.targetElement.rotation = this.startRotation;
        }
        this.mode = null;
        this.app.renderer.markDirty();
    }
}
