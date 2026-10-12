#!/usr/bin/env node
// Trusted Panels smoke test against a running web app, through its HTTP API with real
// sessions: an admin creates, publishes and resolves a poll, invites two reputable users to the
// topic panel, one flags the resolution with evidence, and two matching panel reviews close the
// dispute. DATABASE_URL is used only to verify emails, promote the admin, read a topic id, give
// the panelists topic reputation, check the evidence row and delete everything the run created.
// Usage: BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://... node scripts/smoke-trusted-panels.mjs
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const pg = createRequire(new URL('../packages/db/package.json', import.meta.url))('pg')

const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}
const origin = new URL(baseUrl).origin
// The app names its cookie __Host-cs_session in production (Secure) and cs_session in development.
const SESSION_COOKIE_NAMES = ['__Host-cs_session', 'cs_session']
let SESSION_COOKIE = 'cs_session'
const SCENARIO = 'panels'

const stamp = Date.now()
const password = crypto.randomBytes(18).toString('base64url') + 'Aa1!'
const emails = []
const pollIds = []
const proposalIds = []
const disputeIds = []

// ─── HTTP client with one cookie jar per user ────────────────────────────────

const cookieCleared = (cookie, value) => {
  if (!value) return true
  if (/;\s*max-age=(0|-\d+)\s*(;|$)/i.test(cookie)) return true
  const expires = /;\s*expires=([^;]+)/i.exec(cookie)
  return Boolean(expires && Date.parse(expires[1]) <= Date.now())
}

const createAgent = (label) => {
  const agent = { label, session: null, id: null, handle: null, email: null }

  agent.request = async (method, path, body) => {
    const headers = { Accept: 'application/json' }
    if (agent.session) headers.Cookie = `${SESSION_COOKIE}=${agent.session}`
    if (method !== 'GET') {
      headers.Origin = origin
      headers['Content-Type'] = 'application/json'
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0]
      const eq = pair.indexOf('=')
      if (eq < 0 || !SESSION_COOKIE_NAMES.includes(pair.slice(0, eq).trim())) continue
      SESSION_COOKIE = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      agent.session = cookieCleared(cookie, value) ? null : value
    }
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: res.status, json, text }
  }

  // Call and require a 2xx response (or the given status) with success !== false.
  agent.call = async (method, path, body, expectedStatus) => {
    const { status, json, text } = await agent.request(method, path, body)
    const ok = expectedStatus ? status === expectedStatus : status >= 200 && status < 300
    if (!ok || json?.success === false) {
      const detail = json ? `${json.code ?? ''} ${json.error ?? JSON.stringify(json)}`.trim() : text.slice(0, 300)
      throw new Error(`${agent.label}: ${method} ${path} -> ${status} ${detail}`)
    }
    return json
  }

  return agent
}

const anonymous = createAgent('anonymous')

const signUp = async (role) => {
  const agent = createAgent(role)
  agent.email = `smoke-${SCENARIO}-${role}-${stamp}@smoke.civicsignal.test`
  emails.push(agent.email)
  await agent.call('POST', '/api/auth/signup', { email: agent.email, password })
  return agent
}

const logIn = async (agent) => {
  await agent.call('POST', '/api/auth/login', { email: agent.email, password })
  if (!agent.session) throw new Error(`${agent.label}: login did not set the ${SESSION_COOKIE} cookie`)
  const json = await agent.call('GET', '/api/auth/session')
  const user = json?.data?.user
  if (!user?.id) throw new Error(`${agent.label}: no session user after login`)
  agent.id = user.id
  agent.handle = user.handle
  return user
}

// ─── Database: setup the API cannot do, and cleanup ──────────────────────────

const db = new pg.Client({ connectionString: databaseUrl, application_name: 'civicsignal-smoke' })
let dbConnected = false

const markVerified = (email) => db.query('update users set email_verified_at = now() where email = $1 and email_verified_at is null', [email])
const promoteAdmin = (email) => db.query('update users set is_admin = true where email = $1', [email])

