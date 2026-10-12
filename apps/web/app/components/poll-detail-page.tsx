'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eyebrow, TopicBadge, HiddenBadge, Badge, Btn, topicById } from '@civicsignal/ui'
import type { Poll } from '@civicsignal/ui'

interface Props {
  poll: Poll
  /** The viewer's own vote: its receipt, and once the poll resolves whether it matched. Never the answer. */
  existingVote: { receipt_hash: string; created_at: string; matched: boolean | null } | null
  publicKey: string | null
}

export const PollDetailPage = ({ poll, existingVote, publicKey }: Props) => {
  // Only what this browser chose just now; a vote loaded from the server stays sealed.
  const [choice, setChoice] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(!!existingVote)
  const [receipt, setReceipt] = useState<{ hash: string; shortHash: string; timestamp: string } | null>(
    existingVote
      ? { hash: existingVote.receipt_hash, shortHash: existingVote.receipt_hash.slice(0, 10) + '…', timestamp: existingVote.created_at }
      : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!choice || submitted) return
    setLoading(true)
    setError(null)
    try {
      // The server seals the answer to the poll's public key and stores only the ciphertext.
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: choice }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        return
      }
      setReceipt(json.data.receipt)
      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const receiptTs = receipt?.timestamp
    ? new Date(receipt.timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : null
  const isOpen = poll.status === 'active'
  const canSubmit = isOpen && !!choice && !submitted && !loading
  const openedLabel = poll.createdAt
    ? new Date(poll.createdAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : null
  const cutoffLabel = new Date(poll.cutoff).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const resolutionDateLabel = poll.resolves
  const publicKeyLabel = publicKey ? `${publicKey.slice(0, 10)}…${publicKey.slice(-8)}` : 'Pending publication'

  return (
    <div style={{ background: 'var(--color-parchment-bg)', color: 'var(--color-parchment-ink)', minHeight: '100%' }}>
      <main style={{ padding: '32px 40px 80px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Back link */}
        <Link
          href="/polls"
          className="font-mono"
          style={{ fontSize: 11.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.04em', textDecoration: 'none', cursor: 'pointer' }}
        >
          ← BACK TO ACTIVE POLLS
        </Link>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, flexWrap: 'wrap' }}>
          <TopicBadge topicId={poll.topic} />
          <span style={{ width: 1, height: 12, background: 'var(--color-parchment-line)' }} />
          <span
            className="font-mono"
            style={{ fontSize: 10.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}
          >
            {poll.region}
          </span>
          <span style={{ width: 1, height: 12, background: 'var(--color-parchment-line)' }} />
          <Badge tone="accent" mono>Poll · {poll.id}</Badge>
        </div>

        {/* Question */}
        <h1 style={{ margin: '20px 0 0', fontSize: 40, fontWeight: 500, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'var(--color-parchment-ink)', textWrap: 'balance' as React.CSSProperties['textWrap'], maxWidth: 880 }}>
          {poll.q}
        </h1>

        <div className="cs-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 24 }}>
          {[
            { label: 'Status', value: poll.status.toUpperCase() },
            { label: 'Cutoff', value: poll.cutoffLabel },
            { label: 'Resolves', value: resolutionDateLabel },
            { label: 'Verified answers', value: poll.participants.toLocaleString() },
          ].map((item) => (
            <div key={item.label} style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line-soft)', borderRadius: 4, padding: '14px 16px' }}>
              <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.label}</div>
              <div className="font-mono" style={{ marginTop: 6, fontSize: 17, color: 'var(--color-parchment-ink)', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
            </div>
          ))}
        </div>

        <section
          className="cs-detail-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: 16,
            marginTop: 28,
          }}
        >
          <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '20px 22px' }}>
            <Eyebrow>Resolution criteria</Eyebrow>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--color-parchment-ink)', lineHeight: 1.58 }}>
              {poll.resolutionCriteria?.trim() || 'No additional resolution criteria were supplied. The resolver is bound to the named source-of-truth and the published options.'}
            </p>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-parchment-line-soft)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Bound source</div>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.45 }}>{poll.source}</p>
              </div>
              <div>
                <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Resolution rule</div>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.45 }}>Outcome is assigned to exactly one published option, then reputation is updated.</p>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '20px 22px' }}>
            <Eyebrow>Poll status</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 18px', marginTop: 12, fontSize: 12.5, color: 'var(--color-parchment-ink-soft)' }}>
              <span>Voting status</span>
              <span className="font-mono" style={{ color: 'var(--color-parchment-ink)', textTransform: 'uppercase' }}>{poll.status}</span>
              <span>Resolution date</span>
              <span className="font-mono" style={{ color: 'var(--color-parchment-ink)' }}>{resolutionDateLabel}</span>
              <span>Current answers</span>
              <span className="font-mono" style={{ color: 'var(--color-parchment-ink)', fontVariantNumeric: 'tabular-nums' }}>{poll.participants.toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* Two-column grid */}
        <div className="cs-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, marginTop: 40 }}>
          {/* Left col — answer */}
          <div>
            <Eyebrow>{submitted ? 'Your answer is sealed' : 'Choose your answer'}</Eyebrow>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {poll.options.map((opt) => {
                const sel = choice === opt
                return (
                  <button
                    key={opt}
                    onClick={() => { if (isOpen && !submitted) setChoice(opt) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '20px 22px',
                      fontSize: 17,
                      fontWeight: 500,
                      color: sel ? 'var(--color-parchment-bg)' : 'var(--color-parchment-ink)',
                      background: sel ? 'var(--color-parchment-ink)' : 'var(--color-parchment-surface)',
                      border: `1px solid ${sel ? 'var(--color-parchment-ink)' : 'var(--color-parchment-line)'}`,
                      borderRadius: 4,
                      textAlign: 'left',
                      cursor: submitted || !isOpen ? 'default' : 'pointer',
                      letterSpacing: '-0.01em',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span>{opt}</span>
                    <span style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `1.5px solid ${sel ? 'var(--color-parchment-bg)' : 'var(--color-parchment-line)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {sel && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-parchment-bg)' }} />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {!isOpen && !submitted ? (
              <div style={{ marginTop: 24, padding: '18px 22px', background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-amber)', borderRadius: 4 }}>
                <Eyebrow>{poll.status === 'closed' ? 'Voting closed' : 'Poll resolved'}</Eyebrow>
                <p style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.55 }}>
                  This poll is no longer accepting sealed votes. {poll.status === 'resolved' ? 'Open the resolution record to review the outcome and evidence.' : 'The resolver is waiting for the named source-of-truth before publishing the outcome.'}
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <Btn kind="ghost" size="sm"><Link href="/polls" style={{ textDecoration: 'none', color: 'inherit' }}>Back to feed</Link></Btn>
                  {poll.status === 'resolved' && <Btn kind="quiet" size="sm"><Link href={`/polls/${poll.id}/resolved`} style={{ textDecoration: 'none', color: 'inherit' }}>View resolution →</Link></Btn>}
                </div>
              </div>
            ) : submitted ? (
              /* Receipt panel */
              <div style={{ marginTop: 24, padding: '18px 22px', background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-green)', borderRadius: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-parchment-green)', flexShrink: 0 }} />
                  <Eyebrow>Receipt · sealed</Eyebrow>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.55 }}>
                  {choice ? (
                    <>
                      Your sealed answer is{' '}
                      <span style={{ color: 'var(--color-parchment-ink)', fontWeight: 600 }}>{choice}</span>.
                      {' '}
                    </>
                  ) : existingVote?.matched != null ? (
                    <>
                      Your answer{' '}
                      <span style={{ color: 'var(--color-parchment-ink)', fontWeight: 600 }}>{existingVote.matched ? 'matched' : 'did not match'}</span>
                      {' '}the outcome.{' '}
                    </>
                  ) : (
                    <>Your answer stays sealed until resolution. </>
                  )}
                  Your encrypted answer was committed to the public log
                  {receiptTs && (
                    <>
                      {' '}at{' '}
                      <span className="font-mono" style={{ color: 'var(--color-parchment-ink)' }}>{receiptTs}</span>
                    </>
                  )}
                  .
                  {receipt?.shortHash && (
                    <>
                      {' '}Receipt{' '}
                      <span className="font-mono" style={{ color: 'var(--color-parchment-ink)' }}>{receipt.shortHash}</span>.
                    </>
                  )}
                  {' '}You will see the resolution and your reputation update on{' '}
                  <span style={{ color: 'var(--color-parchment-ink)' }}>{poll.resolves}</span>.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <Btn kind="ghost" size="sm">
                    <Link href="/polls" style={{ textDecoration: 'none', color: 'inherit' }}>Back to feed</Link>
                  </Btn>
                  <Btn kind="quiet" size="sm">
                    <Link href={receipt?.hash ? `/verify?receipt=${encodeURIComponent(receipt.hash)}` : '/verify'} style={{ textDecoration: 'none', color: 'inherit' }}>
                      Verify receipt →
                    </Link>
                  </Btn>
                </div>
              </div>
            ) : (
              /* Submit row */
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Btn
                    kind="primary"
                    size="lg"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                  >
                    {loading ? 'Sealing…' : 'Seal my answer'}
                  </Btn>
                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)', letterSpacing: '0.04em' }}>
                    Encrypted client-side · revealed only after cutoff
                  </span>
                </div>
                {error && (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-parchment-crimson)' }}>
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right col — meta cards */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Cutoff card */}
            <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '20px 22px' }}>
              <Eyebrow>Cutoff</Eyebrow>
              <div
                className="font-mono"
                style={{ marginTop: 8, fontSize: 28, color: 'var(--color-parchment-ink)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}
              >
                {poll.cutoffLabel}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-parchment-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(poll.cutoff).toUTCString().replace('GMT', 'UTC')}
              </p>
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-parchment-line-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-parchment-ink-soft)' }}>
                  <span>Resolves</span>
                  <span>{poll.resolves}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontSize: 12.5, color: 'var(--color-parchment-ink-soft)' }}>
                  <span>Verified humans answering</span>
                  <span
                    className="font-mono"
                    style={{ color: 'var(--color-parchment-ink)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {poll.participants.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Source-of-truth card */}
            <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '20px 22px' }}>
              <Eyebrow>Source-of-truth</Eyebrow>
              <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--color-parchment-ink)', lineHeight: 1.5 }}>
                {poll.source}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-parchment-muted)' }}>
                Named before this poll opened. The resolver is bound to this source.
              </p>
            </div>

            {/* Timeline card */}
            <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '20px 22px' }}>
              <Eyebrow>Timeline</Eyebrow>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {openedLabel && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: 12.5 }}>
                    <span style={{ color: 'var(--color-parchment-ink-soft)' }}>Opened</span>
                    <span className="font-mono" style={{ color: 'var(--color-parchment-muted)', textAlign: 'right' }}>{openedLabel}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--color-parchment-ink-soft)' }}>Cutoff</span>
                  <span className="font-mono" style={{ color: 'var(--color-parchment-muted)', textAlign: 'right' }}>{cutoffLabel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--color-parchment-ink-soft)' }}>Resolves</span>
                  <span className="font-mono" style={{ color: 'var(--color-parchment-muted)', textAlign: 'right' }}>{resolutionDateLabel}</span>
                </div>
              </div>
            </div>

            {/* Mechanics card */}
            <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '20px 22px' }}>
              <Eyebrow>Voting mechanics</Eyebrow>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--color-parchment-muted)', lineHeight: 1.55 }}>
                <li>One sealed answer per verified human.</li>
                <li>Totals stay hidden until the cutoff passes.</li>
                <li>Reputation is awarded only after the named source resolves the poll.</li>
              </ul>
            </div>

            {/* Reputation impact card */}
            <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '20px 22px' }}>
              <Eyebrow>Reputation impact</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span className="font-mono" style={{ fontSize: 22, color: 'var(--color-parchment-green)', fontVariantNumeric: 'tabular-nums' }}>+1</span>
                <span style={{ fontSize: 13, color: 'var(--color-parchment-ink-soft)' }}>
                  {topicById(poll.topic)?.label ?? poll.topic} · if correct
                </span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-parchment-muted)', lineHeight: 1.5 }}>
                You only gain reputation when this resolves and your answer matches the named source. There is no penalty for being wrong.
              </p>
            </div>

            {/* Hidden badge card */}
            <div style={{ padding: '14px 18px', border: '1px dashed var(--color-parchment-line)', borderRadius: 4, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <HiddenBadge />
            </div>
          </aside>
        </div>

        <section style={{ marginTop: 44 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20, marginBottom: 14 }}>
            <Eyebrow>Public record</Eyebrow>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)' }}>POLL · {poll.id}</span>
          </div>
          <div className="cs-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              ['01', 'Question published', 'The question, options, source, cutoff, and resolution criteria are visible before voting.'],
              ['02', 'Votes sealed', 'Verified humans submit one encrypted answer. Counts remain hidden until cutoff.'],
              ['03', 'Source resolves', 'The resolver checks the named source-of-truth against the locked criteria.'],
              ['04', 'Audit trail updates', 'Receipt lookup, resolution evidence, and topic reputation become publicly reviewable.'],
            ].map(([n, title, copy]) => (
              <div key={n} style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '18px 18px 20px' }}>
                <div className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-amber)', letterSpacing: '0.06em' }}>{n}</div>
                <h3 style={{ margin: '10px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--color-parchment-ink)', letterSpacing: '-0.01em' }}>{title}</h3>
                <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--color-parchment-muted)', lineHeight: 1.5 }}>{copy}</p>
              </div>
            ))}
          </div>
          <div className="cs-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '18px 20px' }}>
              <Eyebrow>Audit identity</Eyebrow>
              <div style={{ marginTop: 10, display: 'grid', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}><span style={{ color: 'var(--color-parchment-muted)' }}>Poll ID</span><span className="font-mono" style={{ color: 'var(--color-parchment-ink)', textAlign: 'right', wordBreak: 'break-all' }}>{poll.id}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}><span style={{ color: 'var(--color-parchment-muted)' }}>Vote public key</span><span className="font-mono" style={{ color: 'var(--color-parchment-ink)', textAlign: 'right' }}>{publicKeyLabel}</span></div>
              </div>
            </div>
            <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '18px 20px' }}>
              <Eyebrow>What happens next</Eyebrow>
              <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.55 }}>
                After cutoff, CivicSignal keeps the vote set sealed until resolution. When the named source answers the question, the outcome, resolver notes, and audit trail appear on the public resolution record.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
