const MAX_BODY_BYTES = 32 * 1024;
const MAX_TITLE_LENGTH = 80;
const MAX_BOARDS_PER_USER = 500;
const MAX_MEMBERS_PER_BOARD = 100;
const MAX_LINKS_PER_BOARD = 100;
const TICKET_LIFETIME_MS = 30_000;
const MAX_LINK_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function hasDatabase(env) {
  return env?.DB && typeof env.DB.prepare === 'function';
}

function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomId() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashToken(value, secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('TICKET_HASH_SECRET is not configured.');
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return { error: error('Request body is too large.', 413) };
  const chunks = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: error('Request body is too large.', 413) };
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
    return { value };
  } catch {
    return { error: error('Invalid JSON body.') };
  }
}

async function getBoardAccess(env, boardId, userId) {
  const board = await env.DB.prepare(
    'SELECT id, owner_user_id, title, created_at, updated_at, cleanup_pending, schema_version FROM boards WHERE id = ? AND deleted_at IS NULL'
  ).bind(boardId).first();
  if (!board) return null;
  if (board.owner_user_id === userId) return { board, role: 'owner' };
  const member = await env.DB.prepare(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?'
  ).bind(boardId, userId).first();
  return member ? { board, role: member.role } : null;
}

async function createTicket(env, { boardId, userId = null, role, shareLinkId = null }) {
  const ticket = randomToken();
  const now = Date.now();
  const tokenHash = await hashToken(ticket, env.TICKET_HASH_SECRET);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM connect_tickets WHERE expires_at <= ?').bind(now),
    env.DB.prepare('UPDATE boards SET updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(now, boardId)
  ]);
  await env.DB.prepare(
    `INSERT INTO connect_tickets (token_hash, board_id, user_id, role, share_link_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(tokenHash, boardId, userId, role, shareLinkId, now + TICKET_LIFETIME_MS, now).run();
  return { ticket, expiresAt: now + TICKET_LIFETIME_MS };
}

async function createBoard(env, userId, title) {
  const id = randomId();
  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO boards (id, owner_user_id, title, created_at, updated_at, cleanup_pending, schema_version)
     SELECT ?, ?, ?, ?, ?, 0, 1
      WHERE (SELECT COUNT(*) FROM boards WHERE owner_user_id = ? AND deleted_at IS NULL) < ?`
  ).bind(id, userId, title, now, now, userId, MAX_BOARDS_PER_USER).run();
  if (result?.meta?.changes !== 1) return null;
  return { id, owner_user_id: userId, title, created_at: now, updated_at: now, cleanup_pending: 0, schema_version: 1 };
}

async function getBoardByShareToken(env, token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
  let tokenHash;
  try {
    tokenHash = await hashToken(token, env.TICKET_HASH_SECRET);
  } catch {
    return null;
  }
  return env.DB.prepare(
    `SELECT b.id, b.title, l.id AS share_link_id
       FROM share_links l JOIN boards b ON b.id = l.board_id
      WHERE l.token_hash = ? AND l.revoked_at IS NULL AND l.expires_at > ? AND b.deleted_at IS NULL`
  ).bind(tokenHash, Date.now()).first();
}

async function listBoards(env, userId) {
  return env.DB.prepare(
    `SELECT id, title, owner_user_id, created_at, updated_at, cleanup_pending, schema_version, 'owner' AS role
       FROM boards WHERE owner_user_id = ? AND (deleted_at IS NULL OR cleanup_pending = 1)
     UNION ALL
     SELECT b.id, b.title, b.owner_user_id, b.created_at, b.updated_at, 0 AS cleanup_pending, b.schema_version, m.role
       FROM board_members m JOIN boards b ON b.id = m.board_id
      WHERE m.user_id = ? AND b.deleted_at IS NULL
     ORDER BY updated_at DESC LIMIT 200`
  ).bind(userId, userId).all();
}

async function listMembers(env, boardId) {
  return env.DB.prepare(
    `SELECT user_id, email_address, role, created_at FROM board_members WHERE board_id = ? ORDER BY created_at ASC LIMIT ?`
  ).bind(boardId, MAX_MEMBERS_PER_BOARD).all();
}

async function findVerifiedUserByEmail(clerkClient, email) {
  if (!clerkClient?.users?.getUserList) throw new Error('Account lookup is not configured.');
  const response = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
  const matches = (response?.data || []).filter(user =>
    user.emailAddresses?.some(address =>
      String(address.emailAddress || '').trim().toLowerCase() === email &&
      address.verification?.status === 'verified'
    )
  );
  return matches.length === 1 ? matches[0] : null;
}