const ids = (rows) => rows.map((r) => r.id)

// FK-safe: rows that reference profiles without cascade go first; deleting users cascades
// profiles, sessions and email_tokens, and deleting polls cascades poll_secrets.
const cleanup = async () => {
  if (!dbConnected) return []
  const failures = []
  const run = async (name, sql, params) => {
    try { return await db.query(sql, params) } catch (err) { failures.push(`${name}: ${err.message}`); return { rows: [] } }
  }
  const userIds = ids((await run('users lookup', 'select id from users where email = any($1::text[])', [emails])).rows)
  const polls = [...new Set([...pollIds, ...ids((await run('polls lookup', 'select id from polls where created_by = any($1::uuid[]) or resolved_by = any($1::uuid[])', [userIds])).rows)])]
  const disputes = [...new Set([...disputeIds, ...ids((await run('disputes lookup', 'select id from disputes where poll_id = any($1::uuid[]) or flagged_by = any($2::uuid[])', [polls, userIds])).rows)])]

  await run('dispute_reviews', 'delete from dispute_reviews where dispute_id = any($1::uuid[]) or reviewer_id = any($2::uuid[])', [disputes, userIds])
  await run('dispute_evidence', 'delete from dispute_evidence where dispute_id = any($1::uuid[]) or submitted_by = any($2::uuid[])', [disputes, userIds])
  await run('disputes', 'delete from disputes where id = any($1::uuid[])', [disputes])
  await run('reputation_events', 'delete from reputation_events where poll_id = any($1::uuid[]) or user_id = any($2::uuid[])', [polls, userIds])
  await run('votes', 'delete from votes where poll_id = any($1::uuid[]) or user_id = any($2::uuid[])', [polls, userIds])
  await run('audit_commitments', 'delete from audit_commitments where poll_id = any($1::uuid[])', [polls])
  await run('poll_proposals', 'delete from poll_proposals where id = any($1::uuid[]) or proposed_by = any($2::uuid[])', [proposalIds, userIds])
  await run('poll_proposals unlink', 'update poll_proposals set poll_id = null where poll_id = any($1::uuid[])', [polls])
  await run('polls', 'delete from polls where id = any($1::uuid[])', [polls])
  await run('panel_members', 'delete from panel_members where user_id = any($1::uuid[]) or invited_by = any($1::uuid[])', [userIds])
  await run('user_topic_reputation', 'delete from user_topic_reputation where user_id = any($1::uuid[])', [userIds])
  await run('invites', 'delete from invites where created_by = any($1::uuid[]) or used_by = any($1::uuid[])', [userIds])
  await run('users', 'delete from users where id = any($1::uuid[])', [userIds])
  return failures
}

// ─── Scenario ────────────────────────────────────────────────────────────────

const HOUR = 3_600_000
const future = (ms) => new Date(Date.now() + ms).toISOString()

