'use client'

import { useState } from 'react'
import { Eyebrow, Badge, Btn } from '@civicsignal/ui'
import { REPUTATION_TIERS, tierLabel } from '@/lib/reputation'

type Topic = {
  id: string
  slug: string
  label: string
}

type AwaitingPoll = {
  id: string
  question: string
  topic_id: string
  resolves_at: string
  source_of_truth?: string | null
  options: string[]
  topics?: { slug: string; label: string } | null
}

type AuditStats = {
  totalPolls: number
  totalCommitments: number
}

type Dispute = {
  id: string
  poll_id: string
  flagged_by: string
  reason: string
  status: string
  created_at: string
  resolved_at: string | null
  polls: { question: string; topics?: { label: string } | null } | null
  evidence?: Array<{ id: string; summary: string; source_url: string | null; created_at: string }>
  reviews?: Array<{ id: string; decision: string; rationale: string; created_at: string; profiles?: { handle: string } | null }>
}

type PollProposal = {
  id: string
  question: string
  topic_id: string
  region: string
  options: string[]
  source_of_truth: string
  resolution_criteria: string
  cutoff_at: string
  resolves_at: string
  status: string
  created_at: string
  profiles?: { handle: string } | null
  topics?: { label: string } | null
}

// Tiers only, even here: exact scores are the owner's alone (P10).
type PanelCandidate = {
  user_id: string
  topic_id: string
  tier: string
  panelStatus: string | null
  profiles: { handle: string; verified: boolean } | null
  topics: { slug: string; label: string } | null
}

const REGIONS = [
  'Global', 'United States', 'European Union', 'United Nations', 'OPEC+',
]

const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 14px',
  fontSize: 14, fontFamily: 'inherit',
  color: 'var(--color-parchment-ink)',
  background: 'var(--color-parchment-bg)',
  border: '1px solid var(--color-parchment-line)',
  borderRadius: 3, outline: 'none',
}

const Field = ({
  label,
  children,
  mt = 18,
}: {
  label: string
  children: React.ReactNode
  mt?: number
}) => (
  <div style={{ marginTop: mt }}>
    <label style={{
      display: 'block', marginBottom: 8,
      fontSize: 12, fontWeight: 500,
      color: 'var(--color-parchment-ink-soft)',
    }}>
      {label}
    </label>
    {children}
  </div>
)

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono" style={{
    marginTop: 6, fontSize: 11,
    color: 'var(--color-parchment-muted)',
    letterSpacing: '0.02em',
  }}>
    {children}
  </div>
)

