// @vitest-environment node
// Account flows against Postgres: signup → verify → login → vote → logout, password reset, account
// takeover before verification, rate limits, the auth table rules (A1–A5) and the CSRF check.
// Skipped without TEST_DATABASE_URL.
import { describe, expect, it } from 'vitest'
import { query, queryOne } from '@civicsignal/db'
import { hashToken } from '@/lib/auth/crypto'
import { validateSessionToken } from '@/lib/auth/session'
import * as signup from '@/api/auth/signup/route'
import * as login from '@/api/auth/login/route'
import * as logout from '@/api/auth/logout/route'
import * as resend from '@/api/auth/resend/route'
import * as forgot from '@/api/auth/forgot/route'
import * as reset from '@/api/auth/reset/route'
import * as session from '@/api/auth/session/route'
import * as verify from '@/api/auth/verify/route'
import * as adminPolls from '@/api/admin/polls/route'
import * as publish from '@/api/admin/polls/[id]/publish/route'
import * as vote from '@/api/polls/[id]/vote/route'
import { call, count, createUser, hasDatabase, loggedLinks, pollBody, seenBodies, sessionFrom, useTestDatabase, voteFor } from './harness'

const tokenFrom = (link: string | undefined) => new URL(link ?? 'http://x/').searchParams.get('token') ?? ''
const lastLink = (path: string) => [...loggedLinks].reverse().find((link) => new URL(link).pathname === path)
const lastToken = (path: string) => tokenFrom(lastLink(path))

let ipCounter = 0
const freshIp = () => `198.51.100.${++ipCounter}`

const signUp = (email: string, password: string, ip = freshIp()) =>
  call(signup.POST, { method: 'POST', ip, body: { email, password } })
const logIn = (email: string, password: string, ip = freshIp(), as?: string) =>
  call(login.POST, { method: 'POST', ip, as, body: { email, password } })
const confirm = (token: string, password: string, ip = freshIp()) =>
  call(verify.POST, { method: 'POST', ip, body: { token, password } })

