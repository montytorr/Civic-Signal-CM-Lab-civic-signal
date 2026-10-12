// Server-side authorization: one check per rule in docs/authz-policies.md. There is no row-level
// security any more, so routes and queries call these before they read or write for a user.
import { HttpError } from '@/lib/http'

/** Who is asking: the signed-in user (fresh from the database), or null for an anonymous request. */
export interface Viewer {
  id: string
  isAdmin: boolean
  verified: boolean
}

// ─── Reads anyone may do (P1, P2, P9–P12, P15, P16, P18, P20, P21) ───────────────────────────────

/** Tables every request may read in full. Queries over them need no viewer. */
export const PUBLIC_TABLES = [
  'topics', // P1
  'profiles', // P2 (id, handle, verified, verified_at, created_at: there is nothing private on it)
  'reputation_events', // P9
  'user_topic_reputation', // P10
  'audit_commitments', // P11 (public material only, S1)
  'disputes', // P12
  'panel_members', // P15
  'dispute_evidence', // P16
  'dispute_reviews', // P18
  'source_templates', // P20
  'poll_proposals', // P21
] as const

export const isPublicTable = (table: string): boolean => (PUBLIC_TABLES as readonly string[]).includes(table)

// ─── Polls (P5, P6, D3) ──────────────────────────────────────────────────────────────────────────

/** P5: the poll statuses anyone may read. draft and disputed polls are not public. */
export const PUBLIC_POLL_STATUSES = ['active', 'closed', 'resolved'] as const

/** P5: may this poll be shown on a public page or route? Admin routes (P6) use requireAdmin instead. */
export const isPublicPoll = (poll: { status: string | null } | null | undefined): boolean =>
  !!poll && (PUBLIC_POLL_STATUSES as readonly string[]).includes(poll.status ?? '')

/** P24: a poll's answer totals (poll_results) are public only while the poll is resolved. */
export const RESULTS_VISIBLE_STATUS = 'resolved'

/** P24: may this poll's answer totals be shown? */
export const canReadPollResults = (poll: { status: string | null } | null | undefined): boolean =>
  !!poll && poll.status === RESULTS_VISIBLE_STATUS

// ─── Who is asking ───────────────────────────────────────────────────────────────────────────────

/** Any rule that needs a signed-in user: 401 otherwise. */
export const requireUser = (viewer: Viewer | null | undefined): Viewer => {
  if (!viewer) throw new HttpError(401, 'Authentication required', 'AUTH_REQUIRED')
  return viewer
}

/**
 * P6, R3, R5, R7, R8, D3: admin routes. Admin is users.is_admin (A4), read fresh per request.
 * 401 when signed out, 403 when signed in without admin.
 */
export const requireAdmin = (viewer: Viewer | null | undefined): Viewer => {
  const user = requireUser(viewer)
  if (!user.isAdmin) throw new HttpError(403, 'Admin access required', 'ADMIN_REQUIRED')
  return user
}

/** R1, R2: voting and proposing need a verified profile (profiles.verified). */
export const requireVerified = (viewer: Viewer | null | undefined, message = 'You must verify your email first'): Viewer => {
  const user = requireUser(viewer)
  if (!user.verified) throw new HttpError(403, message, 'UNVERIFIED')
  return user
}

// ─── Rows a user creates (P4, P7, P13, P17, P19, P22; D2, D4, D11, D12) ───────────────────────────

/** The owner column of each table a signed-in user may insert into, by rule. */
export const OWNER_COLUMNS = {
  profiles: 'id', // P4
  votes: 'user_id', // P7
  disputes: 'flagged_by', // P13
  dispute_evidence: 'submitted_by', // P17
  dispute_reviews: 'reviewer_id', // P19
  poll_proposals: 'proposed_by', // P22
} as const

export type OwnedTable = keyof typeof OWNER_COLUMNS

/**
 * The new row, owned by the viewer: the owner column is always U, whatever the request body says.
 * This is how a route meets "the new row must have <owner> = U".
 */
