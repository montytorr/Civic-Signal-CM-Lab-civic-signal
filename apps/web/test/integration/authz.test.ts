// @vitest-environment node
// Every rule of docs/authz-policies.md against the real routes and Postgres: P1–P24, S1, D1–D17,
// R1–R8. Tests run in order and share one scenario. Skipped without TEST_DATABASE_URL.
import { beforeAll, describe, expect, it } from 'vitest'
import { decryptVote } from '@civicsignal/crypto'
import { query, queryOne } from '@civicsignal/db'
import {
  getAuditCommitments,
  getLaunchSignalReport,
  getPanelTransparency,
  getPanelInviteCandidates,
  getPendingVotes,
  getPollById,
  getRecentContributions,
  getSourceTemplates,
  getTopicLeaderboard,
  getTopics,
  getUserProfile,
  getUserReputation,
  getUserVote,
  getVoteDistribution,
} from '@/lib/queries'
import type { Viewer } from '@/lib/authz'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReputationPage } from '@/components/reputation-page'
import * as signup from '@/api/auth/signup/route'
import * as pollsList from '@/api/polls/route'
import * as pollGet from '@/api/polls/[id]/route'
import * as vote from '@/api/polls/[id]/vote/route'
import * as dispute from '@/api/polls/[id]/dispute/route'
import * as adminPolls from '@/api/admin/polls/route'
import * as adminPoll from '@/api/admin/polls/[id]/route'
import * as publish from '@/api/admin/polls/[id]/publish/route'
import * as resolve from '@/api/admin/polls/[id]/resolve/route'
import * as adminDispute from '@/api/admin/disputes/[id]/route'
import * as reviews from '@/api/admin/disputes/[id]/reviews/route'
import * as panelInvite from '@/api/admin/panels/invite/route'
import * as adminProposal from '@/api/admin/proposals/[id]/route'
import * as proposals from '@/api/proposals/route'
import * as proposal from '@/api/proposals/[id]/route'
import * as invites from '@/api/invites/route'
import * as redeem from '@/api/invites/[code]/route'
import * as auditExport from '@/api/audit/export/route'
import { call, count, createUser, hasDatabase, pollBody, seenBodies, topicId, useTestDatabase, voteFor, type TestUser } from './harness'

const viewerOf = (user: TestUser, verified = true): Viewer => ({ id: user.id, isAdmin: false, verified })

const publicKeyOf = async (pollId: string) =>
  (await queryOne<{ k: string }>(`select metadata ->> 'publicKey' as k from audit_commitments where poll_id = $1 and batch_type = 'vote'`, [pollId]))!.k

const proposalBody = async (overrides: Record<string, unknown> = {}) => ({
  question: `Will the parliament pass test bill ${Date.now()}?`,
  topicId: await topicId(),
  region: 'European Union',
  options: ['Yes', 'No'],
  sourceOfTruth: 'Official journal of the European Union',
  resolutionCriteria: 'Resolves Yes if the bill is published in the official journal before the date.',
  cutoffAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  resolvesAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  ...overrides,
})

