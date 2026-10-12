// Server-side reads for pages and routes. Each query applies the read rule of docs/authz-policies.md
// that the old row-level policies enforced: public tables are read in full (P1, P2, P9–P12, P15,
// P16, P18, P20, P21), polls only in public statuses (P5), votes only the viewer's own (P8).
import { query, queryOne, type PollRow, type ProfileRow, type SourceTemplateRow, type TopicRow, type VoteRow } from '@civicsignal/db'
import { PUBLIC_POLL_STATUSES, RESULTS_VISIBLE_STATUS, canReadVote, type Viewer } from '@/lib/authz'
import { isUuid } from '@/lib/http'

// P5 as a SQL predicate on a polls alias.
const publicPoll = (alias: string) => `${alias}.status in (${PUBLIC_POLL_STATUSES.map((s) => `'${s}'`).join(', ')})`

// P24 as a SQL predicate: poll_results are public only while the poll is resolved.
const RESULTS_VISIBLE = (alias: string) => `${alias}.status = '${RESULTS_VISIBLE_STATUS}'`

// An embedded topic, shaped like the old PostgREST embed: topics(slug, label).
const topicJson = (alias: string) => `case when ${alias}.id is null then null else json_build_object('slug', ${alias}.slug, 'label', ${alias}.label) end`

const toCount = (row: { n: string | number } | null) => Number(row?.n ?? 0)

type TopicRef = { slug: string; label: string } | null

// ─── Polls ───────────────────────────────────────────────────────────────────────────────────────

export type PollWithTopic = PollRow & { topics: TopicRef }

/** P5: active and closed polls for the feed. */
export const getActivePolls = () =>
  query<PollWithTopic>(
    `select p.*, ${topicJson('t')} as topics
     from polls p left join topics t on t.id = p.topic_id
     where p.status in ('active', 'closed')
     order by p.cutoff_at`,
  )

/** P5: one public poll, or null (draft and disputed polls are not found). */
export const getPollById = async (id: string) => {
  if (!isUuid(id)) return null
  return queryOne<PollWithTopic>(
    `select p.*, ${topicJson('t')} as topics
     from polls p left join topics t on t.id = p.topic_id
     where p.id = $1 and ${publicPoll('p')}`,
    [id],
  )
}

// Whether a vote matched the outcome: null while the poll is unresolved (the vote stays sealed),
// then from the voter's reputation event. Votes hold no plaintext answer to show.
const matchedSql = (vote: string, poll: string) =>
  `case when ${poll}.status = 'resolved' then (select e.delta > 0 from reputation_events e where e.poll_id = ${vote}.poll_id and e.user_id = ${vote}.user_id limit 1) else null end`

export type OwnVote = Pick<VoteRow, 'id' | 'poll_id' | 'user_id' | 'receipt_hash' | 'created_at'> & {
  /** null: sealed (not resolved yet, or not scored); true or false once resolved. */
  matched: boolean | null
}

/** P8: the viewer's own vote on a poll (receipt and, after resolution, whether it matched), or null. */
export const getUserVote = async (pollId: string, viewer: Viewer | null): Promise<OwnVote | null> => {
  if (!viewer || !isUuid(pollId)) return null
  const vote = await queryOne<OwnVote>(
    `select v.id, v.poll_id, v.user_id, v.receipt_hash, v.created_at, ${matchedSql('v', 'p')} as matched
     from votes v join polls p on p.id = v.poll_id
     where v.poll_id = $1 and v.user_id = $2`,
    [pollId, viewer.id],
  )
  return vote && canReadVote(viewer, vote) ? vote : null
}

/** How many votes a poll has (an aggregate: no vote's content). */
export const getVoteCount = async (pollId: string) =>
  !isUuid(pollId) ? 0 : toCount(await queryOne<{ n: string }>('select count(*) as n from votes where poll_id = $1', [pollId]))

