'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eyebrow, Badge, Btn } from '@civicsignal/ui'

type Topic = { id: string; slug: string; label: string }
type Template = { id: string; slug: string; label: string; region: string; source_of_truth: string; resolution_criteria_template: string; topic_slug?: string | null }
type Proposal = { id: string; question: string; region: string; status: string; created_at: string; moderator_notes?: string | null; poll_id?: string | null; revision_count?: number | null; appeal_reason?: string | null; appealed_at?: string | null; topics?: { label: string } | null; profiles?: { handle: string } | null; options?: unknown; source_of_truth?: string; resolution_criteria?: string; cutoff_at?: string; resolves_at?: string }

const inputStyle: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--color-parchment-ink)', background: 'var(--color-parchment-bg)', border: '1px solid var(--color-parchment-line)', borderRadius: 3, outline: 'none', boxSizing: 'border-box' }

const statusTone = (s: string): 'green' | 'amber' | 'neutral' => s === 'approved' ? 'green' : ['pending', 'appealed'].includes(s) ? 'amber' : 'neutral'

export const ProposalsPage = ({ topics, templates, proposals, signedIn }: { topics: Topic[]; templates: Template[]; proposals: Proposal[]; signedIn: boolean }) => {
  const [question, setQuestion] = useState('Will the European Commission publish a final AI liability proposal before 30 June 2026?')
  const [topicId, setTopicId] = useState(topics[0]?.id ?? '')
  const [region, setRegion] = useState('European Union')
  const [options, setOptions] = useState(['Yes', 'No'])
  const [sourceOfTruth, setSourceOfTruth] = useState('European Commission official press release or EUR-Lex publication')
  const [resolutionCriteria, setResolutionCriteria] = useState('Resolves YES if the European Commission officially publishes the final named proposal on or before 23:59 UTC, 30 Jun 2026. Draft leaks and media reports do not count.')
  const [cutoffAt, setCutoffAt] = useState('2026-06-15 23:00')
  const [resolvesAt, setResolvesAt] = useState('2026-06-30 23:59')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState(proposals)
  const [actioningProposal, setActioningProposal] = useState<string | null>(null)

  const applyTemplate = (slug: string) => {
    const t = templates.find((tpl) => tpl.slug === slug)
    if (!t) return
    setRegion(t.region)
    setSourceOfTruth(t.source_of_truth)
    setResolutionCriteria(t.resolution_criteria_template)
    const topic = topics.find((x) => x.slug === t.topic_slug)
    if (topic) setTopicId(topic.id)
  }

  const submit = async () => {
    setSubmitting(true); setNotice(null); setError(null)
    try {
      const res = await fetch('/api/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, topicId, region, options, sourceOfTruth, resolutionCriteria, cutoffAt, resolvesAt }) })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error ?? 'Failed to submit proposal'); return }
      setNotice(`Proposal submitted · ${data.proposal.id}`)
      setItems([{ id: data.proposal.id, question, region, status: 'pending', created_at: new Date().toISOString(), topics: { label: topics.find((t) => t.id === topicId)?.label ?? 'Topic' }, profiles: { handle: 'you' } }, ...items])
    } catch { setError('Network error — please try again') }
    finally { setSubmitting(false) }
  }


  const loadProposalForRevision = (p: Proposal) => {
    setQuestion(p.question)
    setRegion(p.region)
    setOptions(Array.isArray(p.options) ? p.options.map(String) : ['Yes', 'No'])
    setSourceOfTruth(p.source_of_truth ?? sourceOfTruth)
    setResolutionCriteria(p.resolution_criteria ?? resolutionCriteria)
    setCutoffAt((p.cutoff_at ?? cutoffAt).replace('T', ' ').slice(0, 16))
    setResolvesAt((p.resolves_at ?? resolvesAt).replace('T', ' ').slice(0, 16))
    setNotice(`Loaded proposal ${p.id} into the form. Edit it, then submit as a fresh proposal.`)
  }

  const appealProposal = async (proposalId: string) => {
    const appealReason = window.prompt('Why should this rejection be reconsidered?')
    if (!appealReason) return
    setActioningProposal(proposalId); setNotice(null); setError(null)
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'appeal', appealReason }) })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error ?? 'Failed to appeal proposal'); return }
      setItems((prev) => prev.map((p) => p.id === proposalId ? { ...p, status: 'appealed', appeal_reason: appealReason, appealed_at: new Date().toISOString() } : p))
      setNotice(`Appeal submitted · ${proposalId}`)
    } catch { setError('Network error — please try again') }
    finally { setActioningProposal(null) }
  }

  return (
    <div style={{ background: 'var(--color-parchment-bg)', color: 'var(--color-parchment-ink)', minHeight: '100%' }}>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '52px 40px 96px' }}>
        <section style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48, alignItems: 'end', borderBottom: '1px solid var(--color-parchment-line)', paddingBottom: 30 }}>
          <div><Eyebrow>Community authoring</Eyebrow><h1 style={{ margin: '12px 0 0', fontSize: 46, lineHeight: 1.08, fontWeight: 500, letterSpacing: '-0.025em' }}>Propose civic questions without hiding curation.</h1></div>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: 'var(--color-parchment-ink-soft)' }}>Verified users can propose resolvable polls. Admins and panels moderate proposals into draft polls, request changes, or reject with public notes.</p>
        </section>

        {(notice || error) && <div style={{ marginTop: 16, padding: '12px 16px', border: `1px solid ${error ? 'var(--color-parchment-amber)' : 'var(--color-parchment-green)'}`, color: error ? 'var(--color-parchment-amber)' : 'var(--color-parchment-green)', background: 'var(--color-parchment-surface)', borderRadius: 3, fontSize: 13 }}>{error ?? notice}</div>}

        <div className="cs-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 28, marginTop: 30 }}>
          <section style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><Eyebrow>Submit proposal</Eyebrow>{!signedIn && <Link href="/auth/signin" style={{ fontSize: 12, color: 'var(--color-parchment-accent)' }}>Sign in to submit</Link>}</div>
            <label style={{ display: 'block', marginTop: 16, fontSize: 12, color: 'var(--color-parchment-muted)' }}>Question</label>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} style={{ ...inputStyle, height: 'auto', minHeight: 80, padding: '10px 12px', lineHeight: 1.45, resize: 'vertical' }} />
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
              <div><label style={{ fontSize: 12, color: 'var(--color-parchment-muted)' }}>Topic</label><select value={topicId} onChange={(e) => setTopicId(e.target.value)} style={inputStyle}>{topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
              <div><label style={{ fontSize: 12, color: 'var(--color-parchment-muted)' }}>Template</label><select defaultValue="" onChange={(e) => applyTemplate(e.target.value)} style={inputStyle}><option value="">Choose template…</option>{templates.map((t) => <option key={t.id} value={t.slug}>{t.label}</option>)}</select></div>
            </div>
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
              <div><label style={{ fontSize: 12, color: 'var(--color-parchment-muted)' }}>Region</label><input value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle} /></div>
              <div><label style={{ fontSize: 12, color: 'var(--color-parchment-muted)' }}>Options</label><input value={options.join(', ')} onChange={(e) => setOptions(e.target.value.split(',').map((x) => x.trim()))} style={inputStyle} /></div>
            </div>
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
              <div><label style={{ fontSize: 12, color: 'var(--color-parchment-muted)' }}>Cutoff UTC</label><input value={cutoffAt} onChange={(e) => setCutoffAt(e.target.value)} style={inputStyle} /></div>
              <div><label style={{ fontSize: 12, color: 'var(--color-parchment-muted)' }}>Resolution UTC</label><input value={resolvesAt} onChange={(e) => setResolvesAt(e.target.value)} style={inputStyle} /></div>
            </div>
            <label style={{ display: 'block', marginTop: 14, fontSize: 12, color: 'var(--color-parchment-muted)' }}>Source-of-truth</label><input value={sourceOfTruth} onChange={(e) => setSourceOfTruth(e.target.value)} style={inputStyle} />
            <label style={{ display: 'block', marginTop: 14, fontSize: 12, color: 'var(--color-parchment-muted)' }}>Resolution criteria</label><textarea value={resolutionCriteria} onChange={(e) => setResolutionCriteria(e.target.value)} style={{ ...inputStyle, height: 'auto', minHeight: 84, padding: '10px 12px', lineHeight: 1.45, resize: 'vertical' }} />
            <div style={{ marginTop: 18 }}><Btn kind="primary" size="md" onClick={submit} disabled={!signedIn || submitting}>{submitting ? 'Submitting…' : 'Submit proposal'}</Btn></div>
          </section>

          <section style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)', display: 'flex', justifyContent: 'space-between' }}><Eyebrow>Public proposal log</Eyebrow><span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)' }}>{items.length} proposals</span></div>
            {items.length === 0 ? <p style={{ margin: 0, padding: 20, fontSize: 13, color: 'var(--color-parchment-muted)' }}>No proposals yet.</p> : items.map((p) => (
              <div key={p.id} style={{ padding: '15px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div style={{ fontSize: 13.5, lineHeight: 1.4 }}>{p.question}</div><Badge tone={statusTone(p.status)} mono>{p.status.replace('_', ' ')}</Badge></div>
                <div className="font-mono" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--color-parchment-muted)' }}>{p.topics?.label ?? 'Topic'} · {p.region} · by {p.profiles?.handle ?? 'verified user'}</div>
                {p.revision_count ? <div className="font-mono" style={{ marginTop: 5, fontSize: 10.5, color: 'var(--color-parchment-muted)' }}>revision {p.revision_count}</div> : null}
                {p.moderator_notes && <p style={{ margin: '7px 0 0', fontSize: 12, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.45 }}>Moderator note: {p.moderator_notes}</p>}
                {p.appeal_reason && <p style={{ margin: '7px 0 0', fontSize: 12, color: 'var(--color-parchment-amber)', lineHeight: 1.45 }}>Appeal: {p.appeal_reason}</p>}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: p.poll_id || ['changes_requested', 'rejected'].includes(p.status) ? 7 : 0 }}>
                  {p.poll_id && <Link href={`/polls/${p.poll_id}`} style={{ fontSize: 12, color: 'var(--color-parchment-accent)' }}>View draft/poll →</Link>}
                  {signedIn && ['changes_requested', 'rejected'].includes(p.status) && <button onClick={() => loadProposalForRevision(p)} style={{ padding: 0, fontSize: 12, fontFamily: 'inherit', color: 'var(--color-parchment-accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Revise as new proposal</button>}
                  {signedIn && p.status === 'rejected' && <button onClick={() => appealProposal(p.id)} disabled={actioningProposal === p.id} style={{ padding: 0, fontSize: 12, fontFamily: 'inherit', color: 'var(--color-parchment-amber)', background: 'transparent', border: 'none', cursor: 'pointer', opacity: actioningProposal === p.id ? 0.5 : 1 }}>Appeal rejection</button>}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