async function upsertMember(env, boardId, userId, emailAddress, role) {
  const result = await env.DB.prepare(
    `INSERT INTO board_members (board_id, user_id, email_address, role, created_at)
     SELECT ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM boards WHERE id = ? AND deleted_at IS NULL)
        AND (EXISTS (SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?)
          OR (SELECT COUNT(*) FROM board_members WHERE board_id = ?) < ?)
     ON CONFLICT(board_id, user_id) DO UPDATE SET role = excluded.role,
       email_address = COALESCE(excluded.email_address, board_members.email_address)`
  ).bind(boardId, userId, emailAddress, role, Date.now(), boardId, boardId, userId, boardId, MAX_MEMBERS_PER_BOARD).run();
  if (result?.meta?.changes !== 1) {
    const board = await env.DB.prepare('SELECT 1 AS found FROM boards WHERE id = ? AND deleted_at IS NULL')
      .bind(boardId).first();
    return { error: board ? error('Board member limit reached.', 409) : error('Board not found.', 404) };
  }
  return { member: { user_id: userId, email_address: emailAddress, role } };
}

async function listLinks(env, boardId) {
  return env.DB.prepare(
    `SELECT id, expires_at, revoked_at, created_at FROM share_links WHERE board_id = ? ORDER BY created_at DESC LIMIT 100`
  ).bind(boardId).all();
}

async function validateLiveLink(env, shareLinkId, boardId) {
  return env.DB.prepare(
    `SELECT 1 AS valid FROM share_links l JOIN boards b ON b.id = l.board_id
      WHERE l.id = ? AND l.board_id = ? AND l.revoked_at IS NULL
        AND l.expires_at > ? AND b.deleted_at IS NULL`
  ).bind(shareLinkId, boardId, Date.now()).first();
}

/** Consume a short-lived ticket exactly once before handing the socket to its room. */
export async function consumeConnectTicket(env, ticket, boardId) {
  if (typeof ticket !== 'string' || ticket.length < 32 || ticket.length > 128 || !hasDatabase(env)) return null;
  let tokenHash;
  try {
    tokenHash = await hashToken(ticket, env.TICKET_HASH_SECRET);
  } catch {
    return null;
  }
  const now = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(
      `SELECT board_id, user_id, role, share_link_id, expires_at
         FROM connect_tickets WHERE token_hash = ? AND board_id = ? AND expires_at > ?`
    ).bind(tokenHash, boardId, now),
    env.DB.prepare(
      `DELETE FROM connect_tickets WHERE token_hash = ? AND board_id = ? AND expires_at > ?`
    ).bind(tokenHash, boardId, now)
  ]);
  const ticketRow = results?.[0]?.results?.[0];
  const removedCount = results?.[1]?.meta?.changes ?? 0;
  if (!ticketRow || removedCount !== 1) return null;
  if (ticketRow.share_link_id) {
    if (!await validateLiveLink(env, ticketRow.share_link_id, boardId)) return null;
  } else {
    const current = await getBoardAccess(env, boardId, ticketRow.user_id);
    if (!current || (current.role !== ticketRow.role && current.role !== 'owner')) return null;
  }
  return ticketRow;
}

async function invalidateRoom(env, boardId, { userId, shareLinkId, all = false } = {}) {
  const id = env.WHITEBOARD_ROOM.idFromName(boardId);
  const room = env.WHITEBOARD_ROOM.get(id);
  const url = new URL(`https://room.internal/${boardId}/_invalidate`);
  const headers = { 'Content-Type': 'application/json' };
  const response = await room.fetch(new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, shareLinkId, all })
  }));
  if (!response.ok) throw new Error('Unable to invalidate active connections.');
}

async function purgeRoom(env, boardId) {
  const id = env.WHITEBOARD_ROOM.idFromName(boardId);
  const room = env.WHITEBOARD_ROOM.get(id);
  const response = await room.fetch(new Request(`https://room.internal/${boardId}/_purge`, { method: 'POST' }));
  if (!response.ok) throw new Error('Unable to purge deleted whiteboard data.');
}

async function ownerOnly(env, boardId, userId) {
  const access = await getBoardAccess(env, boardId, userId);
  if (!access) return { error: error('Board not found.', 404) };
  if (access.role !== 'owner') return { error: error('Owner access is required.', 403) };
  return { access };
}

