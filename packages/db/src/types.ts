// Row types for the CivicSignal schema (packages/db/migrations). Timestamps are ISO 8601
// strings: the pool in ./client parses timestamptz into Date and back with toISOString().

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type PollStatus = 'draft' | 'active' | 'closed' | 'resolved' | 'disputed'
export type DisputeStatus = 'open' | 'reviewing' | 'upheld' | 'dismissed'
export type BatchType = 'vote' | 'reputation' | 'resolution'
export type PanelMemberStatus = 'invited' | 'active' | 'declined' | 'removed'
export type DisputeDecision = 'uphold' | 'dismiss'
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'appealed'
export type EmailTokenPurpose = 'verify' | 'reset'

export interface UserRow {
  id: string
  email: string
  password_hash: string
  email_verified_at: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface SessionRow {
  id: string
  user_id: string
  token_hash: string
  created_at: string
  expires_at: string
  last_seen_at: string
}

export interface EmailTokenRow {
  id: string
  user_id: string
  purpose: EmailTokenPurpose
  token_hash: string
  created_at: string
  expires_at: string
  used_at: string | null
}

export interface TopicRow {
  id: string
  slug: string
  label: string
  created_at: string
}

export interface ProfileRow {
  id: string
  handle: string
  verified: boolean
  verified_at: string | null
  created_at: string
}

export interface PollRow {
  id: string
  topic_id: string
  question: string
  region: string
  options: Json
  source_of_truth: string
  resolution_criteria: string | null
  cutoff_at: string
  resolves_at: string
  status: PollStatus
  outcome: string | null
  resolution_notes: string | null
  resolution_source_url: string | null
  resolved_at: string | null
  resolved_by: string | null
  commitment_hash: string | null
  created_by: string | null
  created_at: string
}

export interface VoteRow {
  id: string
  poll_id: string
  user_id: string
  encrypted_answer: string
  answer: string | null
  receipt_hash: string
  created_at: string
}

export interface ReputationEventRow {
  id: string
  user_id: string
  poll_id: string
  topic_id: string
  delta: number
  created_at: string
}

export interface UserTopicReputationRow {
  user_id: string
  topic_id: string
  score: number
  resolved_count: number
  correct_count: number
}

export interface AuditCommitmentRow {
  id: string
  poll_id: string | null
  merkle_root: string
  batch_type: BatchType
  metadata: Json | null
  created_at: string
}

/** Server-only. Never send to a client; see docs/authz-policies.md (S1). */
export interface PollSecretRow {
  poll_id: string
  secret_key: string
  created_at: string
}

export interface DisputeRow {
  id: string
  poll_id: string
  flagged_by: string
  reason: string
  status: DisputeStatus
  created_at: string
  resolved_at: string | null
  resolution_notes: string | null
}

export interface PanelMemberRow {
  id: string
  topic_id: string
  user_id: string
  invited_by: string | null
  status: PanelMemberStatus
  min_reputation_at_invite: number
  invited_at: string
  accepted_at: string | null
  removed_at: string | null
}

export interface DisputeEvidenceRow {
  id: string
  dispute_id: string
  submitted_by: string
  summary: string
  source_url: string | null
  created_at: string
}

export interface DisputeReviewRow {
  id: string
  dispute_id: string
  reviewer_id: string
  decision: DisputeDecision
  rationale: string
  created_at: string
}

export interface InviteRow {
  id: string
  code: string
  created_by: string | null
  used_by: string | null
  used_at: string | null
  created_at: string
}

export interface SourceTemplateRow {
  id: string
  slug: string
  label: string
  region: string
  topic_slug: string | null
  source_of_truth: string
  resolution_criteria_template: string
  created_at: string
}

export interface PollProposalRow {
  id: string
  proposed_by: string
  topic_id: string
  question: string
  region: string
  options: Json
  source_of_truth: string
  resolution_criteria: string
  cutoff_at: string
  resolves_at: string
  status: ProposalStatus
  moderator_id: string | null
  moderator_notes: string | null
  poll_id: string | null
  created_at: string
  updated_at: string
  moderated_at: string | null
  revision_count: number
  appeal_reason: string | null
  appealed_at: string | null
}

// Insert shape: the listed columns are required, every other column has a default or is nullable.
export type InsertOf<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Omit<Row, Required>>

export interface Table<Row, Required extends keyof Row> {
  Row: Row
  Insert: InsertOf<Row, Required>
  Update: Partial<Row>
}

export interface Database {
  public: {
    Tables: {
      users: Table<UserRow, 'email' | 'password_hash'>
      sessions: Table<SessionRow, 'user_id' | 'token_hash' | 'expires_at'>
      email_tokens: Table<EmailTokenRow, 'user_id' | 'purpose' | 'token_hash' | 'expires_at'>
      topics: Table<TopicRow, 'slug' | 'label'>
      profiles: Table<ProfileRow, 'id' | 'handle'>
      polls: Table<PollRow, 'topic_id' | 'question' | 'region' | 'options' | 'source_of_truth' | 'cutoff_at' | 'resolves_at'>
      votes: Table<VoteRow, 'poll_id' | 'user_id' | 'encrypted_answer' | 'receipt_hash'>
      reputation_events: Table<ReputationEventRow, 'user_id' | 'poll_id' | 'topic_id'>
      user_topic_reputation: Table<UserTopicReputationRow, 'user_id' | 'topic_id'>
      audit_commitments: Table<AuditCommitmentRow, 'merkle_root' | 'batch_type'>
      poll_secrets: Table<PollSecretRow, 'poll_id' | 'secret_key'>
      disputes: Table<DisputeRow, 'poll_id' | 'flagged_by' | 'reason'>
      panel_members: Table<PanelMemberRow, 'topic_id' | 'user_id'>
      dispute_evidence: Table<DisputeEvidenceRow, 'dispute_id' | 'submitted_by' | 'summary'>
      dispute_reviews: Table<DisputeReviewRow, 'dispute_id' | 'reviewer_id' | 'decision' | 'rationale'>
      invites: Table<InviteRow, 'code'>
      source_templates: Table<SourceTemplateRow, 'slug' | 'label' | 'region' | 'source_of_truth' | 'resolution_criteria_template'>
      poll_proposals: Table<
        PollProposalRow,
        'proposed_by' | 'topic_id' | 'question' | 'region' | 'options' | 'source_of_truth' | 'resolution_criteria' | 'cutoff_at' | 'resolves_at'
      >
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      poll_status: PollStatus
      dispute_status: DisputeStatus
      batch_type: BatchType
    }
  }
}

export type Tables = Database['public']['Tables']
export type TableName = keyof Tables
export type Row<T extends TableName> = Tables[T]['Row']
export type Insert<T extends TableName> = Tables[T]['Insert']
export type Update<T extends TableName> = Tables[T]['Update']

// Convenience names kept from the Supabase-era types.
export type User = UserRow
export type Session = SessionRow
export type EmailToken = EmailTokenRow
export type Topic = TopicRow
export type Profile = ProfileRow
export type Poll = PollRow
export type Vote = VoteRow
export type ReputationEvent = ReputationEventRow
export type UserTopicReputation = UserTopicReputationRow
export type AuditCommitment = AuditCommitmentRow
export type PollSecret = PollSecretRow
export type Dispute = DisputeRow
export type PanelMember = PanelMemberRow
export type DisputeEvidence = DisputeEvidenceRow
export type DisputeReview = DisputeReviewRow
export type Invite = InviteRow
export type SourceTemplate = SourceTemplateRow
export type PollProposal = PollProposalRow

export type TopicInsert = Insert<'topics'>
export type ProfileInsert = Insert<'profiles'>
export type PollInsert = Insert<'polls'>
export type VoteInsert = Insert<'votes'>
export type ReputationEventInsert = Insert<'reputation_events'>
export type UserTopicReputationInsert = Insert<'user_topic_reputation'>
export type AuditCommitmentInsert = Insert<'audit_commitments'>
export type DisputeInsert = Insert<'disputes'>
export type InviteInsert = Insert<'invites'>
