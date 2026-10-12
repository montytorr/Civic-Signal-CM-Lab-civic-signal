// @vitest-environment node
// Auth helpers: password hashing, tokens, the session cookie, expiry and the CSRF Origin check.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSION_TTL_MS, sessionCookieName, clearedSessionCookie, readSessionToken, sessionCookie } from '@/lib/auth/cookie'
import { generateToken, hashPassword, hashToken, normalizeEmail, validatePassword, verifyPassword } from '@/lib/auth/crypto'
import { EMAIL_TOKEN_TTL_MS } from '@/lib/auth/email-tokens'
import { SESSION_REFRESH_INTERVAL_MS } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email'
import { HttpError, appUrl, assertSameOrigin, clientIp, isUuid } from '@/lib/http'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('password hashing', () => {
  it('hashes with argon2id and a per-hash salt', async () => {
    const a = await hashPassword('correct horse battery')
    const b = await hashPassword('correct horse battery')
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(a).not.toBe(b)
    expect(a).not.toContain('correct horse battery')
  })

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(hash, 'Correct horse battery')).toBe(false)
  })

  it('treats a malformed or placeholder hash as a mismatch, not an error', async () => {
    expect(await verifyPassword('!', 'anything')).toBe(false)
    expect(await verifyPassword('', 'anything')).toBe(false)
  })

  it('validates password length', () => {
    expect(validatePassword('short')).toMatch(/at least 8/)
    expect(validatePassword(undefined)).toMatch(/at least 8/)
    expect(validatePassword('x'.repeat(257))).toMatch(/at most 256/)
    expect(validatePassword('long enough')).toBeNull()
  })

  it('normalizes emails the way users.email stores them', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail(42)).toBeNull()
  })
})

