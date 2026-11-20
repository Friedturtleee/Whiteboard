import test from 'node:test';
import assert from 'node:assert/strict';
import { AutosaveStore, isQuotaError } from '../js/core/AutosaveStore.js';

class MemoryStorage {
    constructor({ quota = Infinity } = {}) { this.map = new Map(); this.quota = quota; }
    get length() { return this.map.size; }
    key(i) { return [...this.map.keys()][i] ?? null; }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) {
        const used = [...this.map].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0);
        if (used + k.length + String(v).length > this.quota) {
            const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
        }
        this.map.set(k, String(v));
    }
    removeItem(k) { this.map.delete(k); }
}

const makeStore = (storage, start = 1000) => {
    let t = start;
    return new AutosaveStore({ getStorage: () => storage, now: () => t++ });
};

test('save writes and load restores a valid snapshot', () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    assert.deepEqual(store.save('k', { version: 1, elements: [] }), { ok: true });
    let restored = null;
    assert.equal(store.load('k', data => { restored = data; }).status, 'ok');
    assert.deepEqual(restored.elements, []);
    assert.equal(store.load('missing', () => {}).status, 'empty');
});

test('corrupt JSON is backed up and the key becomes write-locked', () => {
    const storage = new MemoryStorage();
    storage.setItem('k', '{not json');
    const store = makeStore(storage);
    const result = store.load('k', () => {});
    assert.equal(result.status, 'corrupt');
    assert.equal(storage.getItem(result.backupKey), '{not json');
    assert.equal(store.isLocked('k'), true);
    assert.deepEqual(store.save('k', { elements: [] }), { ok: false, reason: 'locked' });
    assert.equal(storage.getItem('k'), '{not json');
    store.unlock('k');
    assert.equal(store.save('k', { elements: [] }).ok, true);
});

test('validation failure from restore counts as corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem('k', JSON.stringify({ elements: [{ type: 'bogus' }] }));
    const store = makeStore(storage);
    const result = store.load('k', () => { throw new TypeError('bad element'); });
    assert.equal(result.status, 'corrupt');
    assert.match(result.error.message, /bad element/);
    const notArray = makeStore(storage).load('k', () => {});
    assert.equal(notArray.status, 'ok');
    storage.setItem('k', JSON.stringify({ elements: 'nope' }));
    assert.equal(makeStore(storage).load('k', () => {}).status, 'corrupt');
});

test('at most three corrupt backups are kept (oldest dropped)', () => {
    const storage = new MemoryStorage();
    const store = makeStore(storage);
    const keys = [];
    for (let i = 0; i < 5; i++) {
        storage.setItem('k', `bad${i}`);
        keys.push(store.load('k', () => {}).backupKey);
    }
    const backups = store.listBackups('k');
    assert.equal(backups.length, 3);
    assert.deepEqual(backups, keys.slice(2));
    assert.equal(storage.getItem(keys[4]), 'bad4');
});

test('quota errors are reported and keep the previous value', () => {
    const storage = new MemoryStorage({ quota: 60 });
    const store = makeStore(storage);
    assert.equal(store.save('k', 'small').ok, true);
    const result = store.save('k', 'x'.repeat(500));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'quota');
    assert.equal(storage.getItem('k'), 'small');
    assert.equal(isQuotaError(result.error), true);
});

test('unavailable storage is handled', () => {
    const store = new AutosaveStore({ getStorage: () => { throw new Error('denied'); } });
    assert.equal(store.save('k', {}).reason, 'unavailable');
    assert.equal(store.load('k', () => {}).status, 'unavailable');
});