export async function handleApiRequest(request, env, userId = null, clerkClient = null) {
  if (!hasDatabase(env)) return error('Cloud board storage is not configured.', 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (path === '/api/boards' && method === 'GET') {
    if (!userId) return error('Unauthorized.', 401);
    const result = await listBoards(env, userId);
    return json({ boards: result.results || [] });
  }

  if (path === '/api/boards' && method === 'POST') {
    if (!userId) return error('Unauthorized.', 401);
    const body = await readJson(request);
    if (body.error) return body.error;
    const title = typeof body.value.title === 'string' ? body.value.title.trim() : '';
    if (!title || title.length > MAX_TITLE_LENGTH) return error(`Title must be 1 to ${MAX_TITLE_LENGTH} characters.`);
    const board = await createBoard(env, userId, title);
    if (!board) return error('Board limit reached.', 409);
    return json({ board }, 201);
  }

  if (path === '/api/share/access' && method === 'POST') {
    const body = await readJson(request);
    if (body.error) return body.error;
    const shared = await getBoardByShareToken(env, body.value.token);
    if (!shared) return error('Share link is invalid or expired.', 404);
    const connection = await createTicket(env, {
      boardId: shared.id,
      role: 'viewer',
      shareLinkId: shared.share_link_id
    });
    return json({ board: { id: shared.id, title: shared.title, role: 'viewer' }, ...connection });
  }

  const connectionPath = path.match(/^\/api\/boards\/([a-f0-9]{32})\/connect-ticket$/i);
  if (connectionPath && method === 'POST') {
    if (!userId) return error('Unauthorized.', 401);
    const boardId = connectionPath[1].toLowerCase();
    const access = await getBoardAccess(env, boardId, userId);
    if (!access) return error('Board not found.', 404);
    const connection = await createTicket(env, { boardId, userId, role: access.role });
    return json({ board: { id: boardId, title: access.board.title, role: access.role }, ...connection });
  }

  const boardPath = path.match(/^\/api\/boards\/([a-f0-9]{32})(?:\/(members|links)(?:\/([A-Za-z0-9_-]{1,128}))?)?$/i);
  if (!boardPath) return error('Not found.', 404);
  if (!userId) return error('Unauthorized.', 401);
  const [, rawBoardId, subresource, subId] = boardPath;
  const boardId = rawBoardId.toLowerCase();

  if (!subresource) {
    const access = await getBoardAccess(env, boardId, userId);
    if (!access) {
      if (method === 'DELETE') {
        const deletedBoard = await env.DB.prepare(
          'SELECT owner_user_id, deleted_at, cleanup_pending FROM boards WHERE id = ?'
        ).bind(boardId).first();
        if (deletedBoard?.owner_user_id === userId && deletedBoard.deleted_at !== null && deletedBoard.cleanup_pending === 1) {
          try { await invalidateRoom(env, boardId, { all: true }); } catch (err) {
            console.error('Retrying deleted board socket invalidation failed.', err);
          }
          try {
            await purgeRoom(env, boardId);
            await env.DB.prepare('UPDATE boards SET cleanup_pending = 0 WHERE id = ? AND owner_user_id = ?')
              .bind(boardId, userId).run();
            return new Response(null, { status: 204 });
          } catch (err) {
            console.error('Retrying deleted board cleanup failed.', err);
            return json({
              error: 'Board access is revoked, but stored content cleanup failed. Retry deletion to finish cleanup.',
              cleanup_pending: true
            }, 503);
          }
        }
      }
      return error('Board not found.', 404);
    }
    if (method === 'GET') return json({ board: { ...access.board, role: access.role } });
    const owner = await ownerOnly(env, boardId, userId);
    if (owner.error) return owner.error;
    if (method === 'PATCH') {
      const body = await readJson(request);
      if (body.error) return body.error;
      const title = typeof body.value.title === 'string' ? body.value.title.trim() : '';
      if (!title || title.length > MAX_TITLE_LENGTH) return error(`Title must be 1 to ${MAX_TITLE_LENGTH} characters.`);
      const now = Date.now();
      await env.DB.prepare('UPDATE boards SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
        .bind(title, now, boardId).run();
      return json({ board: { ...owner.access.board, title, updated_at: now } });
    }
    if (method === 'DELETE') {
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare('UPDATE boards SET deleted_at = ?, cleanup_pending = 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
          .bind(now, now, boardId),
        env.DB.prepare('DELETE FROM connect_tickets WHERE board_id = ?').bind(boardId),
        env.DB.prepare('DELETE FROM board_members WHERE board_id = ?').bind(boardId),
        env.DB.prepare('UPDATE share_links SET revoked_at = ? WHERE board_id = ? AND revoked_at IS NULL')
          .bind(now, boardId)
      ]);
      try { await invalidateRoom(env, boardId, { all: true }); } catch (err) {
        console.error('Board marked deleted, but active socket invalidation failed.', err);
      }
      try {
        await purgeRoom(env, boardId);
        await env.DB.prepare('UPDATE boards SET cleanup_pending = 0 WHERE id = ? AND owner_user_id = ?')
          .bind(boardId, userId).run();
      } catch (err) {
        console.error('Board access is revoked, but stored room data could not be purged.', err);
        return json({
          error: 'Board access is revoked, but stored content cleanup failed. Retry deletion to finish cleanup.',
          cleanup_pending: true
        }, 503);
      }
      return new Response(null, { status: 204 });
    }
    return error('Method not allowed.', 405);
  }

  const owner = await ownerOnly(env, boardId, userId);
  if (owner.error) return owner.error;

  if (subresource === 'members') {
    if (method === 'GET' && !subId) {
      const result = await listMembers(env, boardId);
      return json({ members: result.results || [] });
    }
    if (method === 'POST' && !subId) {
      const body = await readJson(request);
      if (body.error) return body.error;
      const email = typeof body.value.email === 'string' ? body.value.email.trim().toLowerCase() : '';
      const role = body.value.role;
      if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error('Enter a valid email address.');
      }
      if (!['editor', 'viewer'].includes(role)) return error('Role must be editor or viewer.');
      const matchedUser = await findVerifiedUserByEmail(clerkClient, email);
      if (!matchedUser) return error('No account with that verified email was found.', 404);
      if (matchedUser.id === userId) return error('The owner does not need a member entry.');
      const result = await upsertMember(env, boardId, matchedUser.id, email, role);
      if (result.error) return result.error;
      try { await invalidateRoom(env, boardId, { userId: matchedUser.id }); } catch (err) {
        console.error('Member role changed, but active socket invalidation failed.', err);
      }
      return json({ member: result.member }, 201);
    }
    if (method === 'PUT' && subId) {
      const body = await readJson(request);
      if (body.error) return body.error;
      const role = body.value.role;
      if (!['editor', 'viewer'].includes(role)) return error('Role must be editor or viewer.');
      const memberId = subId;
      if (memberId === userId) return error('The owner does not need a member entry.');
      const existing = await env.DB.prepare('SELECT 1 AS found FROM board_members WHERE board_id = ? AND user_id = ?')
        .bind(boardId, memberId).first();
      if (!existing) return error('Member not found. Add members by verified email first.', 404);
      await env.DB.prepare('UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ?')
        .bind(role, boardId, memberId).run();
      try { await invalidateRoom(env, boardId, { userId: memberId }); } catch (err) {
        console.error('Member role changed, but active socket invalidation failed.', err);
      }
      return json({ member: { user_id: memberId, role } });
    }
    if (method === 'DELETE' && subId) {
      await env.DB.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?')
        .bind(boardId, subId).run();
      try { await invalidateRoom(env, boardId, { userId: subId }); } catch (err) {
        console.error('Member removed, but active socket closure failed.', err);
      }
      return new Response(null, { status: 204 });
    }
    return error('Method not allowed.', 405);
  }

  if (subresource === 'links') {
    if (method === 'GET' && !subId) {
      const result = await listLinks(env, boardId);
      return json({ links: result.results || [] });
    }
    if (method === 'POST' && !subId) {
      const body = await readJson(request);
      if (body.error) return body.error;
      const requestedExpiry = Number(body.value.expiresInDays ?? 7);
      if (!Number.isFinite(requestedExpiry) || requestedExpiry < 1 || requestedExpiry > 90) {
        return error('Link expiry must be between 1 and 90 days.');
      }
      const now = Date.now();
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM share_links WHERE board_id = ? AND revoked_at IS NULL AND expires_at > ?'
      ).bind(boardId, now).first();
      if ((count?.n ?? 0) >= MAX_LINKS_PER_BOARD) return error('Active share link limit reached.', 409);
      const token = randomToken();
      const linkId = randomId();
      const expiresAt = now + Math.min(MAX_LINK_LIFETIME_MS, Math.floor(requestedExpiry * 24 * 60 * 60 * 1000));
      const tokenHash = await hashToken(token, env.TICKET_HASH_SECRET);
      const result = await env.DB.prepare(
        `INSERT INTO share_links (id, board_id, token_hash, expires_at, created_at)
         SELECT ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM share_links
                  WHERE board_id = ? AND revoked_at IS NULL AND expires_at > ?) < ?`
      ).bind(linkId, boardId, tokenHash, expiresAt, now, boardId, now, MAX_LINKS_PER_BOARD).run();
      if (result?.meta?.changes !== 1) return error('Active share link limit reached.', 409);
      return json({ link: { id: linkId, token, expires_at: expiresAt, url: null } }, 201);
    }
    if (method === 'DELETE' && subId) {
      const now = Date.now();
      await env.DB.prepare('UPDATE share_links SET revoked_at = ? WHERE id = ? AND board_id = ? AND revoked_at IS NULL')
        .bind(now, subId, boardId).run();
      try { await invalidateRoom(env, boardId, { shareLinkId: subId }); } catch (err) {
        console.error('Share link revoked, but active socket closure failed.', err);
      }
      return new Response(null, { status: 204 });
    }
    return error('Method not allowed.', 405);
  }
  return error('Not found.', 404);
}