const scenario = async () => {
  await db.connect()
  dbConnected = true
  const { rows: [topic] } = await db.query('select id, slug, label from topics order by slug limit 1')
  if (!topic) throw new Error('No topic found')

  const userA = await signUp('a')
  const userB = await signUp('b')
  const admin = await signUp('admin')
  for (const agent of [userA, userB, admin]) await markVerified(agent.email)
  await promoteAdmin(admin.email)

  await logIn(userA)
  await logIn(userB)
  const adminUser = await logIn(admin)
  if (!adminUser.isAdmin) throw new Error('admin session does not report isAdmin after promotion')

  // A resolved poll in the topic, made through the admin routes.
  const created = await admin.call('POST', '/api/admin/polls', {
    question: `Trusted Panels smoke test ${stamp}`,
    topicId: topic.id,
    region: 'Global',
    options: ['Yes', 'No'],
    sourceOfTruth: 'CivicSignal smoke harness',
    resolutionCriteria: 'Synthetic smoke test only.',
    cutoffAt: future(HOUR),
    resolvesAt: future(2 * HOUR),
  })
  const pollId = created?.data?.poll?.id
  if (!pollId) throw new Error(`poll create returned no id: ${JSON.stringify(created)}`)
  pollIds.push(pollId)
  if (!created?.data?.publicKey) throw new Error('poll create returned no public key')

  const published = await admin.call('POST', `/api/admin/polls/${pollId}/publish`)
  if (published?.data?.status !== 'active') throw new Error(`unexpected publish result: ${JSON.stringify(published)}`)
  const resolved = await admin.call('POST', `/api/admin/polls/${pollId}/resolve`, { outcome: 'Yes', notes: 'Synthetic trusted panels resolution.' })
  if (resolved?.data?.outcome !== 'Yes') throw new Error(`unexpected resolution result: ${JSON.stringify(resolved)}`)

  // Topic reputation comes from resolved votes over time; no route grants it, so set it here.
  // Panels need the Contributor tier (score 5): panel membership is public, so its bar is a public tier.
  await db.query(
    `insert into user_topic_reputation (user_id, topic_id, score, resolved_count, correct_count)
     values ($1, $3, 5, 5, 5), ($2, $3, 5, 5, 5)
     on conflict (user_id, topic_id) do update
       set score = excluded.score, resolved_count = excluded.resolved_count, correct_count = excluded.correct_count`,
    [userA.id, userB.id, topic.id],
  )

  for (const panelist of [userA, userB]) {
    const invited = await admin.call('POST', '/api/admin/panels/invite', { topicId: topic.id, userId: panelist.id, minTier: 'contributor', activate: true })
    if (invited?.member?.status !== 'active') throw new Error(`unexpected panel invite result for ${panelist.label}: ${JSON.stringify(invited)}`)
  }

  const flagged = await userA.call('POST', `/api/polls/${pollId}/dispute`, {
    reason: 'Smoke evidence says the source wording should be reviewed.',
    evidenceSummary: 'Synthetic evidence packet for trusted panel smoke test.',
    evidenceUrl: 'https://civicsignal.montytorr.com/panels',
  })
  const disputeId = flagged?.dispute?.id
  if (!disputeId) throw new Error(`dispute returned no id: ${JSON.stringify(flagged)}`)
  disputeIds.push(disputeId)

  const first = await userA.call('POST', `/api/admin/disputes/${disputeId}/reviews`, {
    decision: 'dismiss',
    rationale: 'Smoke review one dismisses after checking the synthetic source.',
  })
  if (first?.closedAs) throw new Error(`dispute closed after one review: ${JSON.stringify(first)}`)
  const second = await userB.call('POST', `/api/admin/disputes/${disputeId}/reviews`, {
    decision: 'dismiss',
    rationale: 'Smoke review two agrees and closes the synthetic dispute.',
  })
  if (second?.closedAs !== 'dismissed' || second?.counts?.dismiss !== 2) {
    throw new Error(`Unexpected smoke result: ${JSON.stringify(second)}`)
  }

  const audit = await anonymous.call('GET', '/api/audit/export')
  const publicDispute = (audit?.disputes ?? []).find((d) => d.id === disputeId)
  // No route lists dispute evidence, so read the count directly.
  const { rows: [evidence] } = await db.query('select count(*)::int as count from dispute_evidence where dispute_id = $1', [disputeId])
  if (publicDispute?.status !== 'dismissed' || evidence.count !== 1) {
    throw new Error(`Unexpected smoke result: ${JSON.stringify({ dispute: publicDispute ?? null, evidence: evidence.count })}`)
  }
  return `poll=${pollId} dispute=${disputeId} topic=${topic.label}`
}

let summary = null
try {
  summary = await scenario()
} catch (err) {
  console.error('SMOKE_FAIL trusted-panels:', err.message)
  process.exitCode = 1
} finally {
  const failures = await cleanup()
  await db.end().catch(() => {})
  if (failures.length) {
    console.error(`SMOKE_FAIL trusted-panels: cleanup left rows behind (${failures.join('; ')})`)
    process.exitCode = 1
  } else if (summary) {
    console.log(`SMOKE_OK trusted-panels ${summary}`)
  }
}