export const getVoteCountsByPoll = async (pollIds: string[]) => {
  const counts = new Map<string, number>()
  pollIds.forEach((id) => counts.set(id, 0))
  if (pollIds.length === 0) return counts
  const rows = await query<{ poll_id: string; n: string }>(
    'select poll_id, count(*) as n from votes where poll_id = any($1::uuid[]) group by poll_id',
    [pollIds],
  )
  rows.forEach((row) => counts.set(row.poll_id, Number(row.n)))
  return counts
}

/** P24: answer totals from poll_results, only while the poll is resolved. Never per-user answers. */
export const getVoteDistribution = async (pollId: string) => {
  if (!isUuid(pollId)) return new Map<string, number>()
  const rows = await query<{ answer: string; votes: number }>(
    `select r.answer, r.votes
     from poll_results r join polls p on p.id = r.poll_id
     where r.poll_id = $1 and ${RESULTS_VISIBLE('p')}`,
    [pollId],
  )
  return new Map(rows.map((row) => [row.answer, row.votes]))
}

/** P11: the public key voters encrypt to (from the poll's keypair commitment). */
export const getPollPublicKey = async (pollId: string) => {
  if (!isUuid(pollId)) return null
  const row = await queryOne<{ public_key: string | null }>(
    `select metadata ->> 'publicKey' as public_key
     from audit_commitments
     where poll_id = $1 and batch_type = 'vote' and metadata ? 'publicKey'
     order by created_at desc
     limit 1`,
    [pollId],
  )
  return row?.public_key ?? null
}

export type ResolvedPollRow = Pick<PollRow, 'id' | 'question' | 'topic_id' | 'region' | 'resolved_at' | 'resolves_at' | 'outcome'> & {
  options: string[]
  topics: TopicRef
}

export const getResolvedPolls = () =>
  query<ResolvedPollRow>(
    `select p.id, p.question, p.topic_id, p.region, p.options, p.resolved_at, p.resolves_at, p.outcome, ${topicJson('t')} as topics
     from polls p left join topics t on t.id = p.topic_id
     where p.status = 'resolved'
     order by p.resolved_at desc nulls last`,
  )

export type AwaitingPollRow = Pick<PollRow, 'id' | 'question' | 'topic_id' | 'resolves_at' | 'source_of_truth'> & {
  options: string[]
  topics: TopicRef
}

/** Admin page: closed polls waiting for an outcome. */
export const getAwaitingResolution = () =>
  query<AwaitingPollRow>(
    `select p.id, p.question, p.topic_id, p.resolves_at, p.source_of_truth, p.options, ${topicJson('t')} as topics
     from polls p left join topics t on t.id = p.topic_id
     where p.status = 'closed'
     order by p.resolves_at`,
  )

// ─── Topics, profiles and reputation ─────────────────────────────────────────────────────────────

/** P1. */
export const getTopics = () => query<TopicRow>('select * from topics order by label')

/** P2. */
export const getUserProfile = (handle: string) => queryOne<ProfileRow>('select * from profiles where handle = $1', [handle])

/** P10. */
export const getUserReputation = (userId: string) =>
  query<{ user_id: string; topic_id: string; score: number; resolved_count: number; correct_count: number; topics: TopicRef }>(
    `select r.*, ${topicJson('t')} as topics
     from user_topic_reputation r left join topics t on t.id = r.topic_id
     where r.user_id = $1
     order by r.score desc`,
    [userId],
  )

/** P9, with the poll question only for public polls (P5). */
export const getRecentContributions = (userId: string) =>
  query<{ id: string; delta: number; created_at: string; polls: { question: string } | null; topics: { label: string } | null }>(
    `select e.id, e.delta, e.created_at,
            case when ${publicPoll('p')} then json_build_object('question', p.question) else null end as polls,
            case when t.id is null then null else json_build_object('label', t.label) end as topics
     from reputation_events e
     left join polls p on p.id = e.poll_id
     left join topics t on t.id = e.topic_id
     where e.user_id = $1
     order by e.created_at desc
     limit 10`,
    [userId],
  )

