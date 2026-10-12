#!/usr/bin/env node
// Proposal lifecycle smoke test against a running web app, through its HTTP API with real
// sessions: propose (refused while unverified), request changes, revise, reject, appeal,
// approve into a draft poll, publish, vote, resolve, invite a panelist, dispute, panel review,
// admin close. DATABASE_URL is used only to verify emails, promote the admin, read a topic id
// and delete everything the run created.
// Usage: BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://... node scripts/smoke-proposal-lifecycle.mjs
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
const SCENARIO = 'lifecycle'

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

  // Call and require a specific failure status and code.
  agent.expectError = async (method, path, body, expectedStatus, expectedCode) => {
    const { status, json, text } = await agent.request(method, path, body)
    if (status !== expectedStatus || json?.code !== expectedCode) {
      throw new Error(`${agent.label}: ${method} ${path} expected ${expectedStatus} ${expectedCode}, got ${status} ${json ? JSON.stringify(json) : text.slice(0, 300)}`)
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
  return refreshSession(agent)
}

const refreshSession = async (agent) => {
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

const DAY = 86_400_000
const future = (ms) => new Date(Date.now() + ms).toISOString()

const scenario = async () => {
  await db.connect()
  dbConnected = true
  const { rows: [topic] } = await db.query('select id, slug, label from topics order by slug limit 1')
  if (!topic) throw new Error('No topic found')

  const proposer = await signUp('proposer')
  const admin = await signUp('admin')
  const panelist = await signUp('panelist')
  await markVerified(admin.email)
  await markVerified(panelist.email)
  await promoteAdmin(admin.email)

  await logIn(proposer)
  const adminUser = await logIn(admin)
  await logIn(panelist)
  if (!adminUser.isAdmin) throw new Error('admin session does not report isAdmin after promotion')

  const proposalBody = {
    question: `Proposal lifecycle smoke test ${stamp}`,
    topicId: topic.id,
    region: 'Global',
    options: ['Yes', 'No'],
    sourceOfTruth: 'CivicSignal smoke harness',
    resolutionCriteria: 'Synthetic proposal lifecycle smoke test only.',
    cutoffAt: future(DAY),
    resolvesAt: future(2 * DAY),
  }

  // Unverified accounts can sign in but not propose; verification is read fresh per request.
  await proposer.expectError('POST', '/api/proposals', proposalBody, 403, 'UNVERIFIED')
  await markVerified(proposer.email)
  if (!(await refreshSession(proposer)).verified) throw new Error('proposer session not verified after email verification')

  const created = await proposer.call('POST', '/api/proposals', proposalBody)
  const proposalId = created?.proposal?.id
  if (!proposalId) throw new Error(`proposal create returned no id: ${JSON.stringify(created)}`)
  proposalIds.push(proposalId)

  const adminProposal = `/api/admin/proposals/${proposalId}`
  const ownProposal = `/api/proposals/${proposalId}`
  await admin.call('PATCH', adminProposal, { action: 'changes_requested', moderatorNotes: 'Smoke asks for sharper criteria.' })
  const revised = await proposer.call('PATCH', ownProposal, {
    action: 'revise',
    resolutionCriteria: 'Synthetic proposal lifecycle smoke test only; official smoke harness is the sole source.',
  })
  if (revised?.proposal?.status !== 'pending' || revised?.proposal?.revision_count !== 1) {
    throw new Error(`unexpected revision result: ${JSON.stringify(revised)}`)
  }
  await admin.call('PATCH', adminProposal, { action: 'reject', moderatorNotes: 'Smoke rejection for appeal path.' })
  const appealed = await proposer.call('PATCH', ownProposal, { action: 'appeal', appealReason: 'Smoke appeal verifies reconsideration path.' })
  if (appealed?.proposal?.status !== 'appealed') throw new Error(`unexpected appeal result: ${JSON.stringify(appealed)}`)

  // Approval creates the draft poll and stores its key pair (public key in audit_commitments,
  // secret key in poll_secrets).
  const approved = await admin.call('PATCH', adminProposal, { action: 'approve', moderatorNotes: 'Approved after appeal in smoke.' })
  const pollId = approved?.poll?.id
  if (!pollId) throw new Error(`approval returned no poll: ${JSON.stringify(approved)}`)
  pollIds.push(pollId)

  const audit = await anonymous.call('GET', '/api/audit/export')
  const keyCommitment = (audit?.commitments ?? []).find((c) => c.poll_id === pollId && c.batch_type === 'vote')
  if (!keyCommitment?.merkle_root) throw new Error('no public key commitment for the approved poll in /api/audit/export')

  const published = await admin.call('POST', `/api/admin/polls/${pollId}/publish`)
  if (published?.data?.status !== 'active') throw new Error(`unexpected publish result: ${JSON.stringify(published)}`)

  for (const voter of [proposer, panelist]) {
    // The server seals the answer to the poll's public key; only the ciphertext is stored.
    const vote = await voter.call('POST', `/api/polls/${pollId}/vote`, { answer: 'Yes' })
    if (!vote?.data?.receipt?.hash) throw new Error(`${voter.label}: vote returned no receipt`)
  }

  const resolved = await admin.call('POST', `/api/admin/polls/${pollId}/resolve`, {
    outcome: 'Yes',
    notes: 'Synthetic lifecycle resolution.',
    sourceUrl: 'https://civicsignal.montytorr.com/methodology',
  })
  if (resolved?.data?.totalVotes !== 2 || resolved?.data?.correctVotes !== 2 || resolved?.data?.counts?.Yes !== 2 || resolved?.data?.counts?.No !== 0) {
    throw new Error(`unexpected resolution tally: ${JSON.stringify(resolved)}`)
  }

  // The resolution gave both voters topic reputation, so the proposer may dispute. A panel needs
  // the Contributor tier (score 5), which takes several resolutions; no route grants it, so the
  // panelist's score is raised here.
  await db.query(
    'update user_topic_reputation set score = greatest(score, 5) where user_id = $1 and topic_id = $2',
    [panelist.id, topic.id],
  )
  const invited = await admin.call('POST', '/api/admin/panels/invite', { topicId: topic.id, userId: panelist.id, minTier: 'contributor', activate: true })
  if (invited?.member?.status !== 'active') throw new Error(`unexpected panel invite result: ${JSON.stringify(invited)}`)

  const flagged = await proposer.call('POST', `/api/polls/${pollId}/dispute`, {
    reason: 'Synthetic lifecycle dispute.',
    evidenceSummary: 'Lifecycle smoke evidence packet.',
    evidenceUrl: 'https://civicsignal.montytorr.com/verify',
  })
  const disputeId = flagged?.dispute?.id
  if (!disputeId) throw new Error(`dispute returned no id: ${JSON.stringify(flagged)}`)
  disputeIds.push(disputeId)

  const review = await panelist.call('POST', `/api/admin/disputes/${disputeId}/reviews`, {
    decision: 'dismiss',
    rationale: 'Smoke panel review dismisses synthetic dispute.',
  })
  if (review?.review?.decision !== 'dismiss' || review?.closedAs) throw new Error(`unexpected panel review result: ${JSON.stringify(review)}`)

  const closed = await admin.call('PATCH', `/api/admin/disputes/${disputeId}`, { status: 'dismissed', notes: 'Lifecycle smoke closed after panel review.' })
  if (closed?.dispute?.status !== 'dismissed') throw new Error(`unexpected dispute close result: ${JSON.stringify(closed)}`)

  const list = await anonymous.call('GET', '/api/proposals')
  const check = (list?.proposals ?? []).find((p) => p.id === proposalId)
  const poll = (await anonymous.call('GET', `/api/polls/${pollId}`))?.data
  if (!check || check.status !== 'approved' || check.revision_count !== 1 || !check.appeal_reason || check.poll_id !== pollId || poll?.status !== 'resolved' || poll?.outcome !== 'Yes') {
    throw new Error(`Unexpected lifecycle result: ${JSON.stringify({ proposal: check ?? null, poll: poll ? { status: poll.status, outcome: poll.outcome } : null })}`)
  }
  return `proposal=${proposalId} poll=${pollId} dispute=${disputeId} topic=${topic.label}`
}

let summary = null
try {
  summary = await scenario()
} catch (err) {
  console.error('SMOKE_FAIL proposal-lifecycle:', err.message)
  process.exitCode = 1
} finally {
  const failures = await cleanup()
  await db.end().catch(() => {})
  if (failures.length) {
    console.error(`SMOKE_FAIL proposal-lifecycle: cleanup left rows behind (${failures.join('; ')})`)
    process.exitCode = 1
  } else if (summary) {
    console.log(`SMOKE_OK proposal-lifecycle ${summary}`)
  }
}
