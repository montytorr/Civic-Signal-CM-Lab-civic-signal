// Sessions backed by the sessions table (A1, A2, A5). Server-only.
import { getPool, query, queryOne, type Queryable } from '@civicsignal/db'
import { SESSION_TTL_MS, readSessionToken } from './cookie'
import { generateToken, hashToken } from './crypto'

/** The signed-in user as the server sees it. Read fresh from the database on every request. */
export interface AuthUser {
  id: string
  email: string
  handle: string
  /** profiles.verified: set when the email is confirmed (R1, R2). */
  verified: boolean
  /** users.is_admin (A4). */
  isAdmin: boolean
}

export interface AuthSession {
  sessionId: string
  expiresAt: Date
  user: AuthUser
}

// Extend a session at most once per interval, so a busy user does not write on every request.
export const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000

/** Start a session for a user. Returns the raw token for the cookie; only its hash is stored. */
export const createSession = async (userId: string, db: Queryable = getPool()) => {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await query(
    'insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)',
    [userId, hashToken(token), expiresAt.toISOString()],
    db,
  )
  return { token, expiresAt }
}

interface SessionJoinRow {
  session_id: string
  expires_at: string
  last_seen_at: string
  user_id: string
  email: string
  is_admin: boolean
  handle: string | null
  verified: boolean | null
}

/**
 * Look up a session token. A5: valid only while expires_at > now(). Sliding expiry: a session in
 * use is pushed back to 30 days from now (at most once per SESSION_REFRESH_INTERVAL_MS).
 */
export const validateSessionToken = async (token: string | null | undefined, db: Queryable = getPool()): Promise<AuthSession | null> => {
  if (!token) return null
  const row = await queryOne<SessionJoinRow & Record<string, unknown>>(
    `select s.id as session_id, s.expires_at, s.last_seen_at,
            u.id as user_id, u.email, u.is_admin, p.handle, p.verified
     from sessions s
     join users u on u.id = s.user_id
     left join profiles p on p.id = u.id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
    db,
  )
  if (!row) return null

  let expiresAt = new Date(row.expires_at)
  if (Date.now() - new Date(row.last_seen_at).getTime() > SESSION_REFRESH_INTERVAL_MS) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await query('update sessions set last_seen_at = now(), expires_at = $2 where id = $1', [row.session_id, expiresAt.toISOString()], db)
  }

  return {
    sessionId: row.session_id,
    expiresAt,
    user: {
      id: row.user_id,
      email: row.email,
      handle: row.handle ?? '',
      verified: row.verified === true,
      isAdmin: row.is_admin === true,
    },
  }
}

/** The session behind a route handler's request cookie, or null. */
export const getRequestSession = (req: Request): Promise<AuthSession | null> =>
  validateSessionToken(readSessionToken(req.headers.get('cookie')))

/** The signed-in user behind a route handler's request, or null. */
export const getRequestViewer = async (req: Request): Promise<AuthUser | null> => (await getRequestSession(req))?.user ?? null

/** End one session (logout, or rotation on login). */
export const deleteSessionToken = async (token: string | null | undefined, db: Queryable = getPool()) => {
  if (!token) return
  await query('delete from sessions where token_hash = $1', [hashToken(token)], db)
}

/** End every session of a user (A5: after a password reset). */
export const deleteUserSessions = async (userId: string, db: Queryable = getPool()) => {
  await query('delete from sessions where user_id = $1', [userId], db)
}
