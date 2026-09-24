import { Serializer } from '../core/Serializer.js';

const CLOUD_CACHE_PREFIX = 'cp_whiteboard_cloud_v1';

function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

export class CloudBoards {
    constructor(app) {
        this.app = app;
        this.config = window.WHITEBOARD_CLOUD_CONFIG || {};
        this.clerk = null;
        this.clerkLoadPromise = null;
        this.clerkUserId = null;
        this.clerkIdentityRevision = 0;
        this.modal = null;
        this.activeBoard = null;
        this.activeUserId = null;
        this.connection = null;
        this.boardOpenRevision = 0;
        this.syncTimer = null;
        this.localSnapshot = null;
        this.localAutosaveKey = null;
        this.guestShareToken = null;
        this.reconnectTimer = null;
        this.reconnectDelay = 1000;
        this.isCloudBoard = false;
        this.isReadOnly = false;
        this.accountRecoveryPending = false;
        this.statusOverride = '';
        this._renderStatus();
        this._openSharedUrl();
        window.addEventListener('beforeunload', event => {
            if (this.isCloudBoard && !this.isReadOnly && this.syncTimer) {
                clearTimeout(this.syncTimer);
                this.syncTimer = null;
                this.connection?.syncLocalState();
            }
            const syncPending = this.isCloudBoard && !this.isReadOnly && this.connection &&
                (this.connection.pendingAcks > 0 || this.connection.status !== 'saved');
            if (!this.accountRecoveryPending && !syncPending) return;
            event.preventDefault();
            event.returnValue = '';
        });
        window.addEventListener('pagehide', () => {
            clearTimeout(this.syncTimer);
            if (!this.isReadOnly) {
                this.app._flushAutosave?.();
                this.connection?.syncLocalState();
            }
        });
        window.addEventListener('pageshow', event => {
            if (!event.persisted || !this.isCloudBoard || !this.connection ||
                this.connection.status === 'revoked') return;
            const state = this.connection.socket?.readyState;
            if (state === WebSocket.CLOSED || state === WebSocket.CLOSING) {
                this.reconnectDelay = 1000;
                this.reconnect(this.connection);
            }
        });
    }

    _configured() {
        if (typeof this.config.apiBaseUrl !== 'string' ||
            typeof this.config.clerkPublishableKey !== 'string' || !this.config.clerkPublishableKey.startsWith('pk_')) return false;
        try {
            const api = new URL(this.config.apiBaseUrl);
            return api.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
        } catch {
            return false;
        }
    }

