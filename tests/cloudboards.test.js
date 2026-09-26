import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudBoards } from '../js/network/CloudBoards.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function fakeNode() {
    return {
        children: [],
        hidden: false,
        replaceChildren(...children) { this.children = children; }
    };
}

test('a stale cloud-board list response cannot replace the newly signed-in account list', async () => {
    const previousDocument = globalThis.document;
    const nodes = new Map([
        ['cloud-board-list', fakeNode()],
        ['cloud-identity', fakeNode()],
        ['cloud-error', fakeNode()],
        ['cloud-save-current', fakeNode()],
        ['cloud-return-local', fakeNode()],
        ['cloud-signout', fakeNode()]
    ]);
    globalThis.document = {
        getElementById: id => nodes.get(id) || null,
        createElement: () => fakeNode()
    };

    try {
        const manager = Object.create(CloudBoards.prototype);
        Object.assign(manager, {
            panelRenderRevision: 0,
            clerkIdentityRevision: 0,
            modal: { isConnected: true },
            clerk: { user: { id: 'user_a', fullName: 'Account A' } },
            isCloudBoard: false,
            accountRecoveryPending: false,
            _loadClerk: async function () { return this.clerk; },
            _localRecoveryRows: () => [],
            _boardRow: board => `board:${board.title}`
        });
        const requests = [];
        manager._api = () => {
            const request = deferred();
            requests.push(request);
            return request.promise;
        };

        const oldRender = manager._renderPanel();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(requests.length, 1);

        manager.clerk.user = { id: 'user_b', fullName: 'Account B' };
        manager.clerkIdentityRevision++;
        const currentRender = manager._renderPanel();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(requests.length, 2);

        requests[1].resolve({ boards: [{ title: 'B private board' }] });
        await currentRender;
        requests[0].resolve({ boards: [{ title: 'A private board' }] });
        await oldRender;

        assert.deepEqual(nodes.get('cloud-board-list').children, ['board:B private board']);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('partial share URLs scrub bearer tokens while preserving unrelated URL fragments', async () => {
    const previousLocation = globalThis.location;
    const previousHistory = globalThis.history;
    const cases = [
        {
            href: 'https://whiteboard.example/?share=query-secret#section',
            search: '?share=query-secret', hash: '#section',
            expected: '/#section'
        },
        {
            href: `https://whiteboard.example/#board=${'a'.repeat(32)}&share=fragment-secret`,
            search: '', hash: `#board=${'a'.repeat(32)}&share=fragment-secret`,
            expected: '/'
        },
        {
            href: `https://whiteboard.example/?board=${'a'.repeat(32)}&share=query-secret#board=${'b'.repeat(32)}&share=stale-secret`,
            search: `?board=${'a'.repeat(32)}&share=query-secret`,
            hash: `#board=${'b'.repeat(32)}&share=stale-secret`,
            expected: '/'
        }
    ];

    try {
        const manager = Object.create(CloudBoards.prototype);
        manager._configured = () => false;
        for (const item of cases) {
            let replacedUrl = null;
            globalThis.location = { href: item.href, search: item.search, hash: item.hash };
            globalThis.history = {
                state: null,
                replaceState(_state, _title, url) { replacedUrl = url; }
            };
            await manager._openSharedUrl();
            assert.equal(replacedUrl, item.expected);
        }
    } finally {
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
        if (previousHistory === undefined) delete globalThis.history;
        else globalThis.history = previousHistory;
    }
});

test('opening a cloud board is blocked while its unsynced recovery draft is pending', async () => {
    const previousLocalStorage = globalThis.localStorage;
    const boardId = 'a'.repeat(32);
    const manager = Object.create(CloudBoards.prototype);
    let appTouched = false;
    Object.assign(manager, {
        boardOpenRevision: 0,
        accountRecoveryPending: false,
        clerk: { user: { id: 'user_a' } },
        app: { _finishTextEditing() { appTouched = true; } }
    });
    const recoveryKey = manager._cloudRecoveryKey('user_a', boardId);
    globalThis.localStorage = {
        getItem: key => key === recoveryKey ? JSON.stringify({ boardId, title: 'Unsynced' }) : null
    };

    try {
        await assert.rejects(
            manager.openBoard({ id: boardId, role: 'owner' }),
            /未同步復原草稿/
        );
        assert.equal(appTouched, false);
    } finally {
        if (previousLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousLocalStorage;
    }
});

test('opening a cloud board fails clearly when local storage blocks recovery checks', async () => {
    const previousLocalStorage = globalThis.localStorage;
    let appTouched = false;
    const manager = Object.create(CloudBoards.prototype);
    Object.assign(manager, {
        boardOpenRevision: 0,
        accountRecoveryPending: false,
        clerk: { user: { id: 'user_a' } },
        app: { _finishTextEditing() { appTouched = true; } }
    });
    globalThis.localStorage = { getItem() { throw new Error('storage blocked'); } };

    try {
        await assert.rejects(
            manager.openBoard({ id: 'a'.repeat(32), role: 'owner' }),
            /無法檢查本機復原草稿/
        );
        assert.equal(appTouched, false);
    } finally {
        if (previousLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousLocalStorage;
    }
});

test('cloud-board cleanup preserves a cached snapshot while a recovery marker exists', () => {
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map();
    const manager = Object.create(CloudBoards.prototype);
    const cacheKey = manager._cloudCacheKey('user_a', 'a'.repeat(32));
    const recoveryKey = manager._cloudRecoveryKey('user_a', 'a'.repeat(32));
    values.set(cacheKey, '{"elements":["unsynced"]}');
    values.set(recoveryKey, '{"boardId":"' + 'a'.repeat(32) + '"}');
    globalThis.localStorage = {
        getItem: key => values.get(key) || null,
        removeItem: key => values.delete(key)
    };

    try {
        assert.equal(manager._removeCloudCacheUnlessRecovery('user_a', 'a'.repeat(32)), false);
        assert.equal(values.get(cacheKey), '{"elements":["unsynced"]}');
        values.delete(recoveryKey);
        assert.equal(manager._removeCloudCacheUnlessRecovery('user_a', 'a'.repeat(32)), true);
        assert.equal(values.has(cacheKey), false);
    } finally {
        if (previousLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousLocalStorage;
    }
});

test('a damaged recovery marker still exposes its draft for download or cleanup', async () => {
    const previousDocument = globalThis.document;
    const previousLocalStorage = globalThis.localStorage;
    const previousConfirm = globalThis.confirm;
    const boardId = 'b'.repeat(32);
    const manager = Object.create(CloudBoards.prototype);
    const cacheKey = manager._cloudCacheKey('user_a', boardId);
    const recoveryKey = manager._cloudRecoveryKey('user_a', boardId);
    const values = new Map([[cacheKey, '{"elements":[]}'], [recoveryKey, '{damaged']]);
    const makeNode = () => ({
        children: [],
        listeners: {},
        append(...children) { this.children.push(...children); },
        addEventListener(name, handler) { this.listeners[name] = handler; }
    });
    globalThis.document = { createElement: makeNode, getElementById: () => null };
    globalThis.localStorage = {
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] || null; },
        getItem(key) { return values.get(key) ?? null; },
        removeItem(key) { values.delete(key); }
    };
    globalThis.confirm = () => true;
    let downloaded = null;
    Object.assign(manager, {
        _renderPanel: async () => {},
        _downloadRecoveryDraft(userId, id) { downloaded = [userId, id]; }
    });

    try {
        const [row] = manager._localRecoveryRows('user_a');
        assert.ok(row);
        const info = row.children[0];
        const actions = row.children[1];
        assert.equal(info.children[0].textContent, '未同步草稿：白板復原草稿');
        assert.equal(actions.children.length, 2);
        actions.children[0].listeners.click();
        assert.deepEqual(downloaded, ['user_a', boardId]);
        await actions.children[1].listeners.click();
        assert.equal(values.has(cacheKey), false);
        assert.equal(values.has(recoveryKey), false);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousLocalStorage;
        if (previousConfirm === undefined) delete globalThis.confirm;
        else globalThis.confirm = previousConfirm;
    }
});

test('undo and redo can flush a pending local cloud change before history runs', () => {
    const manager = Object.create(CloudBoards.prototype);
    let synced = 0;
    const connection = { syncLocalState() { synced++; return true; } };
    Object.assign(manager, {
        connection,
        isReadOnly: false,
        syncTimer: setTimeout(() => {}, 60_000)
    });

    assert.equal(manager._flushPendingLocalChange(connection), true);
    assert.equal(synced, 1);
    assert.equal(manager.syncTimer, null);
    assert.equal(manager._flushPendingLocalChange(connection), true);
    assert.equal(synced, 1);

    manager.syncTimer = setTimeout(() => {}, 60_000);
    connection.syncLocalState = () => false;
    assert.equal(manager._flushPendingLocalChange(connection), false);
    assert.equal(manager.syncTimer, null);
});