export type PendingVoteRow = Pick<VoteRow, 'id' | 'poll_id' | 'receipt_hash' | 'created_at'> & {
  matched: boolean | null
  polls: { question: string; status: string; resolves_at: string; cutoff_at: string; topics: { label: string } | null } | null
}

/** P8: a user's recent votes, shown only to that user. Anyone else gets an empty list. */
export const getPendingVotes = async (userId: string, viewer: Viewer | null): Promise<PendingVoteRow[]> => {
  if (!viewer || !canReadVote(viewer, { user_id: userId })) return []
  return query<PendingVoteRow>(
    `select v.id, v.poll_id, v.receipt_hash, v.created_at, ${matchedSql('v', 'p')} as matched,
            case when ${publicPoll('p')} then json_build_object(
              'question', p.question, 'status', p.status, 'resolves_at', p.resolves_at, 'cutoff_at', p.cutoff_at,
              'topics', case when t.id is null then null else json_build_object('label', t.label) end
            ) else null end as polls
     from votes v
     join polls p on p.id = v.poll_id
     left join topics t on t.id = p.topic_id
     where v.user_id = $1
     order by v.created_at desc
     limit 20`,
    [viewer.id],
  )
}

export type LeaderboardRow = {
  user_id: string
  score: number
  resolved_count: number
  correct_count: number
  profiles: { handle: string; verified: boolean } | null
  topics: { slug: string; label: string } | null
}

/** P10 with P2 handles. */
export const getTopicLeaderboard = (topicSlug: string, limit = 20) =>
  query<LeaderboardRow>(
    `select r.user_id, r.score, r.resolved_count, r.correct_count,
            json_build_object('handle', pr.handle, 'verified', coalesce(pr.verified, false)) as profiles,
            ${topicJson('t')} as topics
     from user_topic_reputation r
     join topics t on t.id = r.topic_id
     left join profiles pr on pr.id = r.user_id
     where t.slug = $1
     order by r.score desc
     limit $2`,
    [topicSlug, limit],
  )

export type PanelCandidateRow = LeaderboardRow & { topic_id: string; panelStatus: string | null }

/** Admin page: users with topic reputation, and their panel status for that topic. */
export const getPanelInviteCandidates = () =>
  query<PanelCandidateRow>(
    `select r.user_id, r.topic_id, r.score, r.resolved_count, r.correct_count,
            json_build_object('handle', pr.handle, 'verified', coalesce(pr.verified, false)) as profiles,
            ${topicJson('t')} as topics,
            pm.status as "panelStatus"
     from user_topic_reputation r
     left join profiles pr on pr.id = r.user_id
     left join topics t on t.id = r.topic_id
     left join panel_members pm on pm.user_id = r.user_id and pm.topic_id = r.topic_id
     where r.score > 0
     order by r.score desc
     limit 100`,
  )

// ─── Stats ───────────────────────────────────────────────────────────────────────────────────────

export const getPlatformStats = async () => {
  const row = await queryOne<{ verified: string; resolved: string; regions: string }>(
    `select (select count(*) from profiles where verified) as verified,
            (select count(*) from polls where status = 'resolved') as resolved,
            (select count(distinct region) from polls where ${publicPoll('polls')}) as regions`,
  )
  return {
    verifiedHumans: Number(row?.verified ?? 0),
    pollsResolved: Number(row?.resolved ?? 0),
    regions: Number(row?.regions ?? 0),
  }
}

/** Admin page. */
export const getAuditStats = async () => {
  const row = await queryOne<{ polls: string; commitments: string }>(
    'select (select count(*) from polls) as polls, (select count(*) from audit_commitments) as commitments',
  )
  return { totalPolls: Number(row?.polls ?? 0), totalCommitments: Number(row?.commitments ?? 0) }
}

