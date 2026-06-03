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
            el, x: el.x, y: el.y,
            points: el.points ? el.points.map(p => ({ x: p.x, y: p.y })) : null
        }));
    }

    startResize(wx, wy, handleIndex, el) {
        this.mode = 'resize';
        this.handleIndex = handleIndex;
        this.startX = wx;
        this.startY = wy;
        this.startBounds = { x: el.x, y: el.y, w: el.width, h: el.height };
        this.startPoints = el.points ? el.points.map(p => ({ x: p.x, y: p.y })) : null;
        this.targetElement = el;
        // Let element snapshot any internal state it needs for proportional resize
        if (el.onResizeStart) el.onResizeStart();
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
                if ((sp.el.type === 'pen' || sp.el.shapeType === 'pen') && sp.points) {
                    for (let i = 0; i < sp.points.length; i++) {
                        sp.el.points[i].x = sp.points[i].x + dx;
                        sp.el.points[i].y = sp.points[i].y + dy;
                    }
                }
                sp.el.x = sp.x + dx;
                sp.el.y = sp.y + dy;
            }
        }

        if (this.mode === 'resize') {
            const el = this.targetElement;
            const sb = this.startBounds;
            const theta = el.rotation || 0;

            const dx = wx - this.startX;
            const dy = wy - this.startY;

            let localDx = dx;
            let localDy = dy;
            if (el.rotation) {
                const c = Math.cos(-el.rotation);
                const s = Math.sin(-el.rotation);
                localDx = dx * c - dy * s;
                localDy = dx * s + dy * c;
            }

            let left = -sb.w / 2;
            let right = sb.w / 2;
            let top = -sb.h / 2;
            let bottom = sb.h / 2;

            switch (this.handleIndex) {
                case 0: // NW
                    left = Math.min(left + localDx, right - 10);
                    top = Math.min(top + localDy, bottom - 10);
                    break;
                case 1: // NE
                    right = Math.max(right + localDx, left + 10);
                    top = Math.min(top + localDy, bottom - 10);
                    break;
                case 2: // SE
                    right = Math.max(right + localDx, left + 10);
                    bottom = Math.max(bottom + localDy, top + 10);
                    break;
                case 3: // SW
                    left = Math.min(left + localDx, right - 10);
                    bottom = Math.max(bottom + localDy, top + 10);
                    break;
                case 4: // N
                    top = Math.min(top + localDy, bottom - 10);
                    break;
                case 5: // E
                    right = Math.max(right + localDx, left + 10);
                    break;
                case 6: // S
                    bottom = Math.max(bottom + localDy, top + 10);
                    break;
                case 7: // W
                    left = Math.min(left + localDx, right - 10);
                    break;
            }

            const DATA_TYPES = ['text', 'matrix', 'stack', 'queue', 'tree', 'graph'];
            const forceProportional = DATA_TYPES.includes(el.type) || shiftKey;
            if (forceProportional && sb.h > 0) {
                const ratio = sb.w / sb.h;
                let w = right - left;
                let h = bottom - top;
                
                if ([0, 1, 2, 3].includes(this.handleIndex)) {
                    if (w / ratio > h) {
                        h = w / ratio;
                    } else {
                        w = h * ratio;
                    }
                    if (this.handleIndex === 0) { left = right - w; top = bottom - h; }
                    if (this.handleIndex === 1) { right = left + w; top = bottom - h; }
                    if (this.handleIndex === 2) { right = left + w; bottom = top + h; }
                    if (this.handleIndex === 3) { left = right - w; bottom = top + h; }
                } else if (this.handleIndex === 4 || this.handleIndex === 6) {
                    w = h * ratio;
                    left = -w/2; right = w/2;
                } else if (this.handleIndex === 5 || this.handleIndex === 7) {
                    h = w / ratio;
                    top = -h/2; bottom = h/2;
                }
            }

            el.width = right - left;
            el.height = bottom - top;

            const lcx = (left + right) / 2;
            const lcy = (top + bottom) / 2;

            let worldDx = lcx, worldDy = lcy;
            if (el.rotation) {
                const c = Math.cos(el.rotation);
                const s = Math.sin(el.rotation);
                worldDx = lcx * c - lcy * s;
                worldDy = lcx * s + lcy * c;
            }

            const oldCx = sb.x + sb.w / 2;
            const oldCy = sb.y + sb.h / 2;
            const newCx = oldCx + worldDx;
            const newCy = oldCy + worldDy;

            el.x = newCx - el.width / 2;
            el.y = newCy - el.height / 2;

            if ((el.type === 'pen' || el.shapeType === 'pen') && this.startPoints) {
                const scaleX = sb.w === 0 ? 1 : el.width / sb.w;
                const scaleY = sb.h === 0 ? 1 : el.height / sb.h;
                for (let i = 0; i < this.startPoints.length; i++) {
                    const nx = (this.startPoints[i].x - sb.x) * scaleX + el.x;
                    const ny = (this.startPoints[i].y - sb.y) * scaleY + el.y;
                    el.points[i].x = nx;
                    el.points[i].y = ny;
                }
            }


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
