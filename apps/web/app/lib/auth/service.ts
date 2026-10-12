// Account flows: signup, login, email verification, password reset. Server-only.
// Routes call these after their own rate limiting and Origin checks.
//
// Account takeover before verification: anyone can sign up with any email, so until the mailbox
// owner confirms it, an account's password and sessions are untrusted. Signing up again for an
// unverified email replaces the password and ends that account's sessions; confirming the email
// needs the account's current password (so the mailbox owner can only confirm a password they
// chose), and ends every session before starting the verifier's own.
//
// Timing: whether an email has an account must not show in response times, so emails are sent
// after the response (runAfterResponse), never awaited by the request.
import { getPool, queryOne, withTransaction, type Pool, type PoolClient } from '@civicsignal/db'
import { runAfterResponse } from '@/lib/defer'
import { generateHandle } from '@/lib/handle-generator'
import { sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email'
import { hashPassword, hashToken, verifyAgainstDummy, verifyPassword } from './crypto'
import { consumeEmailToken, issueEmailToken } from './email-tokens'
import { createSession, deleteSessionToken, deleteUserSessions } from './session'

const pool = (): Pool => getPool()

// Use the app's handle style when it is free; otherwise keep the one the profile trigger generated.
const claimHandle = async (client: PoolClient, userId: string): Promise<string> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const handle = generateHandle()
    await client.query('savepoint claim_handle')
    try {
      const { rowCount } = await client.query('update profiles set handle = $1 where id = $2', [handle, userId])
      await client.query('release savepoint claim_handle')
      if (rowCount === 1) return handle
    } catch {
      await client.query('rollback to savepoint claim_handle')
    }
  }
  const row = await client.query<{ handle: string }>('select handle from profiles where id = $1', [userId])
  return row.rows[0]?.handle ?? 'new member'
}

const verifyUrl = (baseUrl: string, token: string) => `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`
const resetUrl = (baseUrl: string, token: string) => `${baseUrl}/auth/reset?token=${encodeURIComponent(token)}`

// Queue the verification email after the response. Failures are logged without the link.
const queueVerification = (to: string, handle: string, token: string, baseUrl: string) =>
  runAfterResponse('verification email', async () => {
    const result = await sendVerificationEmail({ to, url: verifyUrl(baseUrl, token), handle })
    if (result.error) console.error('[auth] verification email failed:', result.error)
  })

/**
 * Create an account and email a verification link. The answer is the same whether or not the email
 * is taken, so signup does not reveal which emails have accounts. For an unverified account it
 * replaces the password, ends its sessions and sends a new link; for a verified one it does nothing.
 */
export const signUp = async ({ email, password, baseUrl }: { email: string; password: string; baseUrl: string }): Promise<void> => {
  const passwordHash = await hashPassword(password)
  const outcome = await withTransaction(async (client) => {
    const existing = await queryOne<{ id: string; email_verified_at: string | null; handle: string | null }>(
      `select u.id, u.email_verified_at, p.handle from users u left join profiles p on p.id = u.id where u.email = $1 for update of u`,
      [email],
      client,
    )
    if (existing) {
      if (existing.email_verified_at) return null
      await client.query('update users set password_hash = $2 where id = $1', [existing.id, passwordHash])
      await deleteUserSessions(existing.id, client)
      return { handle: existing.handle ?? 'your account', token: await issueEmailToken(existing.id, 'verify', client) }
    }
    const inserted = await client.query<{ id: string }>(
      'insert into users (email, password_hash) values ($1, $2) on conflict (email) do nothing returning id',
      [email, passwordHash],
    )
    const userId = inserted.rows[0]?.id
    if (!userId) return null
    const handle = await claimHandle(client, userId)
    return { handle, token: await issueEmailToken(userId, 'verify', client) }
  }, pool())
  if (outcome) queueVerification(email, outcome.handle, outcome.token, baseUrl)
}

/** Re-send the verification link to an unverified account. Silent for unknown or verified emails. */
export const resendVerification = async ({ email, baseUrl }: { email: string; baseUrl: string }): Promise<void> => {
  const outcome = await withTransaction(async (client) => {
    const user = await queryOne<{ id: string; email_verified_at: string | null; handle: string | null }>(
      'select u.id, u.email_verified_at, p.handle from users u left join profiles p on p.id = u.id where u.email = $1',
      [email],
      client,
    )
    if (!user || user.email_verified_at) return null
    return { handle: user.handle ?? 'your account', token: await issueEmailToken(user.id, 'verify', client) }
  }, pool())
  if (outcome) queueVerification(email, outcome.handle, outcome.token, baseUrl)
}

