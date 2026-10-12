// Integration test harness: a throwaway database (TEST_DATABASE_URL, like packages/db), the real
// migrations, and route handlers called with real Requests and session cookies.
// Run with `pnpm --filter @civicsignal/web test:pg` (starts postgres:17-alpine in docker).
import { afterAll, beforeAll, vi } from 'vitest'
import { closePool, query, queryOne } from '@civicsignal/db'
import { runMigrations } from '@civicsignal/db/migrator'
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '@civicsignal/db/testing'
import { sessionCookieName } from '@/lib/auth/cookie'
import { hashPassword } from '@/lib/auth/crypto'
import { createSession } from '@/lib/auth/session'
import { settleDeferred } from '@/lib/defer'
import { resetRateLimits } from '@/lib/rate-limit'

export const hasDatabase = Boolean(testDatabaseUrl)
export const APP = 'http://civic.test'

/** Every response body the suite has seen (S1/D16: none may carry a poll secret). */
export const seenBodies: string[] = []

/** Links the email module logged (RESEND_API_KEY is unset in tests). */
export const loggedLinks: string[] = []

/** Create a database, migrate it and point the app's pool at it, for the current test file. */
export const useTestDatabase = () => {
  let db: TestDatabase | undefined
  beforeAll(async () => {
    db = await createTestDatabase()
    await runMigrations({ connectionString: db.url, log: () => undefined })
    vi.stubEnv('DATABASE_URL', db.url)
    vi.stubEnv('APP_URL', APP)
    vi.stubEnv('RESEND_API_KEY', '')
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      const match = String(args[0]).match(/Link: (\S+)/)
      if (match) loggedLinks.push(match[1])
    })
    resetRateLimits()
  }, 60_000)
  afterAll(async () => {
    await closePool()
    await db?.drop()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

export interface CallOptions {
  method?: string
  body?: unknown
  /** A session token, or a full Cookie header. */
  as?: string | null
  origin?: string | null
  params?: Record<string, string>
  ip?: string
  path?: string
  /** Wait for work queued after the response (emails). Default true. */
  settle?: boolean
}

export interface CallResult {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON from the route under test
  body: any
  text: string
  headers: Headers
}

/** Call a route handler as a browser would (Origin = APP_URL by default). */
export const call = async (handler: unknown, options: CallOptions = {}): Promise<CallResult> => {
  const { method = 'GET', body, as, params = {}, ip = '203.0.113.1', path = '/api/test', settle = true } = options
  const headers = new Headers({ 'x-real-ip': ip })
  const origin = options.origin === undefined ? APP : options.origin
  if (origin && method !== 'GET') headers.set('origin', origin)
  if (as) headers.set('cookie', as.includes('=') ? as : `${sessionCookieName()}=${as}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  const req = new Request(`${APP}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) })
  if (settle) await settleDeferred()
  const text = await res.text()
  seenBodies.push(text)
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: res.status, body: json, text, headers: res.headers }
}

/** The session token a response set, if any. */
export const sessionFrom = (result: CallResult): string | null => {
  const name = sessionCookieName()
  const header = result.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
  const value = header?.split(';')[0].slice(name.length + 1)
  return value || null
}

let counter = 0
const PASSWORD = 'correct horse battery'

export interface TestUser {
  id: string
  email: string
  handle: string
  password: string
  token: string
}

/** A user straight in the database (verified unless told otherwise), with a live session. */
export const createUser = async ({ verified = true, admin = false, handle }: { verified?: boolean; admin?: boolean; handle?: string } = {}): Promise<TestUser> => {
  counter += 1
  const email = `user${counter}-${Date.now()}@test.civicsignal`
  const user = await queryOne<{ id: string }>(
    'insert into users (email, password_hash, email_verified_at, is_admin) values ($1, $2, $3, $4) returning id',
    [email, await hashPassword(PASSWORD), verified ? new Date().toISOString() : null, admin],
  )
  if (!user) throw new Error('user insert failed')
  const finalHandle = handle ?? `tester-${counter}-${Date.now() % 100000}`
  await query('update profiles set handle = $2 where id = $1', [user.id, finalHandle])
  const { token } = await createSession(user.id)
  return { id: user.id, email, handle: finalHandle, password: PASSWORD, token }
}

export const topicId = async (slug?: string): Promise<string> => {
  const row = await queryOne<{ id: string }>(
    slug ? 'select id from topics where slug = $1' : 'select id from topics order by slug limit 1',
    slug ? [slug] : [],
  )
  if (!row) throw new Error('no topic')
  return row.id
}

export const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

/** A poll body for POST /api/admin/polls. */
export const pollBody = async (overrides: Record<string, unknown> = {}) => ({
  question: `Will test question ${++counter} happen?`,
  topicId: await topicId(),
  region: 'Global',
  options: ['Yes', 'No'],
  sourceOfTruth: 'Official statistics office release',
  resolutionCriteria: 'Resolves Yes if the official release says so.',
  cutoffAt: days(7),
  resolvesAt: days(14),
  ...overrides,
})

/** A vote body: just the answer. The server seals it (any client ciphertext is ignored). */
export const voteFor = (answer: string) => ({ answer })

export const count = async (table: string, where = 'true', params: unknown[] = []) =>
  Number((await queryOne<{ n: string }>(`select count(*) as n from ${table} where ${where}`, params))?.n ?? 0)
