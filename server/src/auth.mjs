const ALLOWED_ORIGIN_SEPARATOR = /\s*,\s*/;

export function getAllowedOrigins(env) {
  const raw = typeof env?.ALLOWED_ORIGINS === 'string' ? env.ALLOWED_ORIGINS.trim() : '';
  return new Set(raw ? raw.split(ALLOWED_ORIGIN_SEPARATOR).filter(Boolean) : []);
}

/** Verify a Clerk session token and return its stable user ID. */
export async function authenticateRequest(request, env, verifyToken) {
  const secretKey = typeof env?.CLERK_SECRET_KEY === 'string'
    ? env.CLERK_SECRET_KEY.trim()
    : '';
  if (!secretKey) return { error: { status: 503, message: 'Authentication is not configured.' } };
  const authorizedParties = [...getAllowedOrigins(env)];
  if (!authorizedParties.length) {
    return { error: { status: 503, message: 'Authentication origins are not configured.' } };
  }

  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return { error: { status: 401, message: 'Unauthorized.' } };

  try {
    const claims = await verifyToken(token, {
      secretKey,
      authorizedParties
    });
    if (typeof claims?.sub !== 'string' || !claims.sub) {
      return { error: { status: 401, message: 'Unauthorized.' } };
    }
    return { userId: claims.sub };
  } catch {
    // Do not return verifier details: they can expose account or configuration data.
    return { error: { status: 401, message: 'Unauthorized.' } };
  }
}

/** Kept for existing callers/tests that only need a fail-closed auth result. */
export async function authorizeRequest(request, env, verifyToken) {
  const result = await authenticateRequest(request, env, verifyToken);
  return result.error ?? null;
}

export function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
  } catch {
    return false;
  }
  return getAllowedOrigins(env).has(origin);
}

export function getRoomId(pathname) {
  const match = pathname.match(/^\/([a-f0-9]{32})$/i);
  return match?.[1]?.toLowerCase() ?? null;
}