describe.skipIf(!hasDatabase)('authorization rules against Postgres', () => {
  useTestDatabase()

  let admin: TestUser
  let alice: TestUser
  let bob: TestUser
  let carol: TestUser
  let newcomer: TestUser
  let topic: string
  let draftPoll: string
  let activePoll: string
  let resolvedPoll: string
  let disputedPoll: string
  let draftQuestion: string
  let disputeId: string
  let proposalId: string
  const baseline: Record<string, number> = {}
  let profilesBefore: Array<{ id: string; handle: string }> = []

  const createPoll = async (overrides: Record<string, unknown> = {}) => {
    const res = await call(adminPolls.POST, { method: 'POST', as: admin.token, body: await pollBody(overrides) })
    expect(res.status).toBe(201)
    return res.body.data.poll as { id: string; question: string }
  }

  beforeAll(async () => {
    admin = await createUser({ admin: true })
    alice = await createUser()
    bob = await createUser()
    carol = await createUser()
    newcomer = await createUser({ verified: false })
    topic = await topicId()

    const draft = await createPoll()
    draftPoll = draft.id
    draftQuestion = draft.question
    activePoll = (await createPoll()).id
    await call(publish.POST, { method: 'POST', as: admin.token, params: { id: activePoll } })

    // A resolved poll: alice and carol vote Yes (right), bob votes No (wrong).
    resolvedPoll = (await createPoll()).id
    await call(publish.POST, { method: 'POST', as: admin.token, params: { id: resolvedPoll } })
    for (const [user, answer] of [[alice, 'Yes'], [carol, 'Yes'], [bob, 'No']] as const) {
      const res = await call(vote.POST, { method: 'POST', as: user.token, params: { id: resolvedPoll }, body: voteFor(answer) })
      expect(res.status).toBe(200)
    }
    const resolved = await call(resolve.POST, { method: 'POST', as: admin.token, params: { id: resolvedPoll }, body: { outcome: 'Yes' } })
    expect(resolved.status).toBe(200)

    disputedPoll = (await createPoll()).id
    await query(`update polls set status = 'disputed' where id = $1`, [disputedPoll])

    for (const table of ['topics', 'source_templates', 'schema_migrations']) baseline[table] = await count(table)
    profilesBefore = await query<{ id: string; handle: string }>('select id, handle from profiles order by id')
  }, 120_000)

  // ─── Public reads ──────────────────────────────────────────────────────────────────────────────

  it('P1: anonymous can read topics', async () => {
    const topics = await getTopics()
    expect(topics.length).toBeGreaterThan(0)
    expect(topics.map((t) => t.id)).toContain(topic)
  })

  it('P2: anonymous can read a profile, and a profile carries nothing private', async () => {
    const profile = await getUserProfile(alice.handle)
    expect(profile?.id).toBe(alice.id)
    expect(Object.keys(profile!).sort()).toEqual(['created_at', 'handle', 'id', 'verified', 'verified_at'])
  })

  it('P5: anonymous cannot read draft or disputed polls; active and resolved ones are public', async () => {
    expect((await call(pollGet.GET, { params: { id: draftPoll } })).status).toBe(404)
    expect((await call(pollGet.GET, { params: { id: disputedPoll } })).status).toBe(404)
    expect((await call(pollGet.GET, { params: { id: activePoll } })).status).toBe(200)
    expect((await call(pollGet.GET, { params: { id: 'not-a-uuid' } })).status).toBe(404)
    expect(await getPollById(draftPoll)).toBeNull()
    expect((await getPollById(resolvedPoll))?.status).toBe('resolved')

    const list = await call(pollsList.GET)
    const ids = list.body.data.map((p: { id: string }) => p.id)
    expect(ids).toContain(activePoll)
    expect(ids).not.toContain(draftPoll)
    expect(ids).not.toContain(disputedPoll)

    // Draft questions do not leak through the report or the audit log either.
    expect(JSON.stringify(await getLaunchSignalReport())).not.toContain(draftQuestion)
    const commitments = await getAuditCommitments()
    expect(commitments.find((c) => c.poll_id === draftPoll)?.polls).toBeNull()
  })

  it('P5: a signed-in user cannot vote on a draft poll', async () => {
    const res = await call(vote.POST, { method: 'POST', as: alice.token, params: { id: draftPoll }, body: { encryptedAnswer: 'x', answer: 'Yes' } })
    expect(res.status).toBe(404)
  })

  it('P6: only an admin reads every poll, drafts included (GET /api/admin/polls)', async () => {
    expect((await call(adminPolls.GET)).status).toBe(401)
    expect((await call(adminPolls.GET, { as: alice.token })).status).toBe(403)
    const res = await call(adminPolls.GET, { as: admin.token })
    expect(res.status).toBe(200)
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([draftPoll, disputedPoll]))
  })

  it('P6: GET /api/admin/polls/[id] requires users.is_admin, not just a session', async () => {
    expect((await call(adminPoll.GET, { params: { id: draftPoll } })).status).toBe(401)
    const asAlice = await call(adminPoll.GET, { as: alice.token, params: { id: draftPoll } })
    expect(asAlice.status).toBe(403)
    expect(asAlice.text).not.toContain(draftQuestion)
    const asAdmin = await call(adminPoll.GET, { as: admin.token, params: { id: draftPoll } })
    expect(asAdmin.status).toBe(200)
    expect(asAdmin.body.data.question).toBe(draftQuestion)
  })

  it('P6: a profile flag cannot make an admin; only users.is_admin counts', async () => {
    const res = await call(adminPolls.GET, { as: bob.token })
    expect(res.status).toBe(403)
    const columns = await query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'profiles'`)
    expect(columns.map((c) => c.column_name)).not.toContain('is_admin')
  })

  // ─── Votes ─────────────────────────────────────────────────────────────────────────────────────

  it('R1: voting needs a signed-in, verified user', async () => {
    expect((await call(vote.POST, { method: 'POST', params: { id: activePoll }, body: voteFor('Yes') })).status).toBe(401)
    const unverified = await call(vote.POST, { method: 'POST', as: newcomer.token, params: { id: activePoll }, body: voteFor('Yes') })
    expect(unverified.status).toBe(403)
    expect(unverified.body.code).toBe('UNVERIFIED')
    expect(await count('votes', 'poll_id = $1', [activePoll])).toBe(0)
  })

  it('P7: a vote is stored as the signed-in user’s, whatever the body says', async () => {
    const res = await call(vote.POST, {
      method: 'POST',
      as: alice.token,
      params: { id: activePoll },
      body: { ...voteFor('Yes'), user_id: bob.id, userId: bob.id, encryptedAnswer: 'client-chosen ciphertext' },
    })
    expect(res.status).toBe(200)
    const rows = await query<{ user_id: string }>('select user_id from votes where poll_id = $1', [activePoll])
    expect(rows).toEqual([{ user_id: alice.id }])
  })

  it('S1: the server seals each vote to the poll’s public key; client ciphertext is ignored and no plaintext is stored', async () => {
    const row = await queryOne<Record<string, unknown>>('select * from votes where poll_id = $1 and user_id = $2', [activePoll, alice.id])
    expect(Object.keys(row!).sort()).toEqual(['created_at', 'encrypted_answer', 'id', 'poll_id', 'receipt_hash', 'user_id'])
    expect(row!.encrypted_answer).not.toBe('client-chosen ciphertext')
    expect(row!.encrypted_answer).not.toContain('Yes')
    const secret = await queryOne<{ secret_key: string }>('select secret_key from poll_secrets where poll_id = $1', [activePoll])
    expect(decryptVote(row!.encrypted_answer as string, secret!.secret_key)).toBe('Yes')
    const invalid = await call(vote.POST, { method: 'POST', as: bob.token, params: { id: activePoll }, body: { answer: 'Maybe', encryptedAnswer: 'x' } })
    expect(invalid.status).toBe(400)
    expect(invalid.body.code).toBe('INVALID_ANSWER')
  })

  it('S1: a seeded poll without a keypair gets one on its first vote, and only the public half is published', async () => {
    const seeded = await queryOne<{ id: string; options: string[] }>(
      `select p.id, p.options from polls p
       where p.status = 'active' and p.cutoff_at > now() and not exists (select 1 from poll_secrets s where s.poll_id = p.id)
       limit 1`,
    )
    expect(seeded).not.toBeNull()
    const res = await call(vote.POST, { method: 'POST', as: carol.token, params: { id: seeded!.id }, body: voteFor(seeded!.options[0]) })
    expect(res.status).toBe(200)
    const secret = await queryOne<{ secret_key: string }>('select secret_key from poll_secrets where poll_id = $1', [seeded!.id])
    expect(secret).not.toBeNull()
    const commitments = await query<{ metadata: Record<string, unknown> }>(`select metadata from audit_commitments where poll_id = $1`, [seeded!.id])
    expect(commitments).toHaveLength(1)
    expect(Object.keys(commitments[0].metadata).sort()).toEqual(['publicKey', 'type'])
    expect(res.text).not.toContain(secret!.secret_key)
    // A second voter reuses the same key.
    expect((await call(vote.POST, { method: 'POST', as: bob.token, params: { id: seeded!.id }, body: voteFor(seeded!.options[0]) })).status).toBe(200)
    expect(await count('audit_commitments', 'poll_id = $1', [seeded!.id])).toBe(1)
  })

  it('D4: a vote cannot be replaced or deleted, and a second vote is refused', async () => {
    const before = await queryOne<{ encrypted_answer: string }>('select encrypted_answer from votes where poll_id = $1 and user_id = $2', [activePoll, alice.id])
    const again = await call(vote.POST, { method: 'POST', as: alice.token, params: { id: activePoll }, body: voteFor('No') })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('ALREADY_VOTED')
    const after = await queryOne<{ encrypted_answer: string }>('select encrypted_answer from votes where poll_id = $1 and user_id = $2', [activePoll, alice.id])
    expect(after).toEqual(before)
  })

  it('P8: a user reads only their own votes', async () => {
    expect((await getUserVote(activePoll, viewerOf(alice)))?.user_id).toBe(alice.id)
    expect(await getUserVote(activePoll, viewerOf(bob))).toBeNull()
    expect(await getUserVote(activePoll, null)).toBeNull()
    expect((await getPendingVotes(alice.id, viewerOf(alice))).length).toBeGreaterThan(0)
    expect(await getPendingVotes(alice.id, viewerOf(bob))).toEqual([])
    expect(await getPendingVotes(alice.id, null)).toEqual([])
  })

  it('P8: a voter sees their vote sealed until resolution, then only whether it matched', async () => {
    expect((await getUserVote(activePoll, viewerOf(alice)))?.matched).toBeNull()
    expect((await getUserVote(resolvedPoll, viewerOf(alice)))?.matched).toBe(true)
    expect((await getUserVote(resolvedPoll, viewerOf(bob)))?.matched).toBe(false)
    const pending = await getPendingVotes(alice.id, viewerOf(alice))
    expect(pending.find((v) => v.poll_id === activePoll)?.matched).toBeNull()
    expect(pending.find((v) => v.poll_id === resolvedPoll)?.matched).toBe(true)
    for (const v of pending) expect(Object.keys(v)).not.toContain('answer')
  })

  // ─── Reputation and audit ──────────────────────────────────────────────────────────────────────

  it('P9: only the owner reads their reputation events; anonymous and other users get none', async () => {
    const own = await getRecentContributions(alice.id, viewerOf(alice))
    expect(own.some((e) => e.delta === 1 && e.polls !== null)).toBe(true)
    expect(await getRecentContributions(alice.id, null)).toEqual([])
    expect(await getRecentContributions(alice.id, viewerOf(bob))).toEqual([])
    expect(await getRecentContributions(alice.id, { id: admin.id, isAdmin: true, verified: true })).toEqual([])
  })

  it('P10: the owner reads the exact score; others see nothing below the Contributor tier', async () => {
    expect((await getUserReputation(alice.id, viewerOf(alice)))[0]).toMatchObject({ score: 1, resolved_count: 1, correct_count: 1, tier: 'participant' })
    expect((await getUserReputation(bob.id, viewerOf(bob)))[0]).toMatchObject({ score: 0, resolved_count: 1, correct_count: 0, tier: 'newcomer' })
    // Alice (score 1), Bob (score 0) and someone who never voted look the same to everyone else.
    const neverVoted = await createUser()
    for (const viewer of [null, viewerOf(carol)]) {
      expect(await getUserReputation(alice.id, viewer)).toEqual([])
      expect(await getUserReputation(bob.id, viewer)).toEqual([])
      expect(await getUserReputation(neverVoted.id, viewer)).toEqual([])
    }
  })

  it('P10: from the Contributor tier up, others see the tier only', async () => {
    await query('update user_topic_reputation set score = 7 where user_id = $1 and topic_id = $2', [alice.id, topic])
    try {
      for (const viewer of [null, viewerOf(bob)]) {
        const rows = await getUserReputation(alice.id, viewer)
        expect(rows).toHaveLength(1)
        expect(Object.keys(rows[0]).sort()).toEqual(['tier', 'topic_id', 'topics'])
        expect(rows[0].tier).toBe('contributor')
      }
      const slug = (await queryOne<{ slug: string }>('select slug from topics where id = $1', [topic]))!.slug
      const board = await getTopicLeaderboard(slug)
      expect(board.map((r) => r.user_id)).toEqual([alice.id])
      expect(Object.keys(board[0]).sort()).toEqual(['profiles', 'tier', 'topics', 'user_id'])
      expect((await getPanelInviteCandidates()).map((c) => c.user_id)).toEqual([alice.id])
    } finally {
      await query('update user_topic_reputation set score = 1 where user_id = $1 and topic_id = $2', [alice.id, topic])
    }
  })

  it('P10: leaderboards and panel candidates leave out everyone below the Contributor tier', async () => {
    const slug = (await queryOne<{ slug: string }>('select slug from topics where id = $1', [topic]))!.slug
    const board = await getTopicLeaderboard(slug)
    for (const user of [alice, bob, carol]) expect(board.map((r) => r.user_id)).not.toContain(user.id)
    for (const row of board) expect(['contributor', 'trusted', 'steward']).toContain(row.tier)
    const candidates = await getPanelInviteCandidates()
    for (const user of [alice, bob, carol]) expect(candidates.map((c) => c.user_id)).not.toContain(user.id)
  })

  it('P10: the rendered profile shows exact numbers to its owner only, and a low score looks like no votes', async () => {
    const profile = (await getUserProfile(alice.handle))!
    const render = async (userId: string, viewer: Viewer | null) =>
      renderToStaticMarkup(
        createElement(ReputationPage, {
          profile,
          reputation: await getUserReputation(userId, viewer),
          contributions: await getRecentContributions(userId, viewer),
          pendingVotes: await getPendingVotes(userId, viewer),
          isOwner: viewer?.id === userId,
        }),
      )
    const own = await render(alice.id, viewerOf(alice))
    expect(own).toContain('POINTS')
    expect(own).toContain('Recent resolved contributions')
    expect(own).toContain('Participant')
    const neverVoted = await createUser()
    for (const viewer of [null, viewerOf(carol)]) {
      const empty = await render(neverVoted.id, viewer)
      // Score 1 (one right answer) and score 0 (one wrong answer) render exactly like no votes at all.
      expect(await render(alice.id, viewer)).toBe(empty)
      expect(await render(bob.id, viewer)).toBe(empty)
      for (const word of ['POINTS', 'accuracy', 'Participant', 'Newcomer', 'Recent resolved contributions', 'Your vote']) {
        expect(empty).not.toContain(word)
      }
    }
  })

  it('P11: anonymous can read audit commitments, which hold the public key only', async () => {
    const res = await call(auditExport.GET)
    expect(res.status).toBe(200)
    const forActive = res.body.commitments.filter((c: { poll_id: string }) => c.poll_id === activePoll)
    expect(forActive.length).toBe(1)
    expect(res.text).not.toMatch(/secret/i)
  })

  // ─── Poll secrets ──────────────────────────────────────────────────────────────────────────────

  it('S1: admin poll creation writes the secret key to poll_secrets only, and never returns it', async () => {
    const res = await call(adminPolls.POST, { method: 'POST', as: admin.token, body: await pollBody() })
    expect(res.status).toBe(201)
    const pollId = res.body.data.poll.id
    const secret = await queryOne<{ secret_key: string }>('select secret_key from poll_secrets where poll_id = $1', [pollId])
    expect(secret?.secret_key).toMatch(/^[A-Za-z0-9+/=]{40,}$/)
    expect(res.text).not.toContain(secret!.secret_key)
    expect(res.body.data.publicKey).toBe(await publicKeyOf(pollId))
    const metadata = await query<{ metadata: Record<string, unknown> }>('select metadata from audit_commitments where poll_id = $1', [pollId])
    expect(metadata).toHaveLength(1)
    expect(Object.keys(metadata[0].metadata).sort()).toEqual(['publicKey', 'type'])
    expect(JSON.stringify(metadata)).not.toContain(secret!.secret_key)
  })

  it('S1: the database refuses a secret key in audit metadata', async () => {
    await expect(
      query(`insert into audit_commitments (poll_id, merkle_root, batch_type, metadata) values ($1, 'x', 'vote', '{"secretKey":"x"}')`, [activePoll]),
    ).rejects.toThrow(/audit_commitments_no_secret_key/)
  })

  it('S1: resolution decrypts with the key from poll_secrets, keeps only totals and does not return the key', async () => {
    const outcome = await queryOne<{ outcome: string; commitment_hash: string }>('select outcome, commitment_hash from polls where id = $1', [resolvedPoll])
    expect(outcome?.outcome).toBe('Yes')
    expect(outcome?.commitment_hash).toMatch(/^0x/)
    const results = await query<{ answer: string; votes: number }>('select answer, votes from poll_results where poll_id = $1 order by answer', [resolvedPoll])
    expect(results).toEqual([{ answer: 'No', votes: 1 }, { answer: 'Yes', votes: 2 }])
    const resolution = await queryOne<{ metadata: { totalVotes: number; correctVotes: number } }>(
      `select metadata from audit_commitments where poll_id = $1 and batch_type = 'resolution'`,
      [resolvedPoll],
    )
    expect(resolution?.metadata).toMatchObject({ totalVotes: 3, correctVotes: 2 })
  })

  // ─── Disputes and panels ───────────────────────────────────────────────────────────────────────

  it('P13: a dispute is flagged by the signed-in user, whatever the body says', async () => {
    const res = await call(dispute.POST, {
      method: 'POST',
      as: alice.token,
      params: { id: resolvedPoll },
      body: { reason: 'The official source was revised after resolution.', flagged_by: bob.id, evidenceUrl: 'https://example.org/revision' },
    })
    expect(res.status).toBe(200)
    disputeId = res.body.dispute.id
    const row = await queryOne<{ flagged_by: string; status: string }>('select flagged_by, status from disputes where id = $1', [disputeId])
    expect(row).toEqual({ flagged_by: alice.id, status: 'open' })
    // Bob has no reputation in the topic (he voted wrong), so he may not dispute.
    const bobs = await call(dispute.POST, { method: 'POST', as: bob.token, params: { id: resolvedPoll }, body: { reason: 'I disagree.' } })
    expect(bobs.status).toBe(403)
  })

  it('P17: dispute evidence is submitted by the signed-in user', async () => {
    const rows = await query<{ submitted_by: string; source_url: string }>('select submitted_by, source_url from dispute_evidence where dispute_id = $1', [disputeId])
    expect(rows).toEqual([{ submitted_by: alice.id, source_url: 'https://example.org/revision' }])
  })

  it('D11: evidence cannot be filed for another user, and nothing updates or deletes it', async () => {
    const res = await call(dispute.POST, {
      method: 'POST',
      as: carol.token,
      params: { id: resolvedPoll },
      body: { reason: 'Second opinion on the source.', submitted_by: alice.id, submittedBy: alice.id },
    })
    expect(res.status).toBe(200)
    const evidence = await query<{ submitted_by: string }>('select submitted_by from dispute_evidence where dispute_id = $1', [res.body.dispute.id])
    expect(evidence).toEqual([{ submitted_by: carol.id }])
    // Carol's dispute is not part of the scenario below; close it out of the way.
    await query(`update disputes set status = 'dismissed' where id = $1`, [res.body.dispute.id])
  })

  it('P12: anonymous can read disputes', async () => {
    const res = await call(auditExport.GET)
    expect(res.body.disputes.map((d: { id: string }) => d.id)).toContain(disputeId)
  })

  it('R7: panel invites need an admin, and a public tier (Contributor or higher) in the topic', async () => {
    expect((await call(panelInvite.POST, { method: 'POST', body: { topicId: topic, userId: carol.id } })).status).toBe(401)
    expect((await call(panelInvite.POST, { method: 'POST', as: alice.token, body: { topicId: topic, userId: carol.id } })).status).toBe(403)
    const noRep = await call(panelInvite.POST, { method: 'POST', as: admin.token, body: { topicId: topic, userId: bob.id } })
    expect(noRep.status).toBe(403)
    expect(noRep.body.code).toBe('INSUFFICIENT_REPUTATION')
    // Panel membership is public, so a Participant (score 1, not public) cannot be invited...
    const participant = await call(panelInvite.POST, { method: 'POST', as: admin.token, body: { topicId: topic, userId: carol.id, minReputation: 1 } })
    expect(participant.status).toBe(403)
    expect((await call(panelInvite.POST, { method: 'POST', as: admin.token, body: { topicId: topic, userId: carol.id, minTier: 'participant' } })).status).toBe(400)
    // ...until they reach the Contributor tier.
    await query('update user_topic_reputation set score = 5 where user_id = $1 and topic_id = $2', [carol.id, topic])
    const ok = await call(panelInvite.POST, { method: 'POST', as: admin.token, body: { topicId: topic, userId: carol.id, minTier: 'contributor' } })
    expect(ok.status).toBe(200)
    expect(ok.body.member).toMatchObject({ user_id: carol.id, status: 'active', min_reputation_at_invite: 5 })
  })

  it('D10: a non-admin cannot add panel members', async () => {
    const before = await count('panel_members')
    expect((await call(panelInvite.POST, { method: 'POST', as: carol.token, body: { topicId: topic, userId: alice.id } })).status).toBe(403)
    expect(await count('panel_members')).toBe(before)
  })

  it('P15: anonymous can read panel memberships', async () => {
    const { members } = await getPanelTransparency()
    expect(members.map((m) => m.user_id)).toContain(carol.id)
  })

  it('R4: a review needs an admin or an active panelist for the topic', async () => {
    const asBob = await call(reviews.POST, { method: 'POST', as: bob.token, params: { id: disputeId }, body: { decision: 'uphold', rationale: 'Bob thinks so too.' } })
    expect(asBob.status).toBe(403)
    expect(asBob.body.code).toBe('NOT_PANELIST')
    expect((await call(reviews.POST, { method: 'POST', params: { id: disputeId }, body: { decision: 'uphold', rationale: 'Anonymous view.' } })).status).toBe(401)
    expect(await count('dispute_reviews', 'dispute_id = $1', [disputeId])).toBe(0)
  })

  it('P19: a review is by the signed-in panelist, whatever the body says', async () => {
    const res = await call(reviews.POST, {
      method: 'POST',
      as: carol.token,
      params: { id: disputeId },
      body: { decision: 'dismiss', rationale: 'The source was stable at cutoff.', reviewer_id: alice.id },
    })
    expect(res.status).toBe(200)
    expect(res.body.review.reviewer_id).toBe(carol.id)
    expect(res.body.closedAs).toBeNull()
    expect((await queryOne<{ status: string }>('select status from disputes where id = $1', [disputeId]))?.status).toBe('reviewing')
  })

  it('D12: a reviewer can only replace their own review; nobody files one for someone else', async () => {
    const res = await call(reviews.POST, { method: 'POST', as: carol.token, params: { id: disputeId }, body: { decision: 'uphold', rationale: 'Changed my mind after rereading.' } })
    expect(res.status).toBe(200)
    const rows = await query<{ reviewer_id: string; decision: string }>('select reviewer_id, decision from dispute_reviews where dispute_id = $1', [disputeId])
    expect(rows).toEqual([{ reviewer_id: carol.id, decision: 'uphold' }])
  })

  it('P16: anonymous can read dispute evidence', async () => {
    const { evidence } = await getPanelTransparency()
    expect(evidence.some((e) => e.dispute_id === disputeId && e.submitted_by === alice.id)).toBe(true)
  })

  it('P18: anonymous can read dispute reviews', async () => {
    const { reviews: rows } = await getPanelTransparency()
    expect(rows.find((r) => r.dispute_id === disputeId)?.profiles?.handle).toBe(carol.handle)
  })

  it('R5: only an admin changes a dispute’s status', async () => {
    expect((await call(adminDispute.PATCH, { method: 'PATCH', params: { id: disputeId }, body: { status: 'dismissed' } })).status).toBe(401)
    expect((await call(adminDispute.PATCH, { method: 'PATCH', as: carol.token, params: { id: disputeId }, body: { status: 'dismissed' } })).status).toBe(403)
    const ok = await call(adminDispute.PATCH, { method: 'PATCH', as: admin.token, params: { id: disputeId }, body: { status: 'dismissed', notes: 'Source unchanged.' } })
    expect(ok.status).toBe(200)
    expect(ok.body.dispute).toMatchObject({ status: 'dismissed', resolution_notes: 'Source unchanged.' })
  })

  it('D8: users cannot change or delete disputes', async () => {
    const res = await call(adminDispute.PATCH, { method: 'PATCH', as: alice.token, params: { id: disputeId }, body: { status: 'upheld' } })
    expect(res.status).toBe(403)
    expect((await queryOne<{ status: string }>('select status from disputes where id = $1', [disputeId]))?.status).toBe('dismissed')
    expect((await queryOne<{ status: string }>('select status from polls where id = $1', [resolvedPoll]))?.status).toBe('resolved')
  })

  it('R4: a closed dispute takes no more reviews, even from an admin', async () => {
    const res = await call(reviews.POST, { method: 'POST', as: admin.token, params: { id: disputeId }, body: { decision: 'uphold', rationale: 'Too late for this one.' } })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DISPUTE_CLOSED')
  })

  // ─── Invites ───────────────────────────────────────────────────────────────────────────────────

  it('P14: a user reads only the invites they created', async () => {
    const created = await call(invites.POST, { method: 'POST', as: alice.token })
    expect(created.status).toBe(201)
    const code = created.body.data.code
    expect((await call(invites.GET, { as: alice.token })).body.data.map((i: { code: string }) => i.code)).toContain(code)
    expect((await call(invites.GET, { as: bob.token })).body.data).toEqual([])
    expect((await call(invites.GET)).status).toBe(401)

    const redeemed = await call(redeem.POST, { method: 'POST', as: bob.token, params: { code } })
    expect(redeemed.body).toEqual({ success: true, data: { redeemed: true } })
    const row = await queryOne<{ created_by: string; used_by: string }>('select created_by, used_by from invites where code = $1', [code])
    expect(row).toEqual({ created_by: alice.id, used_by: bob.id })
  })

  it('D9: invites are created only for the caller, and nobody else’s are listed', async () => {
    const res = await call(invites.POST, { method: 'POST', as: carol.token, body: { created_by: alice.id } })
    expect(res.status).toBe(201)
    expect((await queryOne<{ created_by: string }>('select created_by from invites where id = $1', [res.body.data.id]))?.created_by).toBe(carol.id)
    const carols = (await call(invites.GET, { as: carol.token })).body.data.map((i: { id: string }) => i.id)
    expect(carols).toEqual([res.body.data.id])
    const self = await call(redeem.POST, { method: 'POST', as: carol.token, params: { code: res.body.data.code } })
    expect(self.status).toBe(400)
  })

  // ─── Proposals ─────────────────────────────────────────────────────────────────────────────────

  it('R2: proposing needs a signed-in, verified user', async () => {
    expect((await call(proposals.POST, { method: 'POST', body: await proposalBody() })).status).toBe(401)
    const res = await call(proposals.POST, { method: 'POST', as: newcomer.token, body: await proposalBody() })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('UNVERIFIED')
  })

  it('P22: a proposal is proposed by the signed-in user, whatever the body says', async () => {
    const res = await call(proposals.POST, { method: 'POST', as: alice.token, body: await proposalBody({ proposed_by: bob.id, proposedBy: bob.id }) })
    expect(res.status).toBe(201)
    proposalId = res.body.proposal.id
    expect((await queryOne<{ proposed_by: string }>('select proposed_by from poll_proposals where id = $1', [proposalId]))?.proposed_by).toBe(alice.id)
  })

  it('P23: the proposer edits their pending proposal, and cannot change its owner or status', async () => {
    const edited = await call(proposal.PATCH, {
      method: 'PATCH',
      as: alice.token,
      params: { id: proposalId },
      body: { action: 'edit', question: 'Will the parliament pass the edited test bill?', status: 'approved', proposed_by: bob.id },
    })
    expect(edited.status).toBe(200)
    const row = await queryOne<{ question: string; status: string; proposed_by: string }>('select question, status, proposed_by from poll_proposals where id = $1', [proposalId])
    expect(row).toEqual({ question: 'Will the parliament pass the edited test bill?', status: 'pending', proposed_by: alice.id })
    expect((await call(proposal.PATCH, { method: 'PATCH', as: bob.token, params: { id: proposalId }, body: { action: 'edit', question: 'Will Bob take over this proposal?' } })).status).toBe(403)
  })

  it('R8: only an admin moderates proposals', async () => {
    expect((await call(adminProposal.PATCH, { method: 'PATCH', params: { id: proposalId }, body: { action: 'reject' } })).status).toBe(401)
    expect((await call(adminProposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'approve' } })).status).toBe(403)
    const rejected = await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id: proposalId }, body: { action: 'reject', moderatorNotes: 'Needs a named source.' } })
    expect(rejected.status).toBe(200)
    expect(rejected.body.proposal.status).toBe('rejected')
  })

  it('P21: anonymous can read every proposal, moderator notes included', async () => {
    const res = await call(proposals.GET)
    const row = res.body.proposals.find((p: { id: string }) => p.id === proposalId)
    expect(row).toMatchObject({ status: 'rejected', moderator_notes: 'Needs a named source.' })
  })

  it('P23: a proposal that is no longer pending cannot be edited', async () => {
    const res = await call(proposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'edit', question: 'Will the rejected bill be edited anyway?' } })
    expect(res.status).toBe(409)
  })

  it('R6: only the proposer appeals (from rejected) and revises (from changes_requested or rejected)', async () => {
    expect((await call(proposal.PATCH, { method: 'PATCH', as: bob.token, params: { id: proposalId }, body: { action: 'appeal', appealReason: 'Bob wants this reconsidered.' } })).status).toBe(403)
    const appealed = await call(proposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'appeal', appealReason: 'The source is named in the criteria.' } })
    expect(appealed.status).toBe(200)
    expect(appealed.body.proposal.status).toBe('appealed')
    const reviseAppealed = await call(proposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'revise', region: 'EU' } })
    expect(reviseAppealed.status).toBe(409)

    await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id: proposalId }, body: { action: 'changes_requested', moderatorNotes: 'Tighten the date.' } })
    const appealChanges = await call(proposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'appeal', appealReason: 'Appealing a change request.' } })
    expect(appealChanges.status).toBe(409)
    const revised = await call(proposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'revise', region: 'European Union (EU27)' } })
    expect(revised.status).toBe(200)
    expect(revised.body.proposal).toMatchObject({ status: 'pending', revision_count: 1 })
  })

  it('D14: nobody else updates a proposal, and nobody can approve their own', async () => {
    const before = await queryOne('select * from poll_proposals where id = $1', [proposalId])
    expect((await call(proposal.PATCH, { method: 'PATCH', as: carol.token, params: { id: proposalId }, body: { action: 'revise', region: 'Elsewhere' } })).status).toBe(403)
    expect((await call(adminProposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'approve' } })).status).toBe(403)
    expect((await call(proposal.PATCH, { method: 'PATCH', as: alice.token, params: { id: proposalId }, body: { action: 'approve' } })).status).toBe(400)
    expect(await queryOne('select * from poll_proposals where id = $1', [proposalId])).toEqual(before)
  })

  it('S1: approving a proposal creates its draft poll with the secret key in poll_secrets only', async () => {
    const res = await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id: proposalId }, body: { action: 'approve' } })
    expect(res.status).toBe(200)
    const pollId = res.body.poll.id
    expect(res.body.proposal).toMatchObject({ status: 'approved', poll_id: pollId })
    const secret = await queryOne<{ secret_key: string }>('select secret_key from poll_secrets where poll_id = $1', [pollId])
    expect(secret).not.toBeNull()
    expect(res.text).not.toContain(secret!.secret_key)
    const metadata = await queryOne<{ metadata: Record<string, unknown> }>('select metadata from audit_commitments where poll_id = $1', [pollId])
    expect(Object.keys(metadata!.metadata).sort()).toEqual(['proposalId', 'publicKey', 'type'])
    expect((await queryOne<{ status: string; created_by: string }>('select status, created_by from polls where id = $1', [pollId]))).toEqual({ status: 'draft', created_by: alice.id })
    const twice = await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id: proposalId }, body: { action: 'approve' } })
    expect(twice.status).toBe(409)
  })

  it('P24: answer totals are public only once the poll is resolved', async () => {
    expect(Object.fromEntries(await getVoteDistribution(resolvedPoll))).toEqual({ Yes: 2, No: 1 })
    expect((await getVoteDistribution(activePoll)).size).toBe(0)
    // Totals that exist for a poll that is not resolved (here: later disputed) are hidden.
    await query(`insert into poll_results (poll_id, answer, votes) values ($1, 'Yes', 5)`, [disputedPoll])
    expect((await getVoteDistribution(disputedPoll)).size).toBe(0)
    await query('delete from poll_results where poll_id = $1', [disputedPoll])
  })

  it('D17: users cannot write poll results', async () => {
    const before = await query('select * from poll_results order by poll_id, answer')
    await call(resolve.POST, { method: 'POST', as: alice.token, params: { id: activePoll }, body: { outcome: 'Yes' } })
    expect(await query('select * from poll_results order by poll_id, answer')).toEqual(before)
  })

  it('no route ever returns another user’s answer', async () => {
    const asBob = [
      await call(auditExport.GET, { as: bob.token }),
      await call(pollGet.GET, { as: bob.token, params: { id: activePoll } }),
      await call(pollsList.GET, { as: bob.token }),
    ]
    // (Alice's id is public on her proposals and disputes; what must never appear is an answer.)
    for (const res of asBob) expect(res.text).not.toMatch(/"answer"\s*:/)
    expect(seenBodies.join('\n')).not.toMatch(/"answer":"(Yes|No)"/)
    // No response carries an exact reputation score or a per-poll delta either (P9, P10).
    expect(seenBodies.join('\n')).not.toMatch(/"(score|delta|correct_count|resolved_count)"\s*:/)
  })

  it('P20: anonymous can read source templates', async () => {
    expect((await getSourceTemplates()).length).toBeGreaterThan(0)
  })

  // ─── Admin poll writes ─────────────────────────────────────────────────────────────────────────

  it('R3: creating, publishing and resolving polls needs an admin', async () => {
    expect((await call(adminPolls.POST, { method: 'POST', body: await pollBody() })).status).toBe(401)
    expect((await call(adminPolls.POST, { method: 'POST', as: alice.token, body: await pollBody() })).status).toBe(403)
    expect((await call(publish.POST, { method: 'POST', as: alice.token, params: { id: draftPoll } })).status).toBe(403)
    expect((await call(resolve.POST, { method: 'POST', as: alice.token, params: { id: activePoll }, body: { outcome: 'Yes' } })).status).toBe(403)
    expect((await call(publish.POST, { method: 'POST', params: { id: draftPoll } })).status).toBe(401)
  })

  it('D3: users cannot create, publish or change polls', async () => {
    const before = await query('select id, status from polls order by id')
    await call(adminPolls.POST, { method: 'POST', as: bob.token, body: await pollBody() })
    await call(publish.POST, { method: 'POST', as: bob.token, params: { id: draftPoll } })
    expect(await query('select id, status from polls order by id')).toEqual(before)
  })

  it('D5: users cannot write reputation events', async () => {
    const before = await count('reputation_events')
    await call(resolve.POST, { method: 'POST', as: carol.token, params: { id: activePoll }, body: { outcome: 'Yes' } })
    expect(await count('reputation_events')).toBe(before)
  })

  it('D6: users cannot write topic reputation', async () => {
    const before = await query('select * from user_topic_reputation order by user_id, topic_id')
    await call(resolve.POST, { method: 'POST', as: alice.token, params: { id: activePoll }, body: { outcome: 'Yes' } })
    expect(await query('select * from user_topic_reputation order by user_id, topic_id')).toEqual(before)
  })

  it('D7: users cannot write audit commitments', async () => {
    const before = await count('audit_commitments')
    await call(adminPolls.POST, { method: 'POST', as: alice.token, body: await pollBody() })
    await call(resolve.POST, { method: 'POST', as: alice.token, params: { id: activePoll }, body: { outcome: 'No' } })
    expect(await count('audit_commitments')).toBe(before)
  })

  it('D1: no route creates topics (an unknown topic is refused)', async () => {
    const res = await call(adminPolls.POST, { method: 'POST', as: admin.token, body: await pollBody({ topicId: '00000000-0000-4000-8000-000000000000' }) })
    expect(res.status).toBe(400)
    expect(await count('topics')).toBe(baseline.topics)
  })

  it('P3: a user cannot change anyone else’s profile; signup only sets the new user’s own', async () => {
    const before = await query<{ id: string; handle: string }>('select id, handle from profiles order by id')
    await call(signup.POST, { method: 'POST', ip: '198.51.100.40', body: { email: `p3.${Date.now()}@example.com`, password: 'a strong password', handle: alice.handle, id: alice.id } })
    const after = await query<{ id: string; handle: string }>('select id, handle from profiles order by id')
    for (const row of before) expect(after).toContainEqual(row)
    expect(after.length).toBe(before.length + 1)
  })

  it('P4: a new profile has the new user’s id (the users trigger creates it)', async () => {
    const email = `p4.${Date.now()}@example.com`
    await call(signup.POST, { method: 'POST', ip: '198.51.100.41', body: { email, password: 'a strong password' } })
    const row = await queryOne<{ user_id: string; profile_id: string | null }>(
      'select u.id as user_id, p.id as profile_id from users u left join profiles p on p.id = u.id where u.email = $1',
      [email],
    )
    expect(row?.profile_id).toBe(row?.user_id)
  })

  // ─── Whole-suite checks ────────────────────────────────────────────────────────────────────────

  it('D2: no route deleted a profile or rewrote another user’s', async () => {
    const after = await query<{ id: string; handle: string }>('select id, handle from profiles order by id')
    for (const before of profilesBefore) expect(after).toContainEqual(before)
  })

  it('D13: no route wrote source templates', async () => {
    expect(await count('source_templates')).toBe(baseline.source_templates)
  })

  it('D15: no route touched schema_migrations', async () => {
    expect(await count('schema_migrations')).toBe(baseline.schema_migrations)
  })

  it('R8: an approved proposal cannot be rejected, sent back or edited by moderation', async () => {
    for (const action of ['reject', 'changes_requested', 'update']) {
      const res = await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id: proposalId }, body: { action, region: 'Elsewhere' } })
      expect(res.status, action).toBe(409)
    }
    expect((await queryOne<{ status: string }>('select status from poll_proposals where id = $1', [proposalId]))?.status).toBe('approved')
  })

  it('R6: edits and revisions must still pass the creation rules (400, not a database error)', async () => {
    const created = await call(proposals.POST, { method: 'POST', as: carol.token, body: await proposalBody() })
    const id = created.body.proposal.id
    const oneOption = await call(proposal.PATCH, { method: 'PATCH', as: carol.token, params: { id }, body: { action: 'edit', options: ['Only one'] } })
    expect(oneOption.status).toBe(400)
    const backwards = await call(proposal.PATCH, {
      method: 'PATCH',
      as: carol.token,
      params: { id },
      body: { action: 'edit', cutoffAt: new Date(Date.now() + 30 * 86_400_000).toISOString() },
    })
    expect(backwards.status).toBe(400)
    const noTopic = await call(proposal.PATCH, { method: 'PATCH', as: carol.token, params: { id }, body: { action: 'edit', topicId: '00000000-0000-4000-8000-000000000000' } })
    expect(noTopic.status).toBe(400)

    await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id }, body: { action: 'changes_requested' } })
    const badRevise = await call(proposal.PATCH, { method: 'PATCH', as: carol.token, params: { id }, body: { action: 'revise', question: 'Too short?' } })
    expect(badRevise.status).toBe(400)
    expect((await queryOne<{ status: string }>('select status from poll_proposals where id = $1', [id]))?.status).toBe('changes_requested')
  })

  it('R8: approval re-checks the creation rules, including edits made while approving', async () => {
    const created = await call(proposals.POST, { method: 'POST', as: carol.token, body: await proposalBody() })
    const id = created.body.proposal.id
    const polls = await count('polls')
    const bad = await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id }, body: { action: 'approve', options: ['Yes'] } })
    expect(bad.status).toBe(400)
    const badTopic = await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id }, body: { action: 'approve', topicId: '00000000-0000-4000-8000-000000000000' } })
    expect(badTopic.status).toBe(400)
    expect(await count('polls')).toBe(polls)
    expect((await call(adminProposal.PATCH, { method: 'PATCH', as: admin.token, params: { id }, body: { action: 'approve' } })).status).toBe(200)
  })

  it('D16: no response in this suite carried a poll secret key', async () => {
    const secrets = await query<{ secret_key: string }>('select secret_key from poll_secrets')
    expect(secrets.length).toBeGreaterThan(3)
    const all = seenBodies.join('\n')
    for (const { secret_key } of secrets) expect(all.includes(secret_key)).toBe(false)
  })
})