describe.skipIf(!hasDatabase)('auth against Postgres', () => {
  useTestDatabase()

  it('signup → verify → login → vote → logout', async () => {
    const admin = await createUser({ admin: true })
    const created = await call(adminPolls.POST, { method: 'POST', as: admin.token, body: await pollBody() })
    const pollId = created.body.data.poll.id as string
    await call(publish.POST, { method: 'POST', as: admin.token, params: { id: pollId } })

    // Signup: an account and a verification link (logged in development). No session yet.
    const email = `Flow.${Date.now()}@Example.com`
    const signedUp = await signUp(email, 'a strong password')
    expect(signedUp.status).toBe(200)
    expect(signedUp.body).toEqual({ success: true })
    expect(sessionFrom(signedUp)).toBeNull()
    const user = await queryOne<{ id: string; email: string; password_hash: string; email_verified_at: string | null }>(
      'select id, email, password_hash, email_verified_at from users where email = $1',
      [email.toLowerCase()],
    )
    expect(user?.email).toBe(email.toLowerCase())
    expect(user?.password_hash).toMatch(/^\$argon2id\$/)
    expect(user?.email_verified_at).toBeNull()
    expect(lastLink('/auth/verify')).toMatch(/^http:\/\/civic\.test\/auth\/verify\?token=/)
    const verifyToken = lastToken('/auth/verify')

    // Unverified users can sign in but cannot vote (R1).
    const early = await logIn(email, 'a strong password')
    expect(early.status).toBe(200)
    expect(early.body.data.verified).toBe(false)
    const earlyToken = sessionFrom(early)!
    const blocked = await call(vote.POST, { method: 'POST', as: earlyToken, params: { id: pollId }, body: voteFor('Yes') })
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('UNVERIFIED')

    // Verify: the token plus the password confirm the email once, mark the profile verified, end
    // every earlier session and start a new one.
    const wrong = await confirm(verifyToken, 'not the password')
    expect(wrong.status).toBe(400)
    expect(wrong.body.code).toBe('WRONG_PASSWORD')
    const verified = await confirm(verifyToken, 'a strong password')
    expect(verified.status).toBe(200)
    const verifiedToken = sessionFrom(verified)!
    expect(verifiedToken).toBeTruthy()
    expect(await validateSessionToken(earlyToken)).toBeNull()
    expect((await validateSessionToken(verifiedToken))?.user.verified).toBe(true)
    expect((await queryOne<{ verified: boolean }>('select verified from profiles where id = $1', [user!.id]))?.verified).toBe(true)
    const again = await confirm(verifyToken, 'a strong password')
    expect(again.body.code).toBe('INVALID_TOKEN')

    // Login rotates the session: the token the browser presented stops working.
    const loggedIn = await logIn(email, 'a strong password', freshIp(), verifiedToken)
    expect(loggedIn.status).toBe(200)
    expect(loggedIn.body.data).toMatchObject({ verified: true })
    const token = sessionFrom(loggedIn)!
    expect(token).not.toBe(verifiedToken)
    expect(await validateSessionToken(verifiedToken)).toBeNull()
    const cookie = loggedIn.headers.getSetCookie().find((c) => c.startsWith('cs_session='))!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Path=\//)
    expect(cookie).toMatch(/Expires=/)
    expect(cookie).not.toMatch(/Secure/) // NODE_ENV is test; production adds Secure and the __Host- prefix

    const me = await call(session.GET, { as: token })
    expect(me.body.data.user).toMatchObject({ id: user!.id, email: email.toLowerCase(), verified: true, isAdmin: false })

    const voted = await call(vote.POST, { method: 'POST', as: token, params: { id: pollId }, body: voteFor('Yes') })
    expect(voted.status).toBe(200)
    expect(voted.body.data.receipt.hash).toMatch(/^[0-9a-f]+$/)

    // Logout deletes the session row and clears the cookie.
    const out = await call(logout.POST, { method: 'POST', as: token })
    expect(out.status).toBe(200)
    expect(out.headers.getSetCookie().join()).toMatch(/cs_session=;/)
    expect(await count('sessions', 'token_hash = $1', [hashToken(token)])).toBe(0)
    expect((await call(session.GET, { as: token })).body.data.user).toBeNull()
    const after = await call(vote.POST, { method: 'POST', as: token, params: { id: pollId }, body: voteFor('No') })
    expect(after.status).toBe(401)
  })

  describe('account takeover before verification', () => {
    it('an attacker who signed up first loses the account when the owner signs up and verifies', async () => {
      const email = `victim1.${Date.now()}@example.com`
      await signUp(email, 'attacker password')
      const attacker = sessionFrom(await logIn(email, 'attacker password'))!
      expect(await validateSessionToken(attacker)).not.toBeNull()

      // The owner signs up: the password becomes theirs and the attacker's session ends.
      await signUp(email, 'owner password')
      expect(await validateSessionToken(attacker)).toBeNull()
      expect((await logIn(email, 'attacker password')).status).toBe(401)

      const verified = await confirm(lastToken('/auth/verify'), 'owner password')
      expect(verified.status).toBe(200)
      expect((await logIn(email, 'attacker password')).status).toBe(401)
      expect((await logIn(email, 'owner password')).status).toBe(200)
    })

    it('an attacker who signs up after the owner cannot get the owner to confirm the attacker’s password', async () => {
      const email = `victim2.${Date.now()}@example.com`
      await signUp(email, 'owner password')
      await signUp(email, 'attacker password')
      const attacker = sessionFrom(await logIn(email, 'attacker password'))!

      // The owner opens the newest link and enters their own password: refused, nothing verified.
      const refused = await confirm(lastToken('/auth/verify'), 'owner password')
      expect(refused.body.code).toBe('WRONG_PASSWORD')
      expect((await queryOne<{ v: string | null }>('select email_verified_at as v from users where email = $1', [email]))?.v).toBeNull()

      // Signing up again restores the owner's password and ends the attacker's session; then it verifies.
      await signUp(email, 'owner password')
      expect(await validateSessionToken(attacker)).toBeNull()
      expect((await confirm(lastToken('/auth/verify'), 'owner password')).status).toBe(200)
      expect((await logIn(email, 'attacker password')).status).toBe(401)
    })

    it('verifying ends every earlier session of the account', async () => {
      const email = `sessions.${Date.now()}@example.com`
      await signUp(email, 'a strong password')
      const token = lastToken('/auth/verify')
      const a = sessionFrom(await logIn(email, 'a strong password'))!
      const b = sessionFrom(await logIn(email, 'a strong password'))!
      await confirm(token, 'a strong password')
      expect(await validateSessionToken(a)).toBeNull()
      expect(await validateSessionToken(b)).toBeNull()
    })
  })

  it('rejects a wrong password without saying whether the email exists', async () => {
    const user = await createUser()
    const ip = freshIp()
    const wrong = await logIn(user.email, 'not the password', ip)
    const unknown = await logIn('nobody@test.civicsignal', 'whatever pw', ip)
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
    expect(sessionFrom(wrong)).toBeNull()
  })

  it('signup with a verified email answers the same and changes nothing', async () => {
    const user = await createUser()
    const before = await queryOne<{ password_hash: string }>('select password_hash from users where id = $1', [user.id])
    const res = await signUp(user.email, 'another password')
    expect(res.body).toEqual({ success: true })
    const after = await queryOne<{ password_hash: string }>('select password_hash from users where id = $1', [user.id])
    expect(after?.password_hash).toBe(before?.password_hash)
    expect(await validateSessionToken(user.token)).not.toBeNull()
  })

  it('resend issues a new verification link and retires the old one', async () => {
    const email = `resend.${Date.now()}@example.com`
    await signUp(email, 'a strong password')
    const first = lastToken('/auth/verify')
    await call(resend.POST, { method: 'POST', ip: freshIp(), body: { email } })
    const second = lastToken('/auth/verify')
    expect(second).not.toBe(first)
    expect((await confirm(first, 'a strong password')).body.code).toBe('INVALID_TOKEN')
    expect((await confirm(second, 'a strong password')).status).toBe(200)
  })

  it('password reset sets the new password and ends every session', async () => {
    const user = await createUser()
    const other = (await createUser()).token
    const ip = freshIp()
    const second = sessionFrom(await logIn(user.email, user.password, ip))!

    const asked = await call(forgot.POST, { method: 'POST', ip, body: { email: user.email } })
    expect(asked.body).toEqual({ success: true })
    expect(lastLink('/auth/reset')).toMatch(/^http:\/\/civic\.test\/auth\/reset\?token=/)
    const token = lastToken('/auth/reset')

    const weak = await call(reset.POST, { method: 'POST', ip, body: { token, password: 'short' } })
    expect(weak.status).toBe(400)
    const done = await call(reset.POST, { method: 'POST', ip, body: { token, password: 'a brand new password' } })
    expect(done.status).toBe(200)

    expect(await validateSessionToken(user.token)).toBeNull()
    expect(await validateSessionToken(second)).toBeNull()
    expect(await validateSessionToken(other)).not.toBeNull()
    expect((await logIn(user.email, user.password, ip)).status).toBe(401)
    expect((await logIn(user.email, 'a brand new password', ip)).status).toBe(200)

    const reused = await call(reset.POST, { method: 'POST', ip, body: { token, password: 'yet another password' } })
    expect(reused.status).toBe(400)
    expect(reused.body.code).toBe('INVALID_TOKEN')
  })

  it('forgot-password answers the same for an unknown email and sends nothing', async () => {
    const before = loggedLinks.length
    const res = await call(forgot.POST, { method: 'POST', ip: freshIp(), body: { email: 'ghost@test.civicsignal' } })
    expect(res.body).toEqual({ success: true })
    expect(loggedLinks.length).toBe(before)
  })

  describe('rate limits', () => {
    it('login: 10 failures per email and IP; the owner can still sign in from elsewhere', async () => {
      const user = await createUser()
      const attackerIp = freshIp()
      const statuses: number[] = []
      for (let i = 0; i < 11; i++) statuses.push((await logIn(user.email, `wrong password ${i}`, attackerIp)).status)
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
      expect(statuses[10]).toBe(429)
      // Even the right password is refused from that IP for now...
      expect((await logIn(user.email, user.password, attackerIp)).status).toBe(429)
      // ...but the owner, from their own IP, is not locked out.
      expect((await logIn(user.email, user.password)).status).toBe(200)
    })

    it('login: successes do not count against the email', async () => {
      const user = await createUser()
      const ip = freshIp()
      for (let i = 0; i < 12; i++) expect((await logIn(user.email, user.password, ip)).status).toBe(200)
    })

    it('login: concurrent wrong passwords cannot overshoot the per email+IP cap', async () => {
      const user = await createUser()
      const ip = freshIp()
      const statuses = await Promise.all(Array.from({ length: 15 }, (_, i) => logIn(user.email, `wrong ${i}`, ip).then((r) => r.status)))
      expect(statuses.filter((s) => s === 401)).toHaveLength(10)
      expect(statuses.filter((s) => s === 429)).toHaveLength(5)
    })

    it('login: locking an account out takes 100 failures from at least 10 IPs (the documented residual)', async () => {
      const user = await createUser()
      for (let ip = 0; ip < 10; ip++) {
        const attackerIp = freshIp()
        for (let i = 0; i < 10; i++) expect((await logIn(user.email, `wrong ${i}`, attackerIp)).status).toBe(401)
      }
      // 100 failures: now the email is capped everywhere for the window.
      expect((await logIn(user.email, user.password)).status).toBe(429)
    }, 120_000)

    it('login: 30 attempts per IP across accounts', async () => {
      const ip = freshIp()
      const statuses: number[] = []
      for (let i = 0; i < 31; i++) statuses.push((await logIn(`spray${i}@test.civicsignal`, 'wrong password', ip)).status)
      expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true)
      expect(statuses[30]).toBe(429)
    })

    it('signup and resend: an attacker using up a victim’s budget from one IP does not block the victim', async () => {
      const email = `victim.${Date.now()}@example.com`
      const attackerIp = freshIp()
      const statuses: number[] = []
      for (let i = 0; i < 6; i++) statuses.push((await signUp(email, `attacker password ${i}`, attackerIp)).status)
      expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true)
      expect(statuses[5]).toBe(429)
      const resends: number[] = []
      for (let i = 0; i < 6; i++) resends.push((await call(resend.POST, { method: 'POST', ip: attackerIp, body: { email } })).status)
      expect(resends.at(-1)).toBe(429)

      // The victim, from their own IP, can still sign up (taking the account back) and resend.
      const victimIp = freshIp()
      expect((await signUp(email, 'owner password', victimIp)).status).toBe(200)
      expect((await call(resend.POST, { method: 'POST', ip: victimIp, body: { email } })).status).toBe(200)
      expect((await confirm(lastToken('/auth/verify'), 'owner password', victimIp)).status).toBe(200)
    })

    it('signup: at most 20 per email per hour across IPs', async () => {
      const email = `hourly.${Date.now()}@example.com`
      for (let ip = 0; ip < 4; ip++) {
        const from = freshIp()
        for (let i = 0; i < 5; i++) expect((await signUp(email, 'a strong password', from)).status).toBe(200)
      }
      expect((await signUp(email, 'a strong password')).status).toBe(429)
    }, 120_000)

    it('each email flow has its own budget: exhausting signup and resend leaves password reset available', async () => {
      const email = `budget.${Date.now()}@example.com`
      for (let ip = 0; ip < 4; ip++) {
        const from = freshIp()
        for (let i = 0; i < 5; i++) {
          expect((await signUp(email, 'a strong password', from)).status).toBe(200)
          expect((await call(resend.POST, { method: 'POST', ip: from, body: { email } })).status).toBe(200)
        }
      }
      expect((await signUp(email, 'a strong password')).status).toBe(429)
      expect((await call(resend.POST, { method: 'POST', ip: freshIp(), body: { email } })).status).toBe(429)
      const before = loggedLinks.length
      expect((await call(forgot.POST, { method: 'POST', ip: freshIp(), body: { email } })).status).toBe(200)
      expect(loggedLinks.length).toBe(before + 1)
    }, 120_000)

    it('forgot and reset have separate per-IP limits', async () => {
      const ip = freshIp()
      for (let i = 0; i < 10; i++) {
        expect((await call(forgot.POST, { method: 'POST', ip, body: { email: `nobody${i}@test.civicsignal` } })).status).toBe(200)
      }
      expect((await call(forgot.POST, { method: 'POST', ip, body: { email: 'nobody-more@test.civicsignal' } })).status).toBe(429)
      // The reset form from that IP is still served (the token is checked, not the forgot budget).
      const res = await call(reset.POST, { method: 'POST', ip, body: { token: 'not-a-token', password: 'a fine new password' } })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_TOKEN')
    })

    it('verify: wrong passwords spend the link after 5 and count toward the login failure limits', async () => {
      const email = `guess.${Date.now()}@example.com`
      await signUp(email, 'the real password')
      const token = lastToken('/auth/verify')
      const ip = freshIp()
      const codes: string[] = []
      for (let i = 0; i < 5; i++) codes.push((await confirm(token, `guess ${i}`, ip)).body.code)
      expect(codes).toEqual(['WRONG_PASSWORD', 'WRONG_PASSWORD', 'WRONG_PASSWORD', 'WRONG_PASSWORD', 'TOKEN_SPENT'])
      // Spent: even the right password does nothing now.
      expect((await confirm(token, 'the real password', ip)).body.code).toBe('INVALID_TOKEN')
      expect((await queryOne<{ v: string | null }>('select email_verified_at as v from users where email = $1', [email]))?.v).toBeNull()

      // The 5 wrong verify passwords used half of this email+IP's 10 failures.
      for (let i = 0; i < 5; i++) expect((await logIn(email, `login guess ${i}`, ip)).status).toBe(401)
      expect((await logIn(email, 'the real password', ip)).status).toBe(429)
    })

    it('verify: concurrent wrong passwords are counted one by one on the token', async () => {
      const email = `race.${Date.now()}@example.com`
      await signUp(email, 'the real password')
      const token = lastToken('/auth/verify')
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => confirm(token, `guess ${i}`, freshIp())))
      const codes = results.map((r) => r.body.code)
      expect(codes.filter((c) => c === 'TOKEN_SPENT')).toHaveLength(1)
      expect(codes.filter((c) => c === 'WRONG_PASSWORD')).toHaveLength(4)
      expect(codes.filter((c) => c === 'INVALID_TOKEN')).toHaveLength(3)
      const row = await queryOne<{ failed_attempts: number; used_at: string | null }>(
        'select failed_attempts, used_at from email_tokens where token_hash = $1',
        [hashToken(token)],
      )
      expect(row?.failed_attempts).toBe(5)
      expect(row?.used_at).not.toBeNull()
    })
  })

  it('refuses a mutating request from another origin, or with no origin (CSRF)', async () => {
    const user = await createUser()
    const evil = await call(logout.POST, { method: 'POST', as: user.token, origin: 'https://evil.example' })
    expect(evil.status).toBe(403)
    expect(evil.body.code).toBe('BAD_ORIGIN')
    const none = await call(logout.POST, { method: 'POST', as: user.token, origin: null })
    expect(none.status).toBe(403)
    expect(await validateSessionToken(user.token)).not.toBeNull()
  })

  it('A1: no route returns rows of users, sessions or email_tokens', async () => {
    const user = await createUser()
    const me = await call(session.GET, { as: user.token })
    expect(Object.keys(me.body.data.user).sort()).toEqual(['email', 'handle', 'id', 'isAdmin', 'verified'])
    const loggedIn = await logIn(user.email, user.password)
    expect(Object.keys(loggedIn.body.data).sort()).toEqual(['handle', 'verified'])
  })

  it('A2: the database stores only hashes; responses never carry them', async () => {
    const user = await createUser()
    const row = await queryOne<{ token_hash: string }>('select token_hash from sessions where token_hash = $1', [hashToken(user.token)])
    expect(row?.token_hash).toBe(hashToken(user.token))
    expect(await count('sessions', 'token_hash = $1', [user.token])).toBe(0)
    const hashes = await query<{ h: string }>('select password_hash as h from users union all select token_hash from sessions union all select token_hash from email_tokens')
    const responses = seenBodies.join('\n')
    for (const { h } of hashes) expect(responses.includes(h)).toBe(false)
  })

  it('A3: the session route shows only the caller’s own account', async () => {
    const alice = await createUser()
    await createUser({ admin: true })
    const me = await call(session.GET, { as: alice.token })
    expect(me.body.data.user).toMatchObject({ id: alice.id, email: alice.email, isAdmin: false })
    expect((await call(session.GET)).body.data.user).toBeNull()
  })

  it('A4: signup cannot make an admin', async () => {
    const email = `wannabe.${Date.now()}@example.com`
    await call(signup.POST, { method: 'POST', ip: freshIp(), body: { email, password: 'a strong password', is_admin: true, isAdmin: true } })
    const row = await queryOne<{ is_admin: boolean }>('select is_admin from users where email = $1', [email])
    expect(row?.is_admin).toBe(false)
  })

  it('A5: expired sessions and expired, used or wrong-purpose email tokens do not work', async () => {
    const user = await createUser()
    await query(`update sessions set expires_at = now() - interval '1 second' where token_hash = $1`, [hashToken(user.token)])
    expect(await validateSessionToken(user.token)).toBeNull()
    expect((await call(session.GET, { as: user.token })).body.data.user).toBeNull()

    const email = `tokens.${Date.now()}@example.com`
    await signUp(email, 'a strong password')
    const verifyToken = lastToken('/auth/verify')
    // A verify token is not a reset token.
    expect((await call(reset.POST, { method: 'POST', ip: freshIp(), body: { token: verifyToken, password: 'a new password!' } })).status).toBe(400)
    // An expired one does nothing.
    await query(`update email_tokens set expires_at = now() - interval '1 second' where token_hash = $1`, [hashToken(verifyToken)])
    expect((await confirm(verifyToken, 'a strong password')).body.code).toBe('INVALID_TOKEN')
    const row = await queryOne<{ email_verified_at: string | null }>('select email_verified_at from users where email = $1', [email])
    expect(row?.email_verified_at).toBeNull()
  })

  it('A5: a session in use slides its expiry forward', async () => {
    const user = await createUser()
    await query(
      `update sessions set expires_at = now() + interval '2 days', last_seen_at = now() - interval '2 hours' where token_hash = $1`,
      [hashToken(user.token)],
    )
    const current = await validateSessionToken(user.token)
    expect(current!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
    const row = await queryOne<{ expires_at: string }>('select expires_at from sessions where token_hash = $1', [hashToken(user.token)])
    expect(new Date(row!.expires_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
  })
})