export const getAuditOverview = async () => {
  const row = await queryOne<Record<string, string>>(
    `select (select count(*) from poll_proposals) as proposals,
            (select count(*) from poll_proposals where status in ('pending', 'appealed')) as pending_proposals,
            (select count(*) from poll_proposals where status = 'approved') as approved_proposals,
            (select count(*) from disputes) as disputes,
            (select count(*) from disputes where status in ('open', 'reviewing')) as open_disputes,
            (select count(*) from dispute_reviews) as reviews,
            (select count(*) from votes) as sealed_votes,
            (select count(*) from source_templates) as source_templates`,
  )
  const n = (key: string) => Number(row?.[key] ?? 0)
  return {
    proposals: n('proposals'),
    pendingProposals: n('pending_proposals'),
    approvedProposals: n('approved_proposals'),
    disputes: n('disputes'),
    openDisputes: n('open_disputes'),
    reviews: n('reviews'),
    sealedVotes: n('sealed_votes'),
    sourceTemplates: n('source_templates'),
  }
}

/** P11, with the poll question only for public polls (P5). */
export const getAuditCommitments = () =>
  query<{ id: string; poll_id: string; merkle_root: string; batch_type: string; created_at: string; polls: { question: string } | null }>(
    `select c.id, c.poll_id, c.merkle_root, c.batch_type, c.created_at,
            case when ${publicPoll('p')} then json_build_object('question', p.question) else null end as polls
     from audit_commitments c left join polls p on p.id = c.poll_id
     order by c.created_at desc`,
  )

/** P12, with the poll question only for public polls (P5). For the audit export. */
export const getPublicDisputes = (limit = 250) =>
  query<{ id: string; poll_id: string; reason: string; status: string; created_at: string; resolved_at: string | null; resolution_notes: string | null; polls: { question: string } | null }>(
    `select d.id, d.poll_id, d.reason, d.status, d.created_at, d.resolved_at, d.resolution_notes,
            case when ${publicPoll('p')} then json_build_object('question', p.question) else null end as polls
     from disputes d left join polls p on p.id = d.poll_id
     order by d.created_at desc
     limit $1`,
    [limit],
  )

// ─── Disputes and panels ─────────────────────────────────────────────────────────────────────────

type EvidenceRow = { id: string; dispute_id: string; submitted_by: string; summary: string; source_url: string | null; created_at: string }
type ReviewRow = { id: string; dispute_id: string; reviewer_id: string; decision: string; rationale: string; created_at: string; profiles: { handle: string } | null }

export type DisputeWithDetail = {
  id: string
  poll_id: string
  flagged_by: string
  reason: string
  status: string
  created_at: string
  resolved_at: string | null
  polls: { question: string; topic_id: string; topics: { label: string } | null } | null
  evidence: EvidenceRow[]
  reviews: ReviewRow[]
}

// P12 with P16 evidence and P18 reviews (P2 handles). onlyPublicPolls applies P5 to the embedded poll.
const disputesWithDetail = async (where: string, params: unknown[], onlyPublicPolls: boolean): Promise<DisputeWithDetail[]> => {
  const disputes = await query<Omit<DisputeWithDetail, 'evidence' | 'reviews'>>(
    `select d.id, d.poll_id, d.flagged_by, d.reason, d.status, d.created_at, d.resolved_at,
            case when p.id is null ${onlyPublicPolls ? `or not ${publicPoll('p')}` : ''} then null
                 else json_build_object('question', p.question, 'topic_id', p.topic_id,
                   'topics', case when t.id is null then null else json_build_object('label', t.label) end)
            end as polls
     from disputes d
     left join polls p on p.id = d.poll_id
     left join topics t on t.id = p.topic_id
     where ${where}
     order by d.created_at desc`,
    params,
  )
  if (disputes.length === 0) return []
  const ids = disputes.map((d) => d.id)
  const [evidence, reviews] = await Promise.all([
    query<EvidenceRow>('select * from dispute_evidence where dispute_id = any($1::uuid[]) order by created_at', [ids]),
    query<ReviewRow>(
      `select r.*, case when pr.id is null then null else json_build_object('handle', pr.handle) end as profiles
       from dispute_reviews r left join profiles pr on pr.id = r.reviewer_id
       where r.dispute_id = any($1::uuid[])
       order by r.created_at`,
      [ids],
    ),
  ])
  return disputes.map((d) => ({
    ...d,
    evidence: evidence.filter((e) => e.dispute_id === d.id),
    reviews: reviews.filter((r) => r.dispute_id === d.id),
  }))
}

