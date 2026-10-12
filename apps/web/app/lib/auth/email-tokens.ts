// Single-use email tokens for verification and password reset (A5). Server-only.
import type { EmailTokenPurpose } from '@civicsignal/db'
import { getPool, query, queryOne, type Queryable } from '@civicsignal/db'
import { generateToken, hashToken } from './crypto'

export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
}

/** Issue a token for a purpose. Earlier unused tokens of that purpose stop working. Returns the raw token. */
export const issueEmailToken = async (userId: string, purpose: EmailTokenPurpose, db: Queryable = getPool()): Promise<string> => {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS[purpose])
  await query(
    'update email_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null',
    [userId, purpose],
    db,
  )
  await query(
    'insert into email_tokens (user_id, purpose, token_hash, expires_at) values ($1, $2, $3, $4)',
    [userId, purpose, hashToken(token), expiresAt.toISOString()],
    db,
  )
  return token
}

/**
 * Use a token: only once (used_at is null), only before expires_at, only for its purpose.
 * Atomic, so two concurrent uses cannot both succeed. Returns the token's user id, or null.
 */
export const consumeEmailToken = async (token: string, purpose: EmailTokenPurpose, db: Queryable = getPool()): Promise<string | null> => {
  if (!token) return null
  const row = await queryOne<{ user_id: string }>(
    `update email_tokens set used_at = now()
     where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
     returning user_id`,
    [hashToken(token), purpose],
    db,
  )
  return row?.user_id ?? null
}
