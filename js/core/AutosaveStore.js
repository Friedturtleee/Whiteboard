/**
 * AutosaveStore — safe localStorage persistence for the board snapshot.
 *
 * - A failed load (bad JSON / failed validation) backs the raw string up under
 *   `<key>_corrupt_<timestamp>` (newest MAX_BACKUPS kept) and write-locks the
 *   key, so a debounced autosave or the pagehide flush can never overwrite the
 *   only copy of the damaged data until the user explicitly unlocks it.
 * - Save failures (quota, security errors) are reported as a result object so
 *   the UI can warn instead of silently dropping data.
 *
 * Pure module: storage and clock are injectable for tests.
 */

export const CORRUPT_INFIX = '_corrupt_';
export const MAX_CORRUPT_BACKUPS = 3;

export function isQuotaError(error) {
    if (!error) return false;
    return error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 || error.code === 1014;
}

export class AutosaveStore {
    /**
     * @param {object} [options]
     * @param {() => Storage|null} [options.getStorage] resolves the storage lazily
     *        (accessing window.localStorage itself can throw).
     * @param {() => number} [options.now]
     * @param {number} [options.maxBackups]
     */
    constructor({ getStorage = defaultStorage, now = Date.now, maxBackups = MAX_CORRUPT_BACKUPS } = {}) {
        this._getStorage = getStorage;
        this._now = now;
        this.maxBackups = maxBackups;
        this._locked = new Set();
    }

    _storage() {
        try { return this._getStorage() || null; } catch { return null; }
    }

    // ── Write lock ───────────────────────────────────────
    isLocked(key) { return this._locked.has(key); }
    lock(key) { this._locked.add(key); }
    unlock(key) { this._locked.delete(key); }

    // ── Saving ───────────────────────────────────────────
    /**
     * @param {string} key
     * @param {object|string} snapshot object (JSON.stringify'd) or a pre-serialized string
     * @returns {{ok: true} | {ok: false, reason: 'locked'|'quota'|'error'|'unavailable', error?: Error}}
     */
    save(key, snapshot) {
        if (this._locked.has(key)) return { ok: false, reason: 'locked' };
        const storage = this._storage();
        if (!storage) return { ok: false, reason: 'unavailable' };
        try {
            const text = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
            storage.setItem(key, text);
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: isQuotaError(error) ? 'quota' : 'error', error };
        }
    }

    // ── Loading ──────────────────────────────────────────
    /**
     * Read and restore the snapshot at `key`.
     * `restore(data)` must validate and apply the data, throwing when it is invalid.
     * @returns {{status: 'empty'|'ok'|'unavailable'} |
     *           {status: 'corrupt', error: Error, backupKey: string|null}}
     */
    load(key, restore) {
        const storage = this._storage();
        if (!storage) return { status: 'unavailable' };
        let raw;
        try { raw = storage.getItem(key); } catch { return { status: 'unavailable' }; }
        if (raw == null || raw === '') return { status: 'empty' };
        try {
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) {
                throw new TypeError('Autosave does not contain an elements array.');
            }
            restore(data);
            return { status: 'ok' };
        } catch (error) {
            const backupKey = this.backupCorrupt(key, raw);
            this.lock(key);
            return { status: 'corrupt', error, backupKey };
        }
    }

    // ── Corrupt backups ──────────────────────────────────
    /** @returns {string[]} backup keys for `key`, oldest first */
    listBackups(key) {
        const storage = this._storage();
        if (!storage) return [];
        const prefix = key + CORRUPT_INFIX;
        const found = [];
        try {
            for (let i = 0; i < storage.length; i++) {
                const name = storage.key(i);
                if (typeof name !== 'string' || !name.startsWith(prefix)) continue;
                const stamp = Number(name.slice(prefix.length).split('_')[0]);
                if (Number.isFinite(stamp)) found.push({ name, stamp });
            }
        } catch { return []; }
        return found
            .sort((a, b) => a.stamp - b.stamp || (a.name < b.name ? -1 : 1))
            .map(entry => entry.name);
    }

    _pruneBackups(key, keep = this.maxBackups) {
        const storage = this._storage();
        if (!storage) return;
        const backups = this.listBackups(key);
        for (const name of backups.slice(0, Math.max(0, backups.length - keep))) {
            try { storage.removeItem(name); } catch { /* ignore */ }
        }
    }

    /** Copy `raw` to a timestamped backup key. Returns the key, or null on failure. */
    backupCorrupt(key, raw) {
        const storage = this._storage();
        if (!storage || typeof raw !== 'string') return null;
        let stamp = this._now();
        const existing = new Set(this.listBackups(key));
        let backupKey = `${key}${CORRUPT_INFIX}${stamp}`;
        while (existing.has(backupKey)) backupKey = `${key}${CORRUPT_INFIX}${++stamp}`;
        // Make room first so the newest backup is never the one that gets dropped.
        this._pruneBackups(key, this.maxBackups - 1);
        try {
            storage.setItem(backupKey, raw);
        } catch {
            // Quota: free older backups and retry once.
            this._pruneBackups(key, 0);
            try { storage.setItem(backupKey, raw); } catch { return null; }
        }
        return backupKey;
    }
}

function defaultStorage() {
    return typeof localStorage === 'undefined' ? null : localStorage;
}