export type VerifyResult =
  | { ok: true; userId: string; token: string; expiresAt: Date }
  | { ok: false; reason: 'invalid_token' | 'wrong_password' | 'token_spent' }

/** Wrong passwords a verification link takes before it stops working. */
export const VERIFY_TOKEN_MAX_FAILURES = 5

/** The email a usable verify token belongs to (to key the password-failure limits), or null. */
export const verifyTokenEmail = async (token: string): Promise<string | null> => {
  const row = await queryOne<{ email: string }>(
    `select u.email from email_tokens t join users u on u.id = t.user_id
     where t.token_hash = $1 and t.purpose = 'verify' and t.used_at is null and t.expires_at > now()`,
    [hashToken(token)],
  )
  return row?.email ?? null
}

/**
 * Confirm an email with a verify token and the account's current password. On success the users
 * trigger marks the profile verified, every session of the account ends (whoever held one before
 * verification is out), and a new session starts for the verifier. A wrong password is counted on
 * the token, which is spent after VERIFY_TOKEN_MAX_FAILURES (the route also counts it against the
 * login failure limits); until then the owner can retry with the password of their latest signup.
 */
export const verifyEmail = ({ token, password }: { token: string; password: string }): Promise<VerifyResult> =>
  withTransaction(async (client) => {
    const row = await queryOne<{ id: string; user_id: string; password_hash: string }>(
      `select t.id, t.user_id, u.password_hash
       from email_tokens t join users u on u.id = t.user_id
       where t.token_hash = $1 and t.purpose = 'verify' and t.used_at is null and t.expires_at > now()
       for update of t`,
      [hashToken(token)],
      client,
    )
    if (!row) return { ok: false, reason: 'invalid_token' }
    if (!(await verifyPassword(row.password_hash, password))) {
      // The token row is locked, so concurrent wrong guesses are counted one by one.
      const counted = await queryOne<{ failed_attempts: number }>(
        `update email_tokens set failed_attempts = failed_attempts + 1,
                used_at = case when failed_attempts + 1 >= $2 then now() else used_at end
         where id = $1 returning failed_attempts`,
        [row.id, VERIFY_TOKEN_MAX_FAILURES],
        client,
      )
      return { ok: false, reason: (counted?.failed_attempts ?? 0) >= VERIFY_TOKEN_MAX_FAILURES ? 'token_spent' : 'wrong_password' }
    }

    const userId = await consumeEmailToken(token, 'verify', client)
    if (!userId) return { ok: false, reason: 'invalid_token' }
    await client.query('update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1', [userId])
    await deleteUserSessions(userId, client)
    const session = await createSession(userId, client)
    return { ok: true, userId, ...session }
  }, pool())

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; handle: string; verified: boolean }
  | { ok: false }

/** Check credentials and start a new session. The session the browser presented, if any, ends (rotation). */
export const logIn = async ({ email, password, previousToken }: { email: string; password: string; previousToken?: string | null }): Promise<LoginResult> => {
  const user = await queryOne<{ id: string; password_hash: string; handle: string | null; verified: boolean | null }>(
    'select u.id, u.password_hash, p.handle, p.verified from users u left join profiles p on p.id = u.id where u.email = $1',
    [email],
  )
  const ok = user ? await verifyPassword(user.password_hash, password) : await verifyAgainstDummy(password)
  if (!user || !ok) return { ok: false }
  await deleteSessionToken(previousToken)
  const { token, expiresAt } = await createSession(user.id)
  return { ok: true, token, expiresAt, handle: user.handle ?? '', verified: user.verified === true }
}

/** Email a reset link. Silent for unknown emails. */
export const requestPasswordReset = async ({ email, baseUrl }: { email: string; baseUrl: string }): Promise<void> => {
  const token = await withTransaction(async (client) => {
    const user = await queryOne<{ id: string }>('select id from users where email = $1', [email], client)
    if (!user) return null
    return await issueEmailToken(user.id, 'reset', client)
  }, pool())
  if (!token) return
  runAfterResponse('reset email', async () => {
    const result = await sendPasswordResetEmail({ to: email, url: resetUrl(baseUrl, token) })
    if (result.error) console.error('[auth] reset email failed:', result.error)
  })
}

/**
 * Set a new password with a reset token. A5: ends every session of the user. The reset proves the
 * mailbox, so an unverified email counts as verified afterwards. Returns false for a bad token.
 */
export const resetPassword = async ({ token, password }: { token: string; password: string }): Promise<boolean> => {
  const passwordHash = await hashPassword(password)
  return withTransaction(async (client) => {
    const userId = await consumeEmailToken(token, 'reset', client)
    if (!userId) return false
    await client.query(
      'update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $1',
      [userId, passwordHash],
    )
    await deleteUserSessions(userId, client)
    return true
  }, pool())
}