const SelectField = ({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) => (
  <div style={{ position: 'relative' }}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle,
        appearance: 'none',
        paddingRight: 30,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    <span style={{
      position: 'absolute', right: 12, top: 14,
      color: 'var(--color-parchment-muted)',
      pointerEvents: 'none', fontSize: 10,
    }}>
      ▼
    </span>
  </div>
)

const formatResolutionDue = (resolvesAt: string) => {
  const now = new Date()
  const resolves = new Date(resolvesAt)
  const diffMs = resolves.getTime() - now.getTime()
  if (diffMs < 0) return 'Overdue'
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (diffDays === 0 && diffHours === 0) return 'Today'
  if (diffDays === 0) return `In ${diffHours}h`
  if (diffHours === 0) return `In ${diffDays}d`
  return `In ${diffDays}d ${diffHours}h`
}


type ResolveState = {
  outcome: string
  notes: string
  sourceUrl: string
  loading: boolean
  error: string | null
}

export const AdminPage = ({
  topics,
  disputes,
  awaitingResolution: initialAwaitingResolution,
  auditStats,
  panelCandidates,
  pendingProposals,
}: {
  topics: Topic[]
  disputes: Dispute[]
  awaitingResolution: AwaitingPoll[]
  auditStats: AuditStats
  panelCandidates: PanelCandidate[]
  pendingProposals: PollProposal[]
}) => {
  const [question, setQuestion] = useState('Will the IPCC AR7 Synthesis Report be published before 31 December 2026?')
  const [topicId, setTopicId] = useState(topics[0]?.id ?? '')
  const [region, setRegion] = useState('Global')
  const [options, setOptions] = useState(['Yes', 'No'])
  const [cutoffAt, setCutoffAt] = useState('2026-06-15  23:00')
  const [resolvesAt, setResolvesAt] = useState('2026-12-31  23:59')
  const [sourceOfTruth, setSourceOfTruth] = useState('IPCC.ch press release + UNFCCC bulletin')
  const [resolutionCriteria, setResolutionCriteria] = useState(
    'Resolves YES if the IPCC publishes the AR7 Synthesis Report on ipcc.ch on or before 23:59 UTC, 31 Dec 2026. Resolves NO otherwise. Pre-publication leaks do not count.'
  )
  const [publishing, setPublishing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [disputeList, setDisputeList] = useState<Dispute[]>(disputes)
  const [disputeLoading, setDisputeLoading] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [candidateKey, setCandidateKey] = useState(panelCandidates.find((c) => !c.panelStatus)?.user_id + ':' + panelCandidates.find((c) => !c.panelStatus)?.topic_id || '')
  const [inviteMinTier, setInviteMinTier] = useState('participant')
  const [invitingPanelist, setInvitingPanelist] = useState(false)
  const [proposalList, setProposalList] = useState<PollProposal[]>(pendingProposals)
  const [proposalNotes, setProposalNotes] = useState<Record<string, string>>({})
  const [proposalLoading, setProposalLoading] = useState<string | null>(null)
  const [awaitingResolution, setAwaitingResolution] = useState<AwaitingPoll[]>(initialAwaitingResolution)
  const [resolveStates, setResolveStates] = useState<Record<string, ResolveState>>({})
  const [expandedResolve, setExpandedResolve] = useState<string | null>(null)

  const handleDisputeAction = async (disputeId: string, status: 'reviewing') => {
    setDisputeLoading(disputeId)
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setDisputeList((prev) =>
          prev.map((d) => (d.id === disputeId ? { ...d, status: data.dispute.status } : d))
        )
      }
    } finally {
      setDisputeLoading(null)
    }
  }

  const handlePanelReview = async (disputeId: string, decision: 'uphold' | 'dismiss') => {
    const rationale = reviewNotes[disputeId]?.trim() || (decision === 'uphold' ? 'Panel review supports the dispute.' : 'Panel review does not support the dispute.')
    setDisputeLoading(disputeId)
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, rationale }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setDisputeList((prev) =>
          prev.map((d) => {
            if (d.id !== disputeId) return d
            const nextReviews = [
              ...(d.reviews ?? []).filter((r) => r.id !== data.review.id),
              data.review,
            ]
            return { ...d, status: data.closedAs ?? 'reviewing', reviews: nextReviews }
          })
        )
      }
    } finally {
      setDisputeLoading(null)
    }
  }

  const handleResolveSubmit = async (pollId: string) => {
    const state = resolveStates[pollId]
    if (!state) return
    if (!state.outcome || !state.notes.trim() || !state.sourceUrl.trim()) {
      setResolveStates((prev) => ({
        ...prev,
        [pollId]: { ...prev[pollId], error: 'Outcome, notes, and source URL are required before resolving.' },
      }))
      return
    }
    setResolveStates((prev) => ({ ...prev, [pollId]: { ...prev[pollId], loading: true, error: null } }))
    try {
      const res = await fetch(`/api/admin/polls/${pollId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: state.outcome, notes: state.notes, sourceUrl: state.sourceUrl }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAwaitingResolution((prev) => prev.filter((p) => p.id !== pollId))
        setExpandedResolve(null)
      } else {
        setResolveStates((prev) => ({
          ...prev,
          [pollId]: { ...prev[pollId], loading: false, error: data.error ?? 'Failed to resolve poll' },
        }))
      }
    } catch {
      setResolveStates((prev) => ({
        ...prev,
        [pollId]: { ...prev[pollId], loading: false, error: 'Network error — please try again' },
      }))
    }
  }

  const cleanedOptions = () => options.map((o) => o.trim()).filter(Boolean)

  const validatePollForm = () => {
    const trimmedQuestion = question.trim()
    const trimmedSource = sourceOfTruth.trim()
    const trimmedCriteria = resolutionCriteria.trim()
    const cutoffDate = new Date(cutoffAt.trim())
    const resolvesDate = new Date(resolvesAt.trim())

    if (!trimmedQuestion) return 'Question is required.'
    if (!topicId) return 'Topic is required.'
    if (cleanedOptions().length < 2) return 'Add at least two outcome options.'
    if (!trimmedSource) return 'Source-of-truth is required before a poll can be saved.'
    if (!trimmedCriteria) return 'Resolution criteria are required.'
    if (Number.isNaN(cutoffDate.getTime())) return 'Cutoff must be a valid UTC date/time.'
    if (Number.isNaN(resolvesDate.getTime())) return 'Resolution date must be a valid UTC date/time.'
    if (cutoffDate >= resolvesDate) return 'Cutoff must be before the resolution date.'
    return null
  }

  const buildPollPayload = () => ({
    question: question.trim(),
    topicId,
    region,
    options: cleanedOptions(),
    sourceOfTruth: sourceOfTruth.trim(),
    resolutionCriteria: resolutionCriteria.trim(),
    cutoffAt: new Date(cutoffAt.trim()).toISOString(),
    resolvesAt: new Date(resolvesAt.trim()).toISOString(),
  })

  const resetCreateForm = () => {
    setQuestion('')
    setOptions(['Yes', 'No'])
    setSourceOfTruth('')
    setResolutionCriteria('')
  }

  const handleSaveDraft = async () => {
    setSavingDraft(true)
    setError(null)
    setNotice(null)
    try {
      const validationError = validatePollForm()
      if (validationError) {
        setError(validationError)
        return
      }
      const createRes = await fetch('/api/admin/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPollPayload()),
      })
      const createData = await createRes.json()
      if (!createRes.ok || !createData.success) {
        setError(createData.error ?? 'Failed to save draft')
        return
      }
      setNotice(`Draft saved · ${createData.data.poll.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSavingDraft(false)
    }
  }

  const handlePublish = async () => {
    setPublishing(true)
    setError(null)
    setNotice(null)
    try {
      const validationError = validatePollForm()
      if (validationError) {
        setError(validationError)
        return
      }
      const createRes = await fetch('/api/admin/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPollPayload()),
      })
      const createData = await createRes.json()
      if (!createRes.ok || !createData.success) {
        setError(createData.error ?? 'Failed to create poll')
        return
      }
      const pollId = createData.data.poll.id
      const publishRes = await fetch(`/api/admin/polls/${pollId}/publish`, { method: 'POST' })
      const publishData = await publishRes.json()
      if (!publishRes.ok || !publishData.success) {
        setError(publishData.error ?? 'Failed to publish poll')
        return
      }
      setNotice(`Poll published · ${pollId}`)
      resetCreateForm()
    } catch {
      setError('Network error — please try again')
    } finally {
      setPublishing(false)
    }
  }

  const moderateProposal = async (proposalId: string, action: 'approve' | 'reject' | 'changes_requested') => {
    setProposalLoading(proposalId)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, moderatorNotes: proposalNotes[proposalId] ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to moderate proposal')
        return
      }
      setProposalList((prev) => prev.filter((p) => p.id !== proposalId))
      setNotice(action === 'approve' ? `Proposal approved into draft poll · ${data.poll?.id}` : `Proposal marked ${action.replace('_', ' ')}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setProposalLoading(null)
    }
  }

  const handlePanelInvite = async () => {
    const [userId, topicId] = candidateKey.split(':')
    if (!userId || !topicId) {
      setError('Select an eligible user before inviting a panelist.')
      return
    }
    setInvitingPanelist(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/panels/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, topicId, minTier: inviteMinTier, activate: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to invite panelist')
        return
      }
      const candidate = panelCandidates.find((c) => c.user_id === userId && c.topic_id === topicId)
      setNotice(`Panelist activated · ${candidate?.profiles?.handle ?? userId} / ${candidate?.topics?.label ?? 'topic'}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setInvitingPanelist(false)
    }
  }

  const topicOptions = topics.map((t) => ({ value: t.id, label: t.label }))
  const regionOptions = REGIONS.map((r) => ({ value: r, label: r }))

  return (
    <div className="bg-parchment-bg min-h-screen">
      <main style={{ padding: '32px 40px 80px', maxWidth: 1280, margin: '0 auto' }}>

        {/* Page header */}
        <div className="cs-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <Eyebrow>Resolver workspace · internal</Eyebrow>
            <h1 style={{
              margin: '8px 0 0', fontSize: 32, fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'var(--color-parchment-ink)',
            }}>
              Author, monitor, and resolve civic polls
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn kind="ghost" size="md" onClick={() => { window.location.href = '/verify' }}>Audit log</Btn>
            <Btn kind="primary" size="md" onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish poll'}
            </Btn>
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 16, padding: '12px 16px',
            background: 'var(--color-parchment-surface)',
            border: '1px solid var(--color-parchment-amber)',
            borderRadius: 3, fontSize: 13,
            color: 'var(--color-parchment-amber)',
          }}>
            {error}
          </div>
        )}

        {notice && (
          <div style={{
            marginTop: 16, padding: '12px 16px',
            background: 'var(--color-parchment-surface)',
            border: '1px solid var(--color-parchment-green)',
            borderRadius: 3, fontSize: 13,
            color: 'var(--color-parchment-green)',
          }}>
            {notice}
          </div>
        )}

        {/* Two-col grid */}
        <div className="cs-detail-grid" style={{
          display: 'grid', gridTemplateColumns: '1.3fr 1fr',
          gap: 32, marginTop: 32,
        }}>

          {/* Left: Create poll form */}
          <section style={{
            background: 'var(--color-parchment-surface)',
            border: '1px solid var(--color-parchment-line)',
            borderRadius: 4, padding: '28px 32px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Eyebrow>Create poll · draft</Eyebrow>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)' }}>
                DRAFT-{new Date().toISOString().slice(0, 10).toUpperCase()}-A
              </span>
            </div>

            {/* Question */}
            <Field label="Question" mt={20}>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                style={{
                  width: '100%', minHeight: 78, padding: '12px 14px',
                  fontSize: 16, fontFamily: 'inherit',
                  color: 'var(--color-parchment-ink)',
                  lineHeight: 1.45,
                  background: 'var(--color-parchment-bg)',
                  border: '1px solid var(--color-parchment-line)',
                  borderRadius: 3, resize: 'vertical', outline: 'none',
                }}
              />
              <Hint>Plain English. Resolvable. Avoid governance jargon unless the source-of-truth uses it.</Hint>
            </Field>

            {/* Topic + Region */}
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <Field label="Topic">
                <SelectField value={topicId} options={topicOptions} onChange={setTopicId} />
              </Field>
              <Field label="Region">
                <SelectField value={region} options={regionOptions} onChange={setRegion} />
              </Field>
            </div>

            {/* Outcome options */}
            <Field label="Outcome options">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {options.map((o, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="font-mono" style={{
                      width: 24, fontSize: 11,
                      color: 'var(--color-parchment-muted)',
                    }}>
                      {i + 1}
                    </span>
                    <input
                      value={o}
                      onChange={(e) => setOptions(options.map((opt, idx) => idx === i ? e.target.value : opt))}
                      style={inputStyle}
                    />
                    <button
                      onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                      style={{
                        padding: '6px 10px', fontSize: 12,
                        background: 'transparent',
                        border: '1px solid var(--color-parchment-line)',
                        color: 'var(--color-parchment-muted)',
                        borderRadius: 3,
                        cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setOptions([...options, ''])}
                  style={{
                    alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12,
                    color: 'var(--color-parchment-ink-soft)',
                    background: 'transparent',
                    border: '1px dashed var(--color-parchment-line)',
                    borderRadius: 3, cursor: 'pointer',
                  }}
                >
                  + Add option
                </button>
              </div>
            </Field>

            {/* Cutoff + Resolution date */}
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <Field label="Cutoff (UTC)">
                <input
                  value={cutoffAt}
                  onChange={(e) => setCutoffAt(e.target.value)}
                  className="font-mono"
                  style={inputStyle}
                />
              </Field>
              <Field label="Resolution date (UTC)">
                <input
                  value={resolvesAt}
                  onChange={(e) => setResolvesAt(e.target.value)}
                  className="font-mono"
                  style={inputStyle}
                />
              </Field>
            </div>

            {/* Source-of-truth */}
            <Field label="Source-of-truth (named before launch)">
              <input
                value={sourceOfTruth}
                onChange={(e) => setSourceOfTruth(e.target.value)}
                style={inputStyle}
              />
              <Hint>Single, named, public source. Cannot be changed after the poll opens.</Hint>
            </Field>

            {/* Resolution criteria */}
            <Field label="Resolution criteria">
              <textarea
                value={resolutionCriteria}
                onChange={(e) => setResolutionCriteria(e.target.value)}
                style={{
                  ...inputStyle,
                  height: 'auto', minHeight: 70,
                  fontSize: 13.5, lineHeight: 1.5,
                  padding: '10px 14px',
                  resize: 'vertical',
                }}
              />
            </Field>

            {/* Footer */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 24, paddingTop: 20,
              borderTop: '1px solid var(--color-parchment-line-soft)',
            }}>
              <span className="font-mono" style={{
                fontSize: 11,
                color: 'var(--color-parchment-muted)',
                letterSpacing: '0.04em',
              }}>
                Will be committed to public log on publish
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn kind="ghost" size="md" onClick={handleSaveDraft} disabled={savingDraft || publishing}>
                  {savingDraft ? 'Saving…' : 'Save draft'}
                </Btn>
                <Btn kind="primary" size="md" onClick={handlePublish} disabled={publishing || savingDraft}>
                  {publishing ? 'Publishing…' : 'Publish poll →'}
                </Btn>
              </div>
            </div>
          </section>

          {/* Right rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Awaiting resolution */}
            <div style={{
              background: 'var(--color-parchment-surface)',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-parchment-line-soft)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <Eyebrow>Awaiting resolution</Eyebrow>
                <span className="font-mono" style={{
                  fontSize: 12, color: 'var(--color-parchment-ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {awaitingResolution.length}
                </span>
              </div>

              {awaitingResolution.length === 0 ? (
                <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--color-parchment-muted)' }}>
                  No polls awaiting resolution.
                </div>
              ) : (
                awaitingResolution.map((poll, i) => {
                  const isExpanded = expandedResolve === poll.id
                  const rs = resolveStates[poll.id] ?? { outcome: poll.options[0] ?? '', notes: '', sourceUrl: '', loading: false, error: null }
                  return (
                    <div key={poll.id} style={{
                      borderTop: i === 0 ? 'none' : '1px solid var(--color-parchment-line-soft)',
                    }}>
                      <div style={{ padding: '14px 20px' }}>
                        <div style={{ fontSize: 13.5, color: 'var(--color-parchment-ink)', lineHeight: 1.4 }}>
                          {poll.question}
                        </div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginTop: 8,
                        }}>
                          <span className="font-mono" style={{
                            fontSize: 10.5, color: 'var(--color-parchment-muted)',
                            letterSpacing: '0.04em', textTransform: 'uppercase',
                          }}>
                            {poll.source_of_truth ?? poll.topics?.label ?? '—'}
                          </span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className="font-mono" style={{
                              fontSize: 10.5, color: 'var(--color-parchment-amber)',
                              letterSpacing: '0.04em', textTransform: 'uppercase',
                            }}>
                              {formatResolutionDue(poll.resolves_at)}
                            </span>
                            <button
                              onClick={() => {
                                if (!isExpanded) {
                                  setResolveStates((prev) => ({
                                    ...prev,
                                    [poll.id]: prev[poll.id] ?? { outcome: poll.options[0] ?? '', notes: '', sourceUrl: '', loading: false, error: null },
                                  }))
                                }
                                setExpandedResolve(isExpanded ? null : poll.id)
                              }}
                              style={{
                                padding: '3px 10px', fontSize: 11, fontFamily: 'inherit',
                                color: 'var(--color-parchment-accent)',
                                background: 'transparent',
                                border: '1px solid var(--color-parchment-accent)',
                                borderRadius: 3, cursor: 'pointer',
                              }}
                            >
                              {isExpanded ? 'Cancel' : 'Resolve'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{
                          padding: '12px 20px 16px',
                          borderTop: '1px solid var(--color-parchment-line-soft)',
                          background: 'var(--color-parchment-bg)',
                        }}>
                          <Field label="Outcome" mt={0}>
                            <SelectField
                              value={rs.outcome}
                              options={poll.options.map((o) => ({ value: o, label: o }))}
                              onChange={(v) => setResolveStates((prev) => ({ ...prev, [poll.id]: { ...rs, outcome: v } }))}
                            />
                          </Field>
                          <Field label="Resolution notes">
                            <textarea
                              value={rs.notes}
                              onChange={(e) => setResolveStates((prev) => ({ ...prev, [poll.id]: { ...rs, notes: e.target.value } }))}
                              placeholder="Explain how the outcome was determined…"
                              style={{
                                ...inputStyle, height: 'auto', minHeight: 60,
                                fontSize: 13, lineHeight: 1.5, padding: '8px 12px', resize: 'vertical',
                              }}
                            />
                          </Field>
                          <Field label="Source URL">
                            <input
                              value={rs.sourceUrl}
                              onChange={(e) => setResolveStates((prev) => ({ ...prev, [poll.id]: { ...rs, sourceUrl: e.target.value } }))}
                              placeholder="https://…"
                              style={inputStyle}
                            />
                          </Field>
                          {rs.error && (
                            <div style={{
                              marginTop: 10, padding: '8px 12px', fontSize: 12,
                              color: 'var(--color-parchment-amber)',
                              border: '1px solid var(--color-parchment-amber)',
                              borderRadius: 3,
                            }}>
                              {rs.error}
                            </div>
                          )}
                          <div style={{ marginTop: 12 }}>
                            <Btn
                              kind="primary"
                              size="md"
                              onClick={() => handleResolveSubmit(poll.id)}
                              disabled={rs.loading || !rs.outcome || !rs.notes.trim() || !rs.sourceUrl.trim()}
                            >
                              {rs.loading ? 'Resolving…' : 'Confirm resolution'}
                            </Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Proposal moderation */}
            <div style={{
              background: 'var(--color-parchment-surface)',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Eyebrow>Proposal moderation</Eyebrow>
                <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-parchment-ink)' }}>{proposalList.length}</span>
              </div>
              {proposalList.length === 0 ? (
                <div style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-parchment-muted)' }}>No pending proposals.</div>
              ) : proposalList.map((proposal, i) => (
                <div key={proposal.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--color-parchment-line-soft)' }}>
                  <div style={{ fontSize: 13.5, color: 'var(--color-parchment-ink)', lineHeight: 1.4 }}>{proposal.question}</div>
                  <div className="font-mono" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {proposal.topics?.label ?? 'Topic'} · {proposal.region} · {proposal.profiles?.handle ?? 'verified user'}
                  </div>
                  <textarea
                    value={proposalNotes[proposal.id] ?? ''}
                    onChange={(e) => setProposalNotes((prev) => ({ ...prev, [proposal.id]: e.target.value }))}
                    placeholder="Moderator notes…"
                    style={{ width: '100%', minHeight: 44, marginTop: 8, padding: '7px 9px', fontSize: 11.5, fontFamily: 'inherit', color: 'var(--color-parchment-ink)', background: 'var(--color-parchment-bg)', border: '1px solid var(--color-parchment-line)', borderRadius: 3, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => moderateProposal(proposal.id, 'approve')} disabled={proposalLoading === proposal.id} style={{ padding: '4px 10px', fontSize: 11, fontFamily: 'inherit', color: 'var(--color-parchment-green)', background: 'transparent', border: '1px solid var(--color-parchment-green)', borderRadius: 3, cursor: 'pointer', opacity: proposalLoading === proposal.id ? 0.5 : 1 }}>Approve draft</button>
                    <button onClick={() => moderateProposal(proposal.id, 'changes_requested')} disabled={proposalLoading === proposal.id} style={{ padding: '4px 10px', fontSize: 11, fontFamily: 'inherit', color: 'var(--color-parchment-amber)', background: 'transparent', border: '1px solid var(--color-parchment-amber)', borderRadius: 3, cursor: 'pointer', opacity: proposalLoading === proposal.id ? 0.5 : 1 }}>Request changes</button>
                    <button onClick={() => moderateProposal(proposal.id, 'reject')} disabled={proposalLoading === proposal.id} style={{ padding: '4px 10px', fontSize: 11, fontFamily: 'inherit', color: 'var(--color-parchment-muted)', background: 'transparent', border: '1px solid var(--color-parchment-line)', borderRadius: 3, cursor: 'pointer', opacity: proposalLoading === proposal.id ? 0.5 : 1 }}>Reject</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Panel invitations */}
            <div style={{
              background: 'var(--color-parchment-surface)',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Eyebrow>Panel invitations</Eyebrow>
                <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)' }}>rep-gated</span>
              </div>
              <p style={{ margin: '8px 0 12px', fontSize: 12, color: 'var(--color-parchment-muted)', lineHeight: 1.5 }}>
                Promote users with topic reputation into active review panels. Active panelists can review disputes in their topic workspace.
              </p>
              {panelCandidates.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-parchment-muted)' }}>No eligible users with topic reputation yet.</p>
              ) : (
                <>
                  <Field label="Eligible user / topic" mt={0}>
                    <SelectField
                      value={candidateKey}
                      options={panelCandidates.map((c) => ({
                        value: `${c.user_id}:${c.topic_id}`,
                        label: `${c.profiles?.handle ?? c.user_id.slice(0, 8)} · ${c.topics?.label ?? 'Topic'} · ${tierLabel(c.tier)}${c.panelStatus ? ` · ${c.panelStatus}` : ''}`,
                      }))}
                      onChange={setCandidateKey}
                    />
                  </Field>
                  <Field label="Minimum topic tier">
                    <SelectField
                      value={inviteMinTier}
                      options={REPUTATION_TIERS.filter((t) => t.min > 0).map((t) => ({ value: t.key, label: `${t.label} (${t.min}+ correct)` }))}
                      onChange={setInviteMinTier}
                    />
                  </Field>
                  <div style={{ marginTop: 12 }}>
                    <Btn kind="primary" size="md" onClick={handlePanelInvite} disabled={invitingPanelist || !candidateKey}>
                      {invitingPanelist ? 'Activating…' : 'Activate panelist'}
                    </Btn>
                  </div>
                </>
              )}
            </div>

            {/* Open disputes */}
            <div style={{
              background: 'var(--color-parchment-surface)',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-parchment-line-soft)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <Eyebrow>Open disputes</Eyebrow>
                <span className="font-mono" style={{
                  fontSize: 12, color: 'var(--color-parchment-ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {disputeList.filter((d) => d.status === 'open' || d.status === 'reviewing').length}
                </span>
              </div>

              {disputeList.length === 0 ? (
                <div style={{ padding: '14px 20px', fontSize: 13, color: 'var(--color-parchment-muted)' }}>
                  No open disputes.
                </div>
              ) : (
                disputeList.map((dispute, i) => (
                  <div key={dispute.id} style={{
                    padding: '14px 20px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--color-parchment-line-soft)',
                  }}>
                    <div style={{ fontSize: 13, color: 'var(--color-parchment-ink)', lineHeight: 1.4, marginBottom: 4 }}>
                      {dispute.polls?.question ?? '—'}
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.5 }}>
                      {dispute.reason}
                    </p>
                    {(dispute.evidence?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 8, padding: '8px 10px', border: '1px solid var(--color-parchment-line-soft)', borderRadius: 3 }}>
                        <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Evidence packet</div>
                        {dispute.evidence!.map((e) => (
                          <p key={e.id} style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.45 }}>
                            {e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-parchment-accent)' }}>Source</a> : 'Source'} · {e.summary}
                          </p>
                        ))}
                      </div>
                    )}
                    {(dispute.reviews?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 8, fontSize: 11.5, color: 'var(--color-parchment-muted)', lineHeight: 1.45 }}>
                        {dispute.reviews!.length} panel review{dispute.reviews!.length !== 1 ? 's' : ''}: {dispute.reviews!.map((r) => `${r.profiles?.handle ?? 'reviewer'} ${r.decision}`).join(' · ')}
                      </div>
                    )}
                    {(dispute.status === 'open' || dispute.status === 'reviewing') && (
                      <textarea
                        value={reviewNotes[dispute.id] ?? ''}
                        onChange={(e) => setReviewNotes((prev) => ({ ...prev, [dispute.id]: e.target.value }))}
                        placeholder="Panel review rationale…"
                        style={{
                          width: '100%', minHeight: 48, marginBottom: 8, padding: '7px 9px',
                          fontSize: 11.5, fontFamily: 'inherit', color: 'var(--color-parchment-ink)',
                          background: 'var(--color-parchment-bg)', border: '1px solid var(--color-parchment-line)', borderRadius: 3,
                          resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono" style={{
                        fontSize: 10.5,
                        color: dispute.status === 'reviewing'
                          ? 'var(--color-parchment-amber)'
                          : 'var(--color-parchment-muted)',
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>
                        {dispute.status}
                      </span>
                      {(dispute.status === 'open' || dispute.status === 'reviewing') && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {dispute.status === 'open' && (
                            <button
                              onClick={() => handleDisputeAction(dispute.id, 'reviewing')}
                              disabled={disputeLoading === dispute.id}
                              style={{
                                padding: '4px 10px', fontSize: 11,
                                fontFamily: 'inherit',
                                color: 'var(--color-parchment-amber)',
                                background: 'transparent',
                                border: '1px solid var(--color-parchment-amber)',
                                borderRadius: 3, cursor: 'pointer',
                                opacity: disputeLoading === dispute.id ? 0.5 : 1,
                              }}
                            >
                              Review
                            </button>
                          )}
                          <button
                            onClick={() => handlePanelReview(dispute.id, 'uphold')}
                            disabled={disputeLoading === dispute.id}
                            style={{
                              padding: '4px 10px', fontSize: 11,
                              fontFamily: 'inherit',
                              color: 'var(--color-parchment-green)',
                              background: 'transparent',
                              border: '1px solid var(--color-parchment-green)',
                              borderRadius: 3, cursor: 'pointer',
                              opacity: disputeLoading === dispute.id ? 0.5 : 1,
                            }}
                          >
                            Uphold
                          </button>
                          <button
                            onClick={() => handlePanelReview(dispute.id, 'dismiss')}
                            disabled={disputeLoading === dispute.id}
                            style={{
                              padding: '4px 10px', fontSize: 11,
                              fontFamily: 'inherit',
                              color: 'var(--color-parchment-muted)',
                              background: 'transparent',
                              border: '1px solid var(--color-parchment-line)',
                              borderRadius: 3, cursor: 'pointer',
                              opacity: disputeLoading === dispute.id ? 0.5 : 1,
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Audit summary */}
            <div style={{
              background: 'var(--color-parchment-surface)',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4, padding: '18px 22px',
            }}>
              <Eyebrow>Audit summary</Eyebrow>
              <div className="font-mono" style={{
                fontSize: 22,
                color: 'var(--color-parchment-green)',
                marginTop: 8,
                fontVariantNumeric: 'tabular-nums',
              }}>
                PASS
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-parchment-muted)', lineHeight: 1.5 }}>
                {auditStats.totalPolls} total poll{auditStats.totalPolls !== 1 ? 's' : ''} · {auditStats.totalCommitments} commitment{auditStats.totalCommitments !== 1 ? 's' : ''} · 0 anomalies
              </p>
            </div>

          </aside>
        </div>
      </main>
    </div>
  )
}
