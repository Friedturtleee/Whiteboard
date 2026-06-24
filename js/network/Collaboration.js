import * as Y from 'https://esm.sh/yjs@13';
import { WebsocketProvider } from 'https://esm.sh/y-websocket@1';

export class Collaboration {
    constructor(app, wsUrl, clerkPublishableKey) {
        this.app = app;
        this.wsUrl = wsUrl;
        this.clerkPubKey = clerkPublishableKey;
        this.doc = new Y.Doc();
        this.elementsMap = this.doc.getMap('elements');
        this.provider = null;
        this.user = null;
        this.cursors = new Map();

        this.elementsMap.observe(this.handleMapUpdate.bind(this));
        
        // Expose undo manager
        this.undoManager = new Y.UndoManager(this.elementsMap);
    }

    async init() {
        if (!window.Clerk) {
            console.error('Clerk SDK not found.');
            return false;
        }

        const clerk = new window.Clerk(this.clerkPubKey);
        await clerk.load();

        if (!clerk.user) {
            clerk.openSignIn();
            return false;
        }

        this.user = {
            id: clerk.user.id,
            name: clerk.user.firstName || clerk.user.fullName || 'Anonymous',
            avatar: clerk.user.imageUrl,
            color: this.getRandomColor(clerk.user.id)
        };

        const token = await clerk.session.getToken();
        
        // Connect to Cloudflare Worker WebSocket
        const urlParams = new URLSearchParams(window.location.search);
        const roomName = urlParams.get('room') || 'whiteboard';
        this.provider = new WebsocketProvider(this.wsUrl, roomName, this.doc, {
            params: { token },
            connect: true
        });

        this.provider.on('status', event => {
            console.log('Collaboration WebSocket status:', event.status);
            const statusEl = document.getElementById('collab-status');
            const iconEl = statusEl?.querySelector('.material-symbols-outlined');
            const textEl = document.getElementById('collab-status-text');
            if (statusEl && iconEl && textEl) {
                if (event.status === 'connected') {
                    iconEl.textContent = 'cloud_done';
                    iconEl.style.color = '#10b981'; // Green
                    textEl.textContent = '已連線';
                    statusEl.dataset.tooltip = '已連線至多人協作伺服器';
                } else {
                    iconEl.textContent = 'cloud_off';
                    iconEl.style.color = '#ff4444'; // Red
                    textEl.textContent = '連線中...';
                    statusEl.dataset.tooltip = '嘗試連線中或已斷線';
                }
            }
        });

        this.provider.awareness.setLocalStateField('user', this.user);
        this.provider.awareness.on('change', this.handleAwarenessChange.bind(this));

        // Listen for mouse movements for presence
        this.app.renderer.canvas.addEventListener('pointermove', this.broadcastCursor.bind(this));

        // When connected, we should optionally push all local elements to Yjs if it's a new room
        // But for Yjs, if elementsMap is empty, and we have local elements, we push them.
        this.provider.on('sync', isSynced => {
            if (isSynced && this.elementsMap.size === 0 && this.app.elements.length > 0) {
                this.doc.transact(() => {
                    for (const el of this.app.elements) {
                        this.elementsMap.set(el.id, JSON.stringify(el.serialize()));
                    }
                });
            } else if (isSynced) {
                // Force sync down
                this.handleMapUpdate({ keysChanged: new Set(this.elementsMap.keys()) });
            }
        });

        return true;
    }

    getRandomColor(seedStr) {
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 80%, 60%)`;
    }

    handleMapUpdate(event) {
        const TYPE_MAP = typeof this.app.getTypeMap === 'function' ? this.app.getTypeMap() : null;
        if (!TYPE_MAP) return;

        let needsRender = false;
        for (const key of event.keysChanged) {
            const dataStr = this.elementsMap.get(key);
            if (!dataStr) {
                // Remote delete
                const idx = this.app.elements.findIndex(e => e.id === key);
                if (idx !== -1) {
                    this.app.elements.splice(idx, 1);
                    needsRender = true;
                }
            } else {
                // Remote add/update
                const data = JSON.parse(dataStr);
                const existing = this.app.elements.find(e => e.id === key);
                if (existing) {
                    existing.deserialize(data);
                    needsRender = true;
                } else {
                    const Cls = TYPE_MAP[data.type];
                    if (Cls) {
                        const el = Cls.fromData ? Cls.fromData(data) : new Cls();
                        el.deserialize(data);
                        this.app.elements.push(el);
                        needsRender = true;
                    }
                }
            }
        }
        
        if (needsRender) {
            this.app.layerManager._reindex();
            this.app.renderer.markDirty();
        }
    }

    syncElement(el) {
        if (!this.elementsMap) return;
        this.elementsMap.set(el.id, JSON.stringify(el.serialize()));
    }

    deleteElement(id) {
        if (!this.elementsMap) return;
        this.elementsMap.delete(id);
    }

    broadcastCursor(e) {
        if (!this.provider || !this.user) return;
        const pt = this.app.camera.screenToWorld(e.clientX, e.clientY);
        this.provider.awareness.setLocalStateField('cursor', pt);
    }

    handleAwarenessChange() {
        const states = this.provider.awareness.getStates();
        this.cursors.clear();
        for (const [clientId, state] of states.entries()) {
            if (clientId !== this.provider.awareness.clientID && state.user && state.cursor) {
                this.cursors.set(clientId, state);
            }
        }
        this.app.renderer.markDirty();
    }

    drawCursors(ctx, camera) {
        if (!this.cursors || this.cursors.size === 0) return;
        
        ctx.save();
        for (const [id, state] of this.cursors.entries()) {
            const { cursor, user } = state;
            const x = cursor.x;
            const y = cursor.y;

            ctx.fillStyle = user.color || '#6366f1';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 12, y + 16);
            ctx.lineTo(x + 5, y + 15);
            ctx.lineTo(x, y + 22);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = user.color || '#6366f1';
            ctx.font = '12px Inter, sans-serif';
            ctx.beginPath();
            const textWidth = ctx.measureText(user.name).width;
            ctx.roundRect(x + 12, y + 18, textWidth + 8, 18, 4);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(user.name, x + 16, y + 27);
        }
        ctx.restore();
    }
}
