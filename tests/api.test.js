import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApiRequest } from '../server/src/api.mjs';

test('board list pagination exposes every owned and shared board', async () => {
    const rows = Array.from({ length: 450 }, (_, index) => ({
        id: String(index),
        owner_user_id: index % 2 ? 'another_user' : 'user_a',
        title: `Board ${index}`,
        updated_at: 450 - index,
        role: index % 2 ? 'editor' : 'owner'
    }));
    const database = {
        prepare(sql) {
            let bindings = [];
            return {
                bind(...values) { bindings = values; return this; },
                async all() {
                    assert.match(sql, /LIMIT \? OFFSET \?$/);
                    assert.deepEqual(bindings.slice(0, 2), ['user_a', 'user_a']);
                    const [, , limit, offset] = bindings;
                    return { results: rows.slice(offset, offset + limit) };
                }
            };
        }
    };

    const allBoards = [];
    for (const offset of [0, 200, 400]) {
        const response = await handleApiRequest(
            new Request(`https://whiteboard.test/api/boards${offset ? `?offset=${offset}` : ''}`),
            { DB: database },
            'user_a'
        );
        const payload = await response.json();
        assert.equal(response.status, 200);
        allBoards.push(...payload.boards);
        if (offset < 400) {
            assert.equal(payload.hasMore, true);
            assert.equal(payload.nextOffset, offset + 200);
        } else {
            assert.equal(payload.hasMore, false);
            assert.equal(payload.nextOffset, null);
        }
    }

    assert.equal(allBoards.length, 450);
    assert.equal(new Set(allBoards.map(board => board.id)).size, 450);
    assert.equal(allBoards[0].title, 'Board 0');
    assert.equal(allBoards.at(-1).title, 'Board 449');
});

test('board list rejects invalid pagination offsets', async () => {
    let queryCount = 0;
    const database = { prepare() { queryCount++; throw new Error('unexpected query'); } };
    for (const value of ['-1', 'NaN', '1.5', '1000001', '9007199254740992']) {
        const response = await handleApiRequest(
            new Request(`https://whiteboard.test/api/boards?offset=${value}`),
            { DB: database },
            'user_a'
        );
        assert.equal(response.status, 400, `offset ${value} should be rejected`);
    }

    assert.equal(queryCount, 0);
});

test('board list pages still require an authenticated user', async () => {
    let queried = false;
    const response = await handleApiRequest(
        new Request('https://whiteboard.test/api/boards?offset=200'),
        { DB: { prepare() { queried = true; throw new Error('unexpected query'); } } }
    );

    assert.equal(response.status, 401);
    assert.equal(queried, false);
});

test('board list pages use a unique tie-breaker for equal update timestamps', async () => {
    let query = '';
    const database = {
        prepare(sql) {
            query = sql;
            return {
                bind() { return this; },
                async all() { return { results: [] }; }
            };
        }
    };

    await handleApiRequest(
        new Request('https://whiteboard.test/api/boards'),
        { DB: database },
        'user_a'
    );

    assert.match(query, /ORDER BY updated_at DESC, id DESC LIMIT \? OFFSET \?$/);
});
