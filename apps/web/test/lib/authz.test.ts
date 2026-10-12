// @vitest-environment node
// The authorization checks of docs/authz-policies.md, one test per rule, without a database.
// test/integration/authz.test.ts runs the same rules against the real routes and Postgres.
import { describe, expect, it } from 'vitest'
import {
  OWNER_COLUMNS,
  PUBLIC_POLL_STATUSES,
  assertCanReviewDispute,
  assertNoSecretKey,
  assertProposer,
  canReadExactReputation,
  canReadInvite,
  canReadReputationEvents,
  canReadVote,
  canUpdateOwnProposal,
  canReadPollResults,
  canUpdateProfile,
  isPublicPoll,
  isPublicTable,
  ownedRow,
  proposerTransition,
  requireAdmin,
  requireUser,
  requireVerified,
  type Viewer,
} from '@/lib/authz'
import { REPUTATION_TIERS, tierLabel, tierOf, tierRank, tierRankSql, tierSql } from '@/lib/reputation'

const alice: Viewer = { id: 'alice', isAdmin: false, verified: true }
const bob: Viewer = { id: 'bob', isAdmin: false, verified: true }
const admin: Viewer = { id: 'root', isAdmin: true, verified: true }
const newcomer: Viewer = { id: 'new', isAdmin: false, verified: false }

const httpError = (fn: () => unknown) => {
  try {
    fn()
  } catch (err) {
    return err as { status?: number; code?: string }
  }
  return null
}

describe('public reads', () => {
  it('P1: anyone can read topics', () => expect(isPublicTable('topics')).toBe(true))
  it('P2: anyone can read profiles', () => expect(isPublicTable('profiles')).toBe(true))
  it('P11: anyone can read audit commitments', () => expect(isPublicTable('audit_commitments')).toBe(true))
  it('P12: anyone can read disputes', () => expect(isPublicTable('disputes')).toBe(true))
  it('P15: anyone can read panel memberships', () => expect(isPublicTable('panel_members')).toBe(true))
  it('P16: anyone can read dispute evidence', () => expect(isPublicTable('dispute_evidence')).toBe(true))
  it('P18: anyone can read dispute reviews', () => expect(isPublicTable('dispute_reviews')).toBe(true))
  it('P20: anyone can read source templates', () => expect(isPublicTable('source_templates')).toBe(true))
  it('P21: anyone can read poll proposals', () => expect(isPublicTable('poll_proposals')).toBe(true))

  it('only those tables are public: votes, invites, polls, secrets and auth tables are not', () => {
    for (const table of ['votes', 'invites', 'polls', 'poll_secrets', 'users', 'sessions', 'email_tokens', 'schema_migrations', 'reputation_events', 'user_topic_reputation', 'poll_results']) {
      expect(isPublicTable(table), table).toBe(false)
    }
  })
})

describe('reputation', () => {
  it('P9: only the owner reads their per-poll reputation events', () => {
    expect(canReadReputationEvents(alice, 'alice')).toBe(true)
    expect(canReadReputationEvents(bob, 'alice')).toBe(false)
    expect(canReadReputationEvents(admin, 'alice')).toBe(false)
    expect(canReadReputationEvents(null, 'alice')).toBe(false)
  })

  it('P10: only the owner reads an exact score; everyone else a tier', () => {
    expect(canReadExactReputation(alice, 'alice')).toBe(true)
    expect(canReadExactReputation(bob, 'alice')).toBe(false)
    expect(canReadExactReputation(admin, 'alice')).toBe(false)
    expect(canReadExactReputation(null, 'alice')).toBe(false)
  })

  it('P10: tiers are coarse, ordered and defined in one place', () => {
    expect(REPUTATION_TIERS.map((t) => [t.key, t.min])).toEqual([
      ['newcomer', 0], ['participant', 1], ['contributor', 5], ['trusted', 20], ['steward', 50],
    ])
    expect([0, 1, 4, 5, 19, 20, 49, 50, 500].map(tierOf)).toEqual([
      'newcomer', 'participant', 'participant', 'contributor', 'contributor', 'trusted', 'trusted', 'steward', 'steward',
    ])
    expect(tierOf(null)).toBe('newcomer')
    expect(tierLabel('trusted')).toBe('Trusted')
    expect(tierRank('steward')).toBeGreaterThan(tierRank('trusted'))
    // The SQL forms name tiers and ranks, never the score itself as output.
    expect(tierSql('r.score')).toBe(
      "case when coalesce(r.score, 0) >= 50 then 'steward' when coalesce(r.score, 0) >= 20 then 'trusted' when coalesce(r.score, 0) >= 5 then 'contributor' when coalesce(r.score, 0) >= 1 then 'participant' when coalesce(r.score, 0) >= 0 then 'newcomer' end",
    )
    expect(tierRankSql('r.score')).toMatch(/^case when coalesce\(r\.score, 0\) >= 50 then 4 .* then 0 end$/)
  })
})