export const ownedRow = <T extends Record<string, unknown>>(viewer: Viewer, table: OwnedTable, row: T): T & Record<string, string> => ({
  ...row,
  [OWNER_COLUMNS[table]]: viewer.id,
})

// ─── Per-row checks ──────────────────────────────────────────────────────────────────────────────

/** P3 (and D2): a user may update only their own profile, and the id cannot change. */
export const canUpdateProfile = (viewer: Viewer | null, current: { id: string }, next: { id?: string }): boolean =>
  !!viewer && current.id === viewer.id && (next.id === undefined || next.id === viewer.id)

/** P8 (and D4): a user reads only their own votes. */
export const canReadVote = (viewer: Viewer | null, vote: { user_id: string }): boolean => !!viewer && vote.user_id === viewer.id

/** P14 (and D9): a user reads only invites they created or used. */
export const canReadInvite = (viewer: Viewer | null, invite: { created_by: string | null; used_by: string | null }): boolean =>
  !!viewer && (invite.created_by === viewer.id || invite.used_by === viewer.id)

/**
 * P23 (and D14): the proposer may edit their own proposal while it is pending, and the edit cannot
 * change the owner or the status.
 */
export const canUpdateOwnProposal = (
  viewer: Viewer | null,
  current: { proposed_by: string; status: string },
  next: { proposed_by?: string; status?: string },
): boolean =>
  !!viewer &&
  current.proposed_by === viewer.id &&
  current.status === 'pending' &&
  (next.proposed_by === undefined || next.proposed_by === viewer.id) &&
  (next.status === undefined || next.status === 'pending')

/** R4: dispute statuses a review may still be filed on. */
export const REVIEWABLE_DISPUTE_STATUSES = ['open', 'reviewing'] as const

/**
 * R4: a dispute review needs a signed-in admin or an active panelist for the poll's topic, on a
 * dispute that is still open or reviewing. Throws the matching HTTP error.
 */
export const assertCanReviewDispute = (viewer: Viewer | null, dispute: { status: string }, isActivePanelist: boolean): Viewer => {
  const user = requireUser(viewer)
  if (!(REVIEWABLE_DISPUTE_STATUSES as readonly string[]).includes(dispute.status)) {
    throw new HttpError(409, 'Dispute is already closed', 'DISPUTE_CLOSED')
  }
  if (!user.isAdmin && !isActivePanelist) {
    throw new HttpError(403, 'Panel or admin access required', 'NOT_PANELIST')
  }
  return user
}

export type ProposerAction = 'appeal' | 'revise'

/**
 * R6: the proposer's workflow. Returns the status the proposal moves to, or null if the action is
 * not allowed from the current status. appeal: rejected → appealed. revise: changes_requested or
 * rejected → pending.
 */
export const proposerTransition = (action: ProposerAction, status: string): 'appealed' | 'pending' | null => {
  if (action === 'appeal') return status === 'rejected' ? 'appealed' : null
  if (action === 'revise') return status === 'changes_requested' || status === 'rejected' ? 'pending' : null
  return null
}

/** R6: only the proposer may revise or appeal. */
export const assertProposer = (viewer: Viewer | null, proposal: { proposed_by: string }): Viewer => {
  const user = requireUser(viewer)
  if (proposal.proposed_by !== user.id) {
    throw new HttpError(403, 'Only the proposer can revise or appeal this proposal', 'NOT_PROPOSER')
  }
  return user
}

// ─── Poll secrets (S1, D16) ──────────────────────────────────────────────────────────────────────

/**
 * S1: nothing a route returns may carry a poll secret key. Routes that touch poll_secrets pass
 * their response body through this; it throws (500) rather than leak.
 */
export const assertNoSecretKey = <T>(body: T): T => {
  const text = JSON.stringify(body) ?? ''
  if (/secret_?key/i.test(text)) throw new Error('S1: refusing to return a poll secret key')
  return body
}