    async _loadClerk() {
        if (this.clerk) return this.clerk;
        if (this.clerkLoadPromise) return this.clerkLoadPromise;
        this.clerkLoadPromise = (async () => {
            const key = this.config.clerkPublishableKey.trim();
            const encodedDomain = key.split('_')[2];
            if (!encodedDomain) throw new Error('Clerk publishable key 格式錯誤。');
            let domain;
            try {
                const normalized = encodedDomain.replaceAll('-', '+').replaceAll('_', '/');
                domain = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)).replace(/\$$/, '');
                if (!/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error('invalid domain');
            } catch {
                throw new Error('無法從 Clerk publishable key 讀取前端網域。');
            }
            const loadScript = (src, attributes = {}) => new Promise((resolve, reject) => {
                const existing = document.querySelector(`script[src="${CSS.escape(src)}"]`);
                if (existing?.dataset.loaded === 'true') return resolve();
                const script = existing || document.createElement('script');
                Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
                script.src = src;
                script.async = true;
                script.crossOrigin = 'anonymous';
                script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
                script.onerror = () => {
                    script.remove();
                    reject(new Error('Clerk SDK 載入失敗。'));
                };
                if (!existing) document.head.appendChild(script);
            });
            await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
            await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
                'data-clerk-publishable-key': key
            });
            const clerk = window.Clerk;
            if (!clerk) throw new Error('Clerk SDK 初始化失敗。');
            if (!clerk.isReady) {
                await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
            }
            this.clerk = clerk;
            this.clerkUserId = clerk.user?.id || null;
            clerk.addListener?.(() => {
                const nextUserId = clerk.user?.id || null;
                const previousUserId = this.clerkUserId;
                this.clerkUserId = nextUserId;
                if (previousUserId !== nextUserId) this.clerkIdentityRevision++;
                if (previousUserId !== nextUserId && this.activeUserId &&
                    this.activeUserId !== nextUserId) {
                    this._handleAccountChange(this.activeUserId).catch(error => this._showError(error));
                }
                if (this.modal?.isConnected && clerk.user) {
                    this._renderPanel().catch(error => this._showError(error));
                }
            });
            return clerk;
        })().finally(() => { this.clerkLoadPromise = null; });
        return this.clerkLoadPromise;
    }

    async openPanel() {
        if (!this._configured()) {
            this.app._toast('雲端服務尚未設定，請依 server/DEPLOYMENT.md 設定 API 網址與 Clerk 公開金鑰。', 4500);
            return;
        }
        this._ensureModal();
        this.modal.hidden = false;
        this.modal.setAttribute('aria-hidden', 'false');
        try {
            const clerk = await this._loadClerk();
            if (!clerk.user) {
                clerk.openSignIn({});
                await this._renderPanel();
                return;
            }
            await this._renderPanel();
        } catch (error) {
            this._showError(error);
        }
    }

    _ensureModal() {
        if (this.modal?.isConnected) return;
        const modal = make('div', 'cloud-modal');
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        modal.addEventListener('pointerdown', event => {
            if (event.target === modal) this.closePanel();
        });
        const panel = make('section', 'cloud-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', '帳號與雲端白板');
        const header = make('header', 'cloud-panel-header');
        header.append(make('h2', '', '帳號與白板'));
        const close = make('button', 'cloud-icon-button', '×');
        close.type = 'button'; close.setAttribute('aria-label', '關閉'); close.addEventListener('click', () => this.closePanel());
        header.append(close);
        const identity = make('div', 'cloud-identity'); identity.id = 'cloud-identity';
        const status = make('div', 'cloud-status'); status.id = 'cloud-status';
        const actions = make('div', 'cloud-actions');
        const create = make('button', 'cloud-primary', '將目前白板另存到雲端');
        create.type = 'button'; create.id = 'cloud-save-current';
        create.addEventListener('click', () => this.saveCurrentBoard());
        const local = make('button', 'cloud-secondary', '返回本機白板');
        local.type = 'button'; local.id = 'cloud-return-local';
        local.addEventListener('click', () => this.returnToLocal().catch(error => this._showError(error)));
        const refresh = make('button', 'cloud-secondary', '重新整理清單');
        refresh.type = 'button'; refresh.addEventListener('click', () => this._renderPanel().catch(error => this._showError(error)));
        const signOut = make('button', 'cloud-secondary', '登出');
        signOut.type = 'button'; signOut.id = 'cloud-signout'; signOut.hidden = true;
        signOut.addEventListener('click', async () => {
            try {
                if (this.isCloudBoard && !await this.returnToLocal()) return;
                const cloudKeys = [];
                for (let index = 0; index < localStorage.length; index++) {
                    const key = localStorage.key(index);
                    if (key?.startsWith(`${CLOUD_CACHE_PREFIX}_`)) cloudKeys.push(key);
                }
                const recoveryKeys = cloudKeys.filter(key => key.endsWith('_recovery'));
                const recoverySnapshots = new Set(recoveryKeys.map(key => key.slice(0, -'_recovery'.length)));
                if (recoveryKeys.length && !confirm('尚有未同步草稿留在本機。登出時會保留這些草稿，請勿在共用裝置保留；要繼續登出嗎？')) return;
                await this.clerk?.signOut();
                for (const key of cloudKeys) {
                    if (!key.endsWith('_recovery') && !recoverySnapshots.has(key)) localStorage.removeItem(key);
                }
                this.closePanel();
            } catch (error) { this._showError(error); }
        });
        actions.append(create, local, refresh, signOut);
        const list = make('div', 'cloud-board-list'); list.id = 'cloud-board-list';
        const errorBox = make('div', 'cloud-error'); errorBox.id = 'cloud-error'; errorBox.setAttribute('role', 'alert');
        panel.append(header, identity, status, actions, errorBox, list);
        modal.append(panel);
        document.body.append(modal);
        this.modal = modal;
    }

    closePanel() {
        if (!this.modal) return;
        this.modal.hidden = true;
        this.modal.setAttribute('aria-hidden', 'true');
    }

    async _token() {
        const clerk = await this._loadClerk();
        if (!clerk.user || !clerk.session) throw new Error('請先登入帳號。');
        const token = await clerk.session.getToken();
        if (!token) throw new Error('無法取得登入憑證，請重新登入。');
        return token;
    }

    async _api(path, { method = 'GET', body, auth = true, token: suppliedToken = null } = {}) {
        const headers = new Headers({ Accept: 'application/json' });
        if (body !== undefined) headers.set('Content-Type', 'application/json');
        if (auth) headers.set('Authorization', `Bearer ${suppliedToken || await this._token()}`);
        const response = await fetch(`${this.config.apiBaseUrl.replace(/\/+$/, '')}${path}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body),
            mode: 'cors', cache: 'no-store', credentials: 'omit'
        });
        if (response.status === 204) return null;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(payload.error || `雲端服務回應 ${response.status}`);
            error.status = response.status;
            error.cleanupPending = payload.cleanup_pending === true;
            throw error;
        }
        return payload;
    }

    async _renderPanel() {
        const list = document.getElementById('cloud-board-list');
        const identity = document.getElementById('cloud-identity');
        const errorBox = document.getElementById('cloud-error');
        const saveButton = document.getElementById('cloud-save-current');
        const localButton = document.getElementById('cloud-return-local');
        const signOutButton = document.getElementById('cloud-signout');
        if (!list || !this.modal) return;
        errorBox.textContent = '';
        if (localButton) localButton.hidden = !this.isCloudBoard;
        if (this.accountRecoveryPending) {
            identity.textContent = this.clerk?.user?.fullName ||
                this.clerk?.user?.primaryEmailAddress?.emailAddress || '帳號已切換';
            if (signOutButton) signOutButton.hidden = !this.clerk?.user;
            errorBox.textContent = '舊帳號的白板草稿尚未安全匯出；請先從工具列匯出 JSON，或返回本機並確認放棄此草稿。';
            if (saveButton) saveButton.disabled = true;
            list.replaceChildren(make('p', 'cloud-muted', '為避免跨帳號洩漏，復原草稿期間暫停雲端白板操作。'));
            return;
        }
        if (saveButton) saveButton.disabled = false;
        list.replaceChildren(make('p', 'cloud-muted', '載入白板清單…'));
        const clerk = await this._loadClerk();
        if (signOutButton) signOutButton.hidden = !clerk.user;
        if (!clerk.user) {
            identity.textContent = '登入後可查看雲端白板。';
            list.replaceChildren(make('p', 'cloud-muted', '登入視窗已開啟。'));
            return;
        }
        identity.textContent = clerk.user.fullName || clerk.user.primaryEmailAddress?.emailAddress || '已登入';
        const recoveryRows = this._localRecoveryRows(clerk.user.id);
        let boards = [];
        try {
            const response = await this._api('/api/boards');
            boards = response.boards || [];
        } catch (error) {
            if (!recoveryRows.length) throw error;
            errorBox.textContent = `雲端清單目前無法載入（${error.message}）；仍可下載下方本機草稿。`;
        }
        if (!boards.length && !recoveryRows.length) {
            list.replaceChildren(make('p', 'cloud-muted', '還沒有雲端白板。可以先將目前白板另存上去。'));
            return;
        }
        list.replaceChildren(...boards.map(board => this._boardRow(board)), ...recoveryRows);
    }

    _boardRow(board) {
        const row = make('article', 'cloud-board-row');
        const info = make('div', 'cloud-board-info');
        info.append(make('strong', '', board.title), make('span', 'cloud-muted', `${board.role} · ${new Date(board.updated_at).toLocaleString()}`));
        const buttons = make('div', 'cloud-board-actions');
        if (board.cleanup_pending) {
            info.append(make('span', 'cloud-muted', '白板已封鎖；內容清除尚未完成。'));
            const retry = make('button', 'cloud-danger', '重試清除');
            retry.type = 'button';
            retry.addEventListener('click', async () => {
                try {
                    await this._api(`/api/boards/${board.id}`, { method: 'DELETE' });
                    try { localStorage.removeItem(this._cloudCacheKey(this.clerk?.user?.id || 'guest', board.id)); } catch {}
                    await this._renderPanel();
                } catch (error) { this._showError(error); }
            });
            buttons.append(retry);
            row.append(info, buttons);
            return row;
        }
        const open = make('button', 'cloud-secondary', '開啟');
        open.type = 'button'; open.addEventListener('click', () => this.openBoard(board).catch(error => this._showError(error)));
        buttons.append(open);
        if (board.role === 'owner') {
            const share = make('button', 'cloud-secondary', '分享');
            share.type = 'button'; share.addEventListener('click', () => this.manageSharing(board).catch(error => this._showError(error)));
            const rename = make('button', 'cloud-secondary', '改名');
            rename.type = 'button'; rename.addEventListener('click', () => this.renameBoard(board).catch(error => this._showError(error)));
            const remove = make('button', 'cloud-danger', '刪除');
            remove.type = 'button'; remove.addEventListener('click', () => this.deleteBoard(board).catch(error => this._showError(error)));
            buttons.append(share, rename, remove);
        }
        row.append(info, buttons);
        return row;
    }

    async saveCurrentBoard() {
        if (this.accountRecoveryPending) {
            return this._showError(new Error('請先匯出或處理舊帳號的復原草稿，再使用其他帳號的雲端服務。'));
        }
        const title = prompt('雲端白板名稱：', '未命名白板');
        if (title === null) return;
        const trimmed = title.trim();
        if (!trimmed || trimmed.length > 80) return this._showError(new Error('名稱需為 1 到 80 個字元。'));
        let createdBoard = null;
        let createdBoardToken = null;
        try {
            const clerk = await this._loadClerk();
            const ownerUserId = clerk.user?.id;
            const identityRevision = this.clerkIdentityRevision;
            if (!ownerUserId) throw new Error('請先登入帳號。');
            this.app._finishTextEditing();
            this.app._dismissPendingDialogs?.();
            const seedData = this._snapshot();
            clearTimeout(this.syncTimer);
            if (this.connection && !this.isReadOnly && !await this.connection.flush()) {
                throw new Error('雲端尚未確認最後的修改；同步完成前不會建立新的雲端副本。');
            }
            const ownerToken = await this._token();
            if (this.clerkIdentityRevision !== identityRevision || clerk.user?.id !== ownerUserId) {
                throw new Error('登入帳號在建立白板前已變更；請重新操作。');
            }
            const { board } = await this._api('/api/boards', {
                method: 'POST', body: { title: trimmed }, token: ownerToken
            });
            createdBoard = board;
            createdBoardToken = ownerToken;
            if (this.clerkIdentityRevision !== identityRevision || clerk.user?.id !== ownerUserId) {
                throw new Error('登入帳號在建立白板期間已變更；正在使用原帳號清理新白板。');
            }
            await this.openBoard({ ...board, role: 'owner' }, null, { seedData });
            this.closePanel();
            this.app._toast(`正在建立雲端白板「${board.title}」`);
        } catch (error) {
            if (createdBoard) {
                try {
                    await this._api(`/api/boards/${createdBoard.id}`, {
                        method: 'DELETE', token: createdBoardToken
                    });
                    if (this.activeBoard?.id === createdBoard.id) await this.returnToLocal({ skipFlush: true });
                } catch (cleanupError) {
                    error.message = `${error.message}；新白板的清理尚未完成：${cleanupError.message}`;
                }
            }
            this._showError(error);
        }
    }

    _snapshot() {
        return {
            version: 1,
            elements: this.app.elements.map(element => element.serialize()),
            camera: { x: this.app.camera.x, y: this.app.camera.y, zoom: this.app.camera.zoom }
        };
    }

    async openBoard(board, existingTicket = null, options = {}) {
        const openRevision = ++this.boardOpenRevision;
        const isCurrentOpen = () => this.boardOpenRevision === openRevision;
        if (this.accountRecoveryPending) {
            throw new Error('請先匯出或處理舊帳號的復原草稿，再切換白板。');
        }
        this.app._finishTextEditing();
        this.app._dismissPendingDialogs?.();
        this.app._flushAutosave?.();
        const requestedUserId = options.shareToken ? null : (this.clerk?.user?.id || null);
        const identityRevision = this.clerkIdentityRevision;
        this.statusOverride = '';
        const seedData = options.seedData?.seedData ?? options.seedData ?? null;
        let preferredCamera = null;
        if (!seedData) {
            try {
                const cached = JSON.parse(localStorage.getItem(
                    this._cloudCacheKey(this.clerk?.user?.id || 'guest', board.id)
                ) || 'null');
                if (cached?.camera) preferredCamera = cached.camera;
            } catch {}
        }
        const firstCloudBoard = !this.isCloudBoard;
        if (firstCloudBoard) {
            this.localAutosaveKey = this.app.autosaveKey;
            this.localSnapshot = this._snapshot();
        }
        clearTimeout(this.syncTimer);
        if (this.connection && !this.isReadOnly && !await this.connection.flush()) {
            throw new Error('雲端尚未確認最後的修改；目前連線不穩，請先恢復同步或匯出資料後再切換白板。');
        }
        if (!isCurrentOpen()) return false;
        // Tickets expire quickly. Request one only after the previous board has
        // finished flushing, so a large board cannot consume its lifetime.
        const connection = options.shareToken
            ? await this._api('/api/share/access', {
                method: 'POST', auth: false, body: { token: options.shareToken }
            })
            : existingTicket
                ? { board, ticket: existingTicket }
                : await this._api(`/api/boards/${board.id}/connect-ticket`, { method: 'POST', body: {} });
        if (!isCurrentOpen()) return false;
        if (!options.shareToken && (!requestedUserId ||
            this.clerkIdentityRevision !== identityRevision || this.clerk?.user?.id !== requestedUserId)) {
            throw new Error('登入帳號在開啟白板期間已變更；為保護資料，請重新選取白板。');
        }
        if (connection.board.id !== board.id) throw new Error('分享連結與白板不相符。');
        const { BoardCollaboration } = await import('./BoardCollaboration.js');
        if (!isCurrentOpen()) return false;
        if (!options.shareToken && (this.clerkIdentityRevision !== identityRevision ||
            this.clerk?.user?.id !== requestedUserId)) return false;
        clearTimeout(this.reconnectTimer);
        this.connection?.disconnect();
        this.connection = null;
        this.activeBoard = { ...connection.board, id: board.id, role: connection.board.role || board.role };
        this.guestShareToken = options.shareToken || null;
        this.activeUserId = requestedUserId;
        this.isCloudBoard = true;
        this.isReadOnly = this.activeBoard.role === 'viewer';
        this.app.autosaveKey = this._cloudCacheKey(requestedUserId || 'guest', board.id);
        this._setReadOnly(this.isReadOnly);
        this.app._skipAutosave = true;
        this.app.elements = [];
        this.app.selectionManager.clear();
        this.app.history.clear();
        this.app.camera.zoom = 1.5;
        this.app._initCamera();
        this.app._updateZoomDisplay();
        this.app.layerManager._reindex();
        this.app.propertyPanel.update();
        this.app.layerPanel.update();
        this.app.renderer.markDirty();
        this.app._skipAutosave = false;
        try {
            this.connection = new BoardCollaboration(this.app, {
                apiBaseUrl: this.config.apiBaseUrl,
                board: this.activeBoard,
                ticket: connection.ticket,
                seedData: seedData?.elements ? seedData : null,
                preferredCamera
            });
            this.updateUndoControls();
            this._renderStatus();
            if (this.modal && !this.modal.hidden) this._renderPanel().catch(error => this._showError(error));
            return true;
        } catch (error) {
            this.statusOverride = '連線無法啟動；本機白板仍可從「返回本機白板」取回。';
            this._showError(error);
            throw error;
        }
    }

    _cloudCacheKey(userId, boardId) {
        const safeUser = String(userId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
        return `${CLOUD_CACHE_PREFIX}_${safeUser}_${boardId}`;
    }

    _cloudRecoveryKey(userId, boardId) {
        return `${this._cloudCacheKey(userId, boardId)}_recovery`;
    }

    _preserveRevokedDraft() {
        // A revoked connection may still have edits that were never acknowledged.
        // Keep those edits isolated to the account that opened the board and make
        // them discoverable in the recovery list instead of deleting the cache.
        if (!this.activeBoard?.id || this.activeBoard.role === 'viewer') return false;
        const userId = this.activeUserId || this.clerk?.user?.id;
        if (!userId) return false;
        try {
            localStorage.setItem(this._cloudCacheKey(userId, this.activeBoard.id), JSON.stringify(this._snapshot()));
            localStorage.setItem(this._cloudRecoveryKey(userId, this.activeBoard.id), JSON.stringify({
                boardId: this.activeBoard.id,
                title: this.activeBoard.title || '未命名白板'
            }));
            return true;
        } catch (error) {
            console.warn('[Cloud recovery]', error);
            this.app._toast('雲端權限已變更，但本機空間不足以保存復原草稿；請立即匯出 JSON。', 6500);
            return false;
        }
    }

    _localRecoveryRows(userId) {
        const prefix = this._cloudCacheKey(userId, '');
        const rows = [];
        try {
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (!key?.startsWith(prefix) || !key.endsWith('_recovery')) continue;
                let marker;
                try { marker = JSON.parse(localStorage.getItem(key)); } catch { continue; }
                if (!/^[a-f0-9]{32}$/i.test(marker?.boardId) || typeof marker.title !== 'string') continue;
                const row = make('article', 'cloud-board-row');
                const info = make('div', 'cloud-board-info');
                info.append(
                    make('strong', '', `未同步草稿：${marker.title}`),
                    make('span', 'cloud-muted', '此草稿只存在於這個瀏覽器；下載 JSON 後可匯入白板。')
                );
                const download = make('button', 'cloud-secondary', '下載草稿 JSON');
                download.type = 'button';
                download.addEventListener('click', () => this._downloadRecoveryDraft(userId, marker.boardId));
                const discard = make('button', 'cloud-danger', '清除本機草稿');
                discard.type = 'button';
                discard.addEventListener('click', async () => {
                    if (!confirm(`確定清除「${marker.title}」的未同步本機草稿？此操作無法復原。`)) return;
                    try {
                        localStorage.removeItem(this._cloudCacheKey(userId, marker.boardId));
                        localStorage.removeItem(key);
                    } catch {}
                    try { await this._renderPanel(); } catch (error) { this._showError(error); }
                });
                const actions = make('div', 'cloud-board-actions');
                actions.append(download, discard);
                row.append(info, actions);
                rows.push(row);
            }
        } catch {}
        return rows;
    }

    _downloadRecoveryDraft(userId, boardId) {
        try {
            const draft = JSON.parse(localStorage.getItem(this._cloudCacheKey(userId, boardId)) || 'null');
            if (!Array.isArray(draft?.elements)) throw new Error('本機草稿不存在或格式已損壞。');
            const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `whiteboard-recovery-${boardId}-${Date.now()}.json`;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            this._showError(error);
        }
    }

    async returnToLocal({ skipFlush = false } = {}) {
        this.boardOpenRevision++;
        if (this.accountRecoveryPending &&
            !confirm('這份白板包含未確認保存的舊帳號編輯。請先匯出 JSON；確定要返回本機並離開此復原畫面嗎？')) {
            return false;
        }
        this.app._finishTextEditing();
        this.app._dismissPendingDialogs?.();
        this.app._flushAutosave?.();
        clearTimeout(this.syncTimer);
        if (!skipFlush && this.connection && !this.isReadOnly && this.connection.status !== 'revoked' &&
            !await this.connection.flush()) {
            throw new Error('雲端尚未確認最後的修改；請先恢復同步或匯出資料後再返回本機。');
        }
        clearTimeout(this.reconnectTimer);
        this.connection?.disconnect();
        this.connection = null;
        this.activeBoard = null;
        this.activeUserId = null;
        this.guestShareToken = null;
        this.isCloudBoard = false;
        this.isReadOnly = false;
        this.accountRecoveryPending = false;
        this.statusOverride = '';
        this._setReadOnly(false);
        this.app.autosaveKey = this.localAutosaveKey || 'cp_whiteboard_autosave_whiteboard';
        this.app._skipAutosave = true;
        if (this.localSnapshot) Serializer.loadJSONData(this.app, this.localSnapshot);
        else this.app._tryLoadAutosave();
        this.app._skipAutosave = false;
        this.app._refreshUI();
        this.localSnapshot = null;
        this.localAutosaveKey = null;
        if (this.modal && !this.modal.hidden) await this._renderPanel();
        return true;
    }

    async _handleAccountChange(previousUserId) {
        if (!this.isCloudBoard || this.guestShareToken || this.activeUserId !== previousUserId) return;
        const identityRevision = this.clerkIdentityRevision;
        const boardId = this.activeBoard?.id;
        const connection = this.connection;
        const isCurrentTransition = () => this.isCloudBoard && !this.guestShareToken &&
            this.activeUserId === previousUserId && this.activeBoard?.id === boardId &&
            this.connection === connection && this.clerkIdentityRevision === identityRevision;
        const wasReadOnly = this.isReadOnly;
        // Block keyboard/history edits immediately while the old session flushes.
        this.isReadOnly = true;
        this.app._finishTextEditing();
        this._setReadOnly(true, { commitPendingMarkdown: true, preservePendingEdits: true });
        clearTimeout(this.syncTimer);
        this.syncTimer = null;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        let saved = this.activeBoard?.role === 'viewer';
        if (!saved && connection && connection.status !== 'revoked') {
            saved = await connection.flush();
        }
        if (!isCurrentTransition()) {
            // If the account changed away and back while flushing, keep the
            // existing board session and restore its original editability.
            if (this.isCloudBoard && this.activeUserId === previousUserId &&
                this.clerk?.user?.id === previousUserId && this.connection === connection) {
                this.isReadOnly = wasReadOnly;
                this._setReadOnly(wasReadOnly);
            }
            return;
        }
        let draftCached = false;
        if (!saved) {
            // Preserve the latest snapshot under the old account's isolated key
            // if the server could not acknowledge it before the identity changed.
            try {
                localStorage.setItem(this.app.autosaveKey, JSON.stringify(this._snapshot()));
                draftCached = true;
            } catch {}
        }
        const recoveryBoard = this.activeBoard;
        if (!saved && draftCached && recoveryBoard?.id) {
            try {
                localStorage.setItem(this._cloudRecoveryKey(previousUserId, recoveryBoard.id), JSON.stringify({
                    boardId: recoveryBoard.id,
                    title: recoveryBoard.title || '未命名白板'
                }));
            } catch {}
        }
        if (!saved && !draftCached) {
            clearTimeout(this.reconnectTimer);
            this.connection?.disconnect();
            this.connection = null;
            this.accountRecoveryPending = true;
            this.isReadOnly = true;
            this.statusOverride = '帳號已切換；請先匯出未確認保存的白板 JSON。';
            this._setReadOnly(true);
            this.app._toast('大型白板無法寫入本機復原快取；畫面已保留為唯讀，請立即匯出 JSON。', 6500);
            if (this.modal?.isConnected) this._renderPanel().catch(error => this._showError(error));
            return;
        }
        const returnedToLocal = await this.returnToLocal({ skipFlush: true });
        if (!returnedToLocal) return;
        if (saved) {
            const safeUser = String(previousUserId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
            const prefix = `${CLOUD_CACHE_PREFIX}_${safeUser}_`;
            try {
                const cachedKeys = [];
                for (let index = 0; index < localStorage.length; index++) {
                    const key = localStorage.key(index);
                    if (key?.startsWith(prefix)) cachedKeys.push(key);
                }
                const recoverySnapshots = new Set(cachedKeys
                    .filter(key => key.endsWith('_recovery'))
                    .map(key => key.slice(0, -'_recovery'.length)));
                for (const key of cachedKeys) {
                    if (!key.endsWith('_recovery') && !recoverySnapshots.has(key)) {
                        localStorage.removeItem(key);
                    }
                }
            } catch {}
        } else {
            this.app._toast('帳號已切換；最後修改未獲雲端確認，草稿已保留在原帳號的本機快取中。', 5500);
        }
    }

    _setReadOnly(readOnly, { commitPendingMarkdown = false, preservePendingEdits = false } = {}) {
        document.body.classList.toggle('wb-cloud-readonly', readOnly);
        if (readOnly) {
            this.app._cancelPointerInteraction?.(this.app._activePointerId ?? null, {
                preserveCreatedElements: preservePendingEdits
            });
            this.app._finishTextEditing?.(!preservePendingEdits);
            this.app._dismissPendingDialogs?.({
                commitMarkdown: commitPendingMarkdown,
                preservePreview: preservePendingEdits
            });
            this.app._hideContextMenu?.();
        }
        for (const id of ['btn-undo', 'btn-redo', 'btn-import-json']) {
            const button = document.getElementById(id);
            if (button) button.disabled = readOnly || (id === 'btn-import-json' && this.isCloudBoard);
        }
        const status = document.getElementById('cloud-status');
        if (status && !status.isConnected) return;
        this._renderStatus();
        this.updateUndoControls();
    }

    updateUndoControls() {
        const manager = this.connection?.undoManager;
        for (const [id, enabled] of [
            ['btn-undo', Boolean(manager?.canUndo())],
            ['btn-redo', Boolean(manager?.canRedo())]
        ]) {
            const button = document.getElementById(id);
            if (button) button.disabled = this.isReadOnly || (this.isCloudBoard && !enabled);
        }
    }

    onLocalChange() {
        if (!this.isCloudBoard || this.isReadOnly || !this.connection || this.connection.isApplyingRemote) return;
        clearTimeout(this.syncTimer);
        const connection = this.connection;
        this.syncTimer = setTimeout(() => {
            this.syncTimer = null;
            if (this.connection === connection && !this.isReadOnly) connection.syncLocalState();
        }, 180);
    }

    renderStatus(extra = '') {
        this.statusOverride = extra;
        this._renderStatus();
    }

    _renderStatus() {
        const status = document.getElementById('cloud-status');
        const trigger = document.getElementById('btn-cloud-boards');
        if (this.connection?.status === 'revoked' && !this.isReadOnly) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
            this.isReadOnly = true;
            this._setReadOnly(true, { commitPendingMarkdown: true, preservePendingEdits: true });
            this._preserveRevokedDraft();
        }
        if (!status) {
            if (trigger) {
                trigger.dataset.state = this.isCloudBoard ? (this.connection?.status || 'connecting') : 'local';
                trigger.dataset.tooltip = this.isCloudBoard
                    ? `${this.statusOverride || this.activeBoard?.title || '雲端白板'}${this.isReadOnly ? ' · 檢視者' : ''}`
                    : '本機白板 · 帳號與雲端白板';
            }
            return;
        }
        if (!this.isCloudBoard) {
            status.textContent = '本機白板';
            status.dataset.state = 'local';
            if (trigger) {
                trigger.dataset.state = 'local';
                trigger.dataset.tooltip = '本機白板 · 帳號與雲端白板';
            }
            return;
        }
        const labels = {
            connecting: '連線中…', connected: '同步中…', saving: '同步中…', saved: '雲端已同步',
            error: '同步失敗', disconnected: '連線中斷', revoked: '存取權已變更'
        };
        status.textContent = this.statusOverride || `${labels[this.connection?.status] || '雲端白板'} · ${this.activeBoard?.title || ''}${this.isReadOnly ? ' · 檢視者' : ''}`;
        status.dataset.state = this.connection?.status || 'connecting';
        if (trigger) {
            trigger.dataset.state = this.connection?.status || 'connecting';
            trigger.dataset.tooltip = status.textContent;
        }
    }

    async reconnect(connection) {
        if (this.connection !== connection || !this.isCloudBoard || connection.status === 'revoked') return;
        const identityRevision = this.clerkIdentityRevision;
        const userId = this.activeUserId;
        const shareToken = this.guestShareToken;
        const canReconnect = () => this.connection === connection && this.isCloudBoard &&
            (shareToken
                ? this.guestShareToken === shareToken
                : !this.guestShareToken && this.activeUserId === userId &&
                    this.clerkIdentityRevision === identityRevision && this.clerk?.user?.id === userId);
        clearTimeout(this.reconnectTimer);
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(30_000, Math.round(delay * 1.8));
        this.reconnectTimer = setTimeout(async () => {
            try {
                if (!canReconnect()) return;
                let ticketResponse;
                if (shareToken) {
                    ticketResponse = await this._api('/api/share/access', {
                        method: 'POST', auth: false, body: { token: shareToken }
                    });
                } else {
                    ticketResponse = await this._api(`/api/boards/${this.activeBoard.id}/connect-ticket`, {
                        method: 'POST', body: {}
                    });
                }
                if (!canReconnect()) return;
                connection.reconnect(ticketResponse.ticket);
                this.reconnectDelay = 1000;
            } catch (error) {
                if (!canReconnect()) return;
                this.statusOverride = error.message;
                this._renderStatus();
                if ([401, 403, 404].includes(error.status)) {
                    connection.status = 'revoked';
                    this._renderStatus();
                } else if (this.connection === connection) this.reconnect(connection);
            }
        }, delay);
    }

    async renameBoard(board) {
        const title = prompt('新的白板名稱：', board.title);
        if (title === null) return;
        await this._api(`/api/boards/${board.id}`, { method: 'PATCH', body: { title } });
        await this._renderPanel();
    }

    async deleteBoard(board) {
        if (!confirm(`確定刪除「${board.title}」？`)) return;
        try {
            await this._api(`/api/boards/${board.id}`, { method: 'DELETE' });
        } catch (error) {
            if (error.cleanupPending) {
                try { localStorage.removeItem(this._cloudCacheKey(this.clerk?.user?.id || 'guest', board.id)); } catch {}
                if (this.activeBoard?.id === board.id) await this.returnToLocal({ skipFlush: true });
                await this._renderPanel();
            }
            throw error;
        }
        try { localStorage.removeItem(this._cloudCacheKey(this.clerk?.user?.id || 'guest', board.id)); } catch {}
        if (this.activeBoard?.id === board.id) await this.returnToLocal({ skipFlush: true });
        await this._renderPanel();
    }

    async manageSharing(board) {
        const action = prompt('輸入 1 建立唯讀連結、2 新增／更新帳號、3 管理分享連結、4 管理成員。');
        if (action === null) return;
        if (action === '1') {
            const daysText = prompt('連結有效天數 (1–90)：', '7');
            if (daysText === null) return;
            const { link } = await this._api(`/api/boards/${board.id}/links`, {
                method: 'POST', body: { expiresInDays: Number(daysText) }
            });
            const shareUrl = new URL(window.location.href);
            shareUrl.search = '';
            shareUrl.hash = new URLSearchParams({ board: board.id, share: link.token }).toString();
            try { await navigator.clipboard.writeText(shareUrl.href); } catch {}
            prompt('唯讀分享連結（已嘗試複製到剪貼簿）：', shareUrl.href);
            return;
        }
        if (action === '2') {
            const email = prompt('輸入對方已驗證的帳號電子郵件（對方需先註冊）：');
            if (!email) return;
            const role = prompt('權限：輸入 editor 或 viewer。', 'editor');
            if (!['editor', 'viewer'].includes(role)) return this._showError(new Error('權限請輸入 editor 或 viewer。'));
            await this._api(`/api/boards/${board.id}/members`, {
                method: 'POST', body: { email, role }
            });
            this.app._toast('成員權限已新增／更新（對方需已註冊並驗證 email）。');
            return;
        }
        if (action === '3') {
            const response = await this._api(`/api/boards/${board.id}/links`);
            const liveLinks = (response.links || []).filter(link => !link.revoked_at && link.expires_at > Date.now());
            if (!liveLinks.length) return this.app._toast('目前沒有有效的分享連結。');
            const choice = prompt(`輸入要撤銷的連結編號：\n${liveLinks.map((link, index) => `${index + 1}. 到期 ${new Date(link.expires_at).toLocaleString()} (${link.id})`).join('\n')}`);
            const index = Number(choice) - 1;
            if (Number.isInteger(index) && liveLinks[index]) {
                await this._api(`/api/boards/${board.id}/links/${liveLinks[index].id}`, { method: 'DELETE' });
                this.app._toast('分享連結已撤銷。');
            }
            return;
        }
        if (action === '4') {
            const response = await this._api(`/api/boards/${board.id}/members`);
            const members = response.members || [];
            if (!members.length) return this.app._toast('目前沒有受邀成員。');
            const choice = prompt(`輸入要管理的成員編號：\n${members.map((member, index) => `${index + 1}. ${member.email_address || member.user_id} (${member.role})`).join('\n')}`);
            const index = Number(choice) - 1;
            if (!Number.isInteger(index) || !members[index]) return;
            const member = members[index];
            const operation = prompt(`輸入 remove 移除，或輸入 editor / viewer 變更權限。\n${member.email_address || member.user_id}`, member.role);
            if (operation === 'remove') {
                await this._api(`/api/boards/${board.id}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' });
                this.app._toast('成員已移除。');
            } else if (['editor', 'viewer'].includes(operation)) {
                await this._api(`/api/boards/${board.id}/members/${encodeURIComponent(member.user_id)}`, {
                    method: 'PUT', body: { role: operation }
                });
                this.app._toast('成員權限已更新。');
            }
        }
    }

    async _openSharedUrl() {
        const queryParams = new URLSearchParams(location.search);
        const hashParams = new URLSearchParams(location.hash.slice(1));
        const queryBoard = queryParams.get('board');
        const queryToken = queryParams.get('share');
        const fromFragment = !queryBoard || !queryToken;
        const params = fromFragment ? hashParams : queryParams;
        const boardId = params.get('board');
        const token = params.get('share');
        if (!boardId || !token) return;
        // A share token is a bearer credential. Remove it from the address bar
        // and browser history before making requests or loading further content.
        const cleanUrl = new URL(location.href);
        cleanUrl.searchParams.delete('board');
        cleanUrl.searchParams.delete('share');
        if (fromFragment) cleanUrl.hash = '';
        history.replaceState(history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        if (!this._configured()) return;
        try {
            await this.openBoard({ id: boardId, role: 'viewer' }, null, { shareToken: token });
        } catch (error) {
            this.app._toast(`無法開啟分享白板：${error.message}`, 4500);
        }
    }

    _showError(error) {
        const box = document.getElementById('cloud-error');
        if (box) box.textContent = error?.message || '發生未知錯誤。';
        else this.app._toast(error?.message || '發生未知錯誤。', 4000);
    }
}