describe('polls', () => {
  it('P5: anonymous cannot read draft or disputed polls; active, closed and resolved are public', () => {
    expect(PUBLIC_POLL_STATUSES).toEqual(['active', 'closed', 'resolved'])
    expect(isPublicPoll({ status: 'active' })).toBe(true)
    expect(isPublicPoll({ status: 'closed' })).toBe(true)
    expect(isPublicPoll({ status: 'resolved' })).toBe(true)
    expect(isPublicPoll({ status: 'draft' })).toBe(false)
    expect(isPublicPoll({ status: 'disputed' })).toBe(false)
    expect(isPublicPoll(null)).toBe(false)
  })

  it('P6: only an admin passes the admin check (401 signed out, 403 signed in)', () => {
    expect(httpError(() => requireAdmin(null))).toMatchObject({ status: 401 })
    expect(httpError(() => requireAdmin(alice))).toMatchObject({ status: 403, code: 'ADMIN_REQUIRED' })
    expect(requireAdmin(admin)).toBe(admin)
  })
})

describe('rows a user creates are their own', () => {
  it('owner columns follow the policies', () => {
    expect(OWNER_COLUMNS).toEqual({
      profiles: 'id',
      votes: 'user_id',
      disputes: 'flagged_by',
      dispute_evidence: 'submitted_by',
      dispute_reviews: 'reviewer_id',
      poll_proposals: 'proposed_by',
    })
  })

  it('P4: a profile row is inserted only with id = U', () => {
    expect(ownedRow(alice, 'profiles', { id: 'bob', handle: 'x' })).toMatchObject({ id: 'alice' })
  })
  it('P7: a vote is owned by the signed-in user, whatever the body says', () => {
    expect(ownedRow(alice, 'votes', { poll_id: 'p', user_id: 'bob' })).toMatchObject({ user_id: 'alice', poll_id: 'p' })
  })
  it('P13: a dispute is flagged by the signed-in user', () => {
    expect(ownedRow(alice, 'disputes', { flagged_by: 'bob' })).toMatchObject({ flagged_by: 'alice' })
  })
  it('P17: dispute evidence is submitted by the signed-in user', () => {
    expect(ownedRow(alice, 'dispute_evidence', { submitted_by: 'bob' })).toMatchObject({ submitted_by: 'alice' })
  })
  it('P19: a dispute review is by the signed-in user', () => {
    expect(ownedRow(alice, 'dispute_reviews', { reviewer_id: 'bob' })).toMatchObject({ reviewer_id: 'alice' })
  })
  it('P22: a proposal is proposed by the signed-in user', () => {
    expect(ownedRow(alice, 'poll_proposals', { proposed_by: 'bob' })).toMatchObject({ proposed_by: 'alice' })
  })
})

describe('per-row checks', () => {
  it('P3: a user updates only their own profile and cannot change its id', () => {
    expect(canUpdateProfile(alice, { id: 'alice' }, { id: 'alice' })).toBe(true)
    expect(canUpdateProfile(alice, { id: 'alice' }, {})).toBe(true)
    expect(canUpdateProfile(alice, { id: 'bob' }, {})).toBe(false)
    expect(canUpdateProfile(alice, { id: 'alice' }, { id: 'bob' })).toBe(false)
    expect(canUpdateProfile(null, { id: 'alice' }, {})).toBe(false)
  })

  it('P8: a user reads only their own votes', () => {
    expect(canReadVote(alice, { user_id: 'alice' })).toBe(true)
    expect(canReadVote(alice, { user_id: 'bob' })).toBe(false)
    expect(canReadVote(admin, { user_id: 'bob' })).toBe(false)
    expect(canReadVote(null, { user_id: 'bob' })).toBe(false)
  })

  it('P14: a user reads only invites they created or used', () => {
    expect(canReadInvite(alice, { created_by: 'alice', used_by: null })).toBe(true)
    expect(canReadInvite(alice, { created_by: 'bob', used_by: 'alice' })).toBe(true)
    expect(canReadInvite(alice, { created_by: 'bob', used_by: null })).toBe(false)
    expect(canReadInvite(null, { created_by: null, used_by: null })).toBe(false)
  })

  it('P23: the proposer edits a pending proposal and cannot change owner or status', () => {
    const pending = { proposed_by: 'alice', status: 'pending' }
    expect(canUpdateOwnProposal(alice, pending, {})).toBe(true)
    expect(canUpdateOwnProposal(alice, pending, { status: 'pending', proposed_by: 'alice' })).toBe(true)
    expect(canUpdateOwnProposal(bob, pending, {})).toBe(false)
    expect(canUpdateOwnProposal(alice, { ...pending, status: 'rejected' }, {})).toBe(false)
    expect(canUpdateOwnProposal(alice, pending, { status: 'approved' })).toBe(false)
    expect(canUpdateOwnProposal(alice, pending, { proposed_by: 'bob' })).toBe(false)
  })
})