describe('tokens', () => {
  it('are 32 random bytes, base64url', () => {
    const token = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(generateToken()).not.toBe(token)
  })

  it('are stored as their SHA-256 (hex), never as themselves', () => {
    const token = generateToken()
    const hash = hashToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashToken(token))
    expect(hash).not.toContain(token)
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('session cookie', () => {
  it('is httpOnly, SameSite=Lax, path /, and carries the raw token', () => {
    const expires = new Date(Date.now() + SESSION_TTL_MS)
    const cookie = sessionCookie('tok', expires)
    expect(cookie).toMatchObject({ name: 'cs_session', value: 'tok', httpOnly: true, sameSite: 'lax', path: '/', expires })
  })

  it('is Secure and __Host- prefixed in production only', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(sessionCookie('tok', new Date())).toMatchObject({ name: '__Host-cs_session', secure: true, path: '/' })
    expect(readSessionToken('cs_session=dev; __Host-cs_session=prod')).toBe('prod')
    vi.stubEnv('NODE_ENV', 'development')
    expect(sessionCookie('tok', new Date())).toMatchObject({ name: 'cs_session', secure: false })
    expect(readSessionToken('__Host-cs_session=prod; cs_session=dev')).toBe('dev')
  })

  it('clears by expiring in the past', () => {
    const cookie = clearedSessionCookie()
    expect(cookie.value).toBe('')
    expect(cookie.expires.getTime()).toBe(0)
  })

  it('is read from a Cookie header', () => {
    expect(readSessionToken(`a=1; ${sessionCookieName()}=abc_DEF-1; b=2`)).toBe('abc_DEF-1')
    expect(readSessionToken('a=1')).toBeNull()
    expect(readSessionToken(`${sessionCookieName()}=`)).toBeNull()
    expect(readSessionToken(null)).toBeNull()
  })
})

describe('expiry', () => {
  it('slides sessions to 30 days, refreshing at most hourly', () => {
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
    expect(SESSION_REFRESH_INTERVAL_MS).toBe(60 * 60 * 1000)
  })

  it('gives verification links a day and reset links an hour', () => {
    expect(EMAIL_TOKEN_TTL_MS.verify).toBe(24 * 60 * 60 * 1000)
    expect(EMAIL_TOKEN_TTL_MS.reset).toBe(60 * 60 * 1000)
  })
})

describe('CSRF Origin check', () => {
  const post = (headers: Record<string, string>) => new Request('http://internal:3000/api/x', { method: 'POST', headers })

  it('accepts the APP_URL origin and refuses any other', () => {
    vi.stubEnv('APP_URL', 'https://civicsignal.example/')
    expect(() => assertSameOrigin(post({ origin: 'https://civicsignal.example' }))).not.toThrow()
    expect(() => assertSameOrigin(post({ origin: 'https://evil.example' }))).toThrow(HttpError)
    expect(() => assertSameOrigin(post({ origin: 'http://civicsignal.example' }))).toThrow(HttpError)
  })

  it('falls back to Referer, and refuses a request with neither', () => {
    vi.stubEnv('APP_URL', 'https://civicsignal.example')
    expect(() => assertSameOrigin(post({ referer: 'https://civicsignal.example/auth/signin' }))).not.toThrow()
    expect(() => assertSameOrigin(post({ referer: 'https://evil.example/' }))).toThrow(HttpError)
    expect(() => assertSameOrigin(post({}))).toThrow(HttpError)
    expect(() => assertSameOrigin(post({ origin: 'null' }))).toThrow(HttpError)
  })

  it('uses the request origin when APP_URL is unset (dev)', () => {
    vi.stubEnv('APP_URL', '')
    expect(() => assertSameOrigin(post({ origin: 'http://internal:3000' }))).not.toThrow()
    expect(() => assertSameOrigin(post({ origin: 'http://localhost:3000' }))).toThrow(HttpError)
  })

  it('answers 403 BAD_ORIGIN', () => {
    vi.stubEnv('APP_URL', 'https://civicsignal.example')
    try {
      assertSameOrigin(post({ origin: 'https://evil.example' }))
      expect.unreachable()
    } catch (err) {
      expect(err).toMatchObject({ status: 403, code: 'BAD_ORIGIN' })
    }
  })
})

describe('client IP for rate limits', () => {
  const req = (headers: Record<string, string>) => new Request('http://internal/api/x', { headers })

  it('prefers X-Real-Ip (set by Traefik from the TCP peer)', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('otherwise takes the last X-Forwarded-For entry, not the client-controlled first one', () => {
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 10.0.0.1, 203.0.113.9' }))).toBe('203.0.113.9')
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('falls back to unknown', () => {
    expect(clientIp(req({}))).toBe('unknown')
    expect(clientIp(req({ 'x-forwarded-for': ' , ' }))).toBe('unknown')
  })
})

describe('production hardening', () => {
  it('refuses to run without APP_URL in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', '')
    expect(() => appUrl()).toThrow(/APP_URL is not set/)
    vi.stubEnv('APP_URL', 'https://civicsignal.example/path')
    expect(appUrl()).toBe('https://civicsignal.example')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_URL', '')
    expect(appUrl()).toBeNull()
  })

  it('never logs a link (it carries a token) when no email key is set in production', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const link = 'https://civicsignal.example/auth/reset?token=SECRET-TOKEN'

    vi.stubEnv('NODE_ENV', 'production')
    const prod = await sendEmail({ to: 'a@example.com', subject: 'Reset', html: '<p/>', link })
    expect(prod.error).toBeDefined()
    const logged = [...info.mock.calls, ...warn.mock.calls].flat().join(' ')
    expect(logged).not.toContain('SECRET-TOKEN')
    expect(logged).not.toContain('a@example.com')

    vi.stubEnv('NODE_ENV', 'development')
    const dev = await sendEmail({ to: 'a@example.com', subject: 'Reset', html: '<p/>', link })
    expect(dev.logged).toBe(true)
    expect(info.mock.calls.flat().join(' ')).toContain(link)
  })
})

describe('ids', () => {
  it('accepts UUIDs only', () => {
    expect(isUuid('7d7b2b6e-7f5b-4c43-9a59-3a3f6c2f3d10')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid("1' or '1'='1")).toBe(false)
  })
})