/** Admin page: open and reviewing disputes, with the poll whatever its status. */
export const getOpenDisputes = () => disputesWithDetail(`d.status in ('open', 'reviewing')`, [], false)

export type PanelMembershipRow = {
  id: string
  topic_id: string
  user_id: string
  status: string
  min_reputation_at_invite: number
  invited_at: string
  accepted_at: string | null
  topics: { label: string; slug: string } | null
}

/** The viewer's active panel memberships and the open disputes in those topics (P12, P15, P16, P18). */
export const getMyPanelWorkspace = async (viewer: Viewer | null) => {
  if (!viewer) return { user: null, memberships: [], disputes: [] }
  const memberships = await query<PanelMembershipRow>(
    `select m.id, m.topic_id, m.user_id, m.status, m.min_reputation_at_invite, m.invited_at, m.accepted_at,
            case when t.id is null then null else json_build_object('label', t.label, 'slug', t.slug) end as topics
     from panel_members m left join topics t on t.id = m.topic_id
     where m.user_id = $1 and m.status = 'active'
     order by m.accepted_at desc nulls last`,
    [viewer.id],
  )
  const topicIds = memberships.map((m) => m.topic_id)
  if (topicIds.length === 0) return { user: viewer, memberships, disputes: [] }
  const disputes = await disputesWithDetail(
    `d.status in ('open', 'reviewing') and p.topic_id = any($1::uuid[])`,
    [topicIds],
    true,
  )
  return { user: viewer, memberships, disputes }
}

/** P15, P16, P18 with P2 handles; poll questions only for public polls (P5). */
export const getPanelTransparency = async () => {
  const disputeJson = `case when d.id is null then null else json_build_object('poll_id', d.poll_id, 'status', d.status,
      'polls', case when ${publicPoll('p')} then json_build_object('question', p.question) else null end) end`
  const [members, evidence, reviews] = await Promise.all([
    query<PanelMembershipRow & { profiles: { handle: string } | null }>(
      `select m.*,
              case when t.id is null then null else json_build_object('label', t.label, 'slug', t.slug) end as topics,
              case when pr.id is null then null else json_build_object('handle', pr.handle) end as profiles
       from panel_members m
       left join topics t on t.id = m.topic_id
       left join profiles pr on pr.id = m.user_id
       order by m.invited_at desc
       limit 50`,
    ),
    query<EvidenceRow & { disputes: { poll_id: string; status: string; polls: { question: string } | null } | null }>(
      `select e.*, ${disputeJson} as disputes
       from dispute_evidence e
       left join disputes d on d.id = e.dispute_id
       left join polls p on p.id = d.poll_id
       order by e.created_at desc
       limit 50`,
    ),
    query<ReviewRow & { disputes: { poll_id: string; status: string; polls: { question: string } | null } | null }>(
      `select r.*, ${disputeJson} as disputes,
              case when pr.id is null then null else json_build_object('handle', pr.handle) end as profiles
       from dispute_reviews r
       left join disputes d on d.id = r.dispute_id
       left join polls p on p.id = d.poll_id
       left join profiles pr on pr.id = r.reviewer_id
       order by r.created_at desc
       limit 50`,
    ),
  ])
  return { members, evidence, reviews }
}

// ─── Proposals ───────────────────────────────────────────────────────────────────────────────────

/** P20. */
export const getSourceTemplates = () => query<SourceTemplateRow>('select * from source_templates order by region, label')

export type ProposalRow = {
  id: string
  proposed_by: string
  topic_id: string
  question: string
  region: string
  options: string[]
  source_of_truth: string
  resolution_criteria: string
  cutoff_at: string
  resolves_at: string
  status: string
  moderator_notes: string | null
  poll_id: string | null
  revision_count: number
  appeal_reason: string | null
  appealed_at: string | null
  created_at: string
  updated_at: string
  moderated_at: string | null
  topics: TopicRef
  profiles: { handle: string } | null
}