describe('poll results', () => {
  it('P24: answer totals are public only for a resolved poll', () => {
    expect(canReadPollResults({ status: 'resolved' })).toBe(true)
    for (const status of ['draft', 'active', 'closed', 'disputed']) expect(canReadPollResults({ status }), status).toBe(false)
    expect(canReadPollResults(null)).toBe(false)
    expect(isPublicTable('poll_results')).toBe(false)
  })
})

describe('poll secrets', () => {
  it('S1: a response carrying a secret key is refused', () => {
    expect(() => assertNoSecretKey({ poll: { id: 'p' }, publicKey: 'pk' })).not.toThrow()
    expect(() => assertNoSecretKey({ metadata: { secretKey: 'sk' } })).toThrow(/S1/)
    expect(() => assertNoSecretKey({ secret_key: 'sk' })).toThrow(/S1/)
  })
})

describe('route checks', () => {
  it('R1: voting needs a signed-in, verified user (401, then 403 UNVERIFIED)', () => {
    expect(httpError(() => requireVerified(null))).toMatchObject({ status: 401 })
    expect(httpError(() => requireVerified(newcomer))).toMatchObject({ status: 403, code: 'UNVERIFIED' })
    expect(requireVerified(alice)).toBe(alice)
  })

  it('R2: proposing needs a signed-in, verified user', () => {
    expect(httpError(() => requireVerified(newcomer, 'Verified account required'))).toMatchObject({ status: 403, code: 'UNVERIFIED' })
    expect(requireVerified(bob)).toBe(bob)
  })

  it('R3: admin poll routes need admin', () => {
    expect(httpError(() => requireAdmin(newcomer))).toMatchObject({ status: 403 })
    expect(requireAdmin(admin).isAdmin).toBe(true)
  })

  it('R4: a review needs an open dispute and an admin or an active panelist', () => {
    expect(httpError(() => assertCanReviewDispute(null, { status: 'open' }, true))).toMatchObject({ status: 401 })
    expect(httpError(() => assertCanReviewDispute(alice, { status: 'open' }, false))).toMatchObject({ status: 403, code: 'NOT_PANELIST' })
    expect(httpError(() => assertCanReviewDispute(alice, { status: 'upheld' }, true))).toMatchObject({ status: 409, code: 'DISPUTE_CLOSED' })
    expect(httpError(() => assertCanReviewDispute(admin, { status: 'dismissed' }, false))).toMatchObject({ status: 409 })
    expect(assertCanReviewDispute(alice, { status: 'open' }, true)).toBe(alice)
    expect(assertCanReviewDispute(alice, { status: 'reviewing' }, true)).toBe(alice)
    expect(assertCanReviewDispute(admin, { status: 'open' }, false)).toBe(admin)
  })

  it('R5: dispute status changes need admin', () => {
    expect(httpError(() => requireAdmin(bob))).toMatchObject({ status: 403 })
  })

  it('R6: only the proposer appeals (from rejected) or revises (from changes_requested or rejected)', () => {
    expect(httpError(() => assertProposer(bob, { proposed_by: 'alice' }))).toMatchObject({ status: 403, code: 'NOT_PROPOSER' })
    expect(httpError(() => assertProposer(null, { proposed_by: 'alice' }))).toMatchObject({ status: 401 })
    expect(assertProposer(alice, { proposed_by: 'alice' })).toBe(alice)
    expect(proposerTransition('appeal', 'rejected')).toBe('appealed')
    for (const status of ['pending', 'changes_requested', 'approved', 'appealed']) {
      expect(proposerTransition('appeal', status), status).toBeNull()
    }
    expect(proposerTransition('revise', 'changes_requested')).toBe('pending')
    expect(proposerTransition('revise', 'rejected')).toBe('pending')
    for (const status of ['pending', 'approved', 'appealed']) {
      expect(proposerTransition('revise', status), status).toBeNull()
    }
  })

  it('R7: panel invites need admin', () => {
    expect(httpError(() => requireAdmin(alice))).toMatchObject({ status: 403 })
  })

  it('R8: proposal moderation needs admin', () => {
    expect(httpError(() => requireAdmin(null))).toMatchObject({ status: 401 })
    expect(requireAdmin(admin)).toBe(admin)
  })

  it('a signed-out request is a 401 AUTH_REQUIRED', () => {
    expect(httpError(() => requireUser(null))).toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
  })
})