const proposalsQuery = (where: string, order: string) =>
  `select pp.id, pp.proposed_by, pp.topic_id, pp.question, pp.region, pp.options, pp.source_of_truth,
          pp.resolution_criteria, pp.cutoff_at, pp.resolves_at, pp.status, pp.moderator_notes, pp.poll_id,
          pp.revision_count, pp.appeal_reason, pp.appealed_at, pp.created_at, pp.updated_at, pp.moderated_at,
          ${topicJson('t')} as topics,
          case when pr.id is null then null else json_build_object('handle', pr.handle) end as profiles
   from poll_proposals pp
   left join topics t on t.id = pp.topic_id
   left join profiles pr on pr.id = pp.proposed_by
   ${where}
   order by ${order}`

/** P21: every proposal, including moderator notes and rejected ones. */
export const getPollProposals = (limit = 100) =>
  query<ProposalRow>(`${proposalsQuery('', 'pp.created_at desc')} limit $1`, [limit])

/** Admin page: the moderation queue. */
export const getPendingPollProposals = () => query<ProposalRow>(proposalsQuery(`where pp.status = 'pending'`, 'pp.created_at asc'))

// ─── Invites ─────────────────────────────────────────────────────────────────────────────────────

export type InviteListRow = { id: string; code: string; used_by: string | null; used_at: string | null; created_at: string }

/** P14: the invites the viewer created (D9: nobody else's). */
export const getOwnInvites = (viewer: Viewer) =>
  query<InviteListRow>(
    'select id, code, used_by, used_at, created_at from invites where created_by = $1 order by created_at desc',
    [viewer.id],
  )

// ─── Reports ─────────────────────────────────────────────────────────────────────────────────────

/** The weekly signal report. Poll inventory is P5-filtered: draft questions stay private. */
export const getLaunchSignalReport = async () => {
  const [polls, counts] = await Promise.all([
    query<{ status: string; question: string; source_of_truth: string | null; resolution_criteria: string | null }>(
      `select status, question, source_of_truth, resolution_criteria from polls p where ${publicPoll('p')}`,
    ),
    queryOne<Record<string, string>>(
      `select (select count(*) from votes) as votes,
              (select count(*) from poll_proposals) as proposals,
              (select count(*) from poll_proposals where status in ('pending', 'appealed')) as pending_proposals,
              (select count(*) from disputes) as disputes,
              (select count(*) from disputes where status in ('open', 'reviewing')) as open_disputes,
              (select count(*) from dispute_reviews) as panel_reviews,
              (select count(*) from invites) as invites_issued,
              (select count(*) from invites where used_by is not null or used_at is not null) as invites_accepted`,
    ),
  ])
  const n = (key: string) => Number(counts?.[key] ?? 0)

  const weakPolls = polls
    .filter((p) => !p.source_of_truth || !p.resolution_criteria || p.resolution_criteria.length < 80)
    .slice(0, 3)
    .map((p) => `Tighten resolution criteria: ${p.question}`)

  const watchlist = [
    ...(weakPolls.length ? weakPolls : ['No obvious missing source/criteria fields in current poll inventory.']),
    'Before external beta, spot-check seed questions for named official sources and explicit “what does not count” language.',
    'First weekly report should include actual cohort size once invites are issued and accepted.',
  ]

  return {
    generatedAt: new Date().toISOString(),
    activePolls: polls.filter((p) => p.status === 'active').length,
    resolvedPolls: polls.filter((p) => p.status === 'resolved').length,
    votes: n('votes'),
    proposals: n('proposals'),
    pendingProposals: n('pending_proposals'),
    disputes: n('disputes'),
    openDisputes: n('open_disputes'),
    panelReviews: n('panel_reviews'),
    invitesIssued: n('invites_issued'),
    invitesAccepted: n('invites_accepted'),
    invitesOpen: n('invites_issued') - n('invites_accepted'),
    watchlist,
  }
}
