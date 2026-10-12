import Link from 'next/link'
import { Eyebrow, VerifiedBadge, Badge } from '@civicsignal/ui'

type Profile = {
  id: string
  handle: string
  verified: boolean
  verified_at?: string | null
  created_at: string
}

type ReputationRow = {
  user_id: string
  topic_id: string
  score: number
  resolved_count: number
  correct_count: number
  topics?: { slug: string; label: string } | null
}

type ContributionRow = {
  delta: number
  polls?: { question: string } | null
  topics?: { label: string } | null
}

type PendingVoteRow = {
  id: string
  poll_id: string
  /** null while sealed; whether the vote matched once the poll resolved. */
  matched: boolean | null
  receipt_hash: string
  created_at: string
  polls?: {
    question: string
    status: string
    resolves_at: string
    cutoff_at: string
    topics?: { label: string } | null
  } | null
}

const getRank = (score: number) => {
  if (score >= 1500) return 'Steward'
  if (score >= 500) return 'Contributor'
  return 'Observer'
}

const getJoinedLabel = (createdAt: string) => {
  const d = new Date(createdAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const getAvatarInitials = (handle: string) => handle.slice(0, 2).toLowerCase()

const formatDelta = (delta: number) => {
  if (delta === 0) return '—'
  return delta > 0 ? `+${delta}` : `${delta}`
}

export const ReputationPage = ({
  profile,
  reputation,
  contributions,
  pendingVotes,
}: {
  profile: Profile
  reputation: ReputationRow[]
  contributions: ContributionRow[]
  pendingVotes: PendingVoteRow[]
}) => {
  const totalResolved = reputation.reduce((sum, r) => sum + (r.resolved_count ?? 0), 0)
  const totalCorrect = reputation.reduce((sum, r) => sum + (r.correct_count ?? 0), 0)
  const accuracy = totalResolved > 0 ? totalCorrect / totalResolved : 0
  const maxScore = reputation.length > 0 ? Math.max(...reputation.map((r) => r.score)) : 1

  return (
    <div className="bg-parchment-bg min-h-screen">
      <main style={{ padding: '40px 40px 80px', maxWidth: 1180, margin: '0 auto' }}>

        {/* Header card */}
        <div className="cs-detail-grid" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32,
          padding: '32px 36px',
          background: 'var(--color-parchment-surface)',
          border: '1px solid var(--color-parchment-line)',
          borderRadius: 4,
        }}>
          {/* Left: identity */}
          <div>
            <Eyebrow>Pseudonymous handle</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
              {/* Square avatar */}
              <div style={{
                width: 56, height: 56, borderRadius: 4,
                background: 'var(--color-parchment-bg)',
                border: '1px solid var(--color-parchment-line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 600,
                color: 'var(--color-parchment-ink)',
                fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
              }}>
                {getAvatarInitials(profile.handle)}
              </div>
              <div>
                <h1 className="font-mono" style={{
                  margin: 0, fontSize: 26,
                  color: 'var(--color-parchment-ink)',
                  letterSpacing: '-0.005em',
                  fontWeight: 500,
                }}>
                  {profile.handle}
                </h1>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 14 }}>
                  {profile.verified && <VerifiedBadge />}
                  <span className="font-mono" style={{
                    fontSize: 11,
                    color: 'var(--color-parchment-muted)',
                    letterSpacing: '0.04em',
                  }}>
                    JOINED {getJoinedLabel(profile.created_at).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            <p style={{
              margin: '18px 0 0', fontSize: 13,
              color: 'var(--color-parchment-muted)',
              lineHeight: 1.55, maxWidth: 380,
            }}>
              This handle is the only public part of you. Real identity stays inside the verifier and is never linked to your votes.
            </p>
          </div>

          {/* Right: stats */}
          <div className="cs-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, alignSelf: 'center' }}>
            {[
              { k: 'Polls resolved', v: totalResolved },
              { k: 'Accuracy',       v: totalResolved > 0 ? `${Math.round(accuracy * 100)}%` : '—' },
              { k: 'Topics',         v: reputation.length },
            ].map((s, i) => (
              <div key={s.k} style={{
                padding: '0 24px',
                borderLeft: i > 0 ? '1px solid var(--color-parchment-line-soft)' : 'none',
              }}>
                <div className="font-mono" style={{
                  fontSize: 32,
                  color: 'var(--color-parchment-ink)',
                  letterSpacing: '-0.01em',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.v}
                </div>
                <Eyebrow>{s.k}</Eyebrow>
              </div>
            ))}
          </div>
        </div>

        {/* Italic note */}
        <p style={{
          marginTop: 18, fontSize: 13,
          color: 'var(--color-parchment-muted)',
          fontStyle: 'italic', maxWidth: 700,
        }}>
          Reputation here is a record of contribution to public intelligence — not a wallet, token, or financial asset. It cannot be traded or transferred.
        </p>

        {/* Topic reputation */}
        <section style={{ marginTop: 32 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 18,
          }}>
            <Eyebrow>Topic reputation</Eyebrow>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)' }}>
              {reputation.length} topics
            </span>
          </div>

          {reputation.length === 0 ? (
            <div style={{
              padding: '32px 24px',
              background: 'var(--color-parchment-surface)',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
              fontSize: 14,
              color: 'var(--color-parchment-muted)',
              textAlign: 'center',
            }}>
              No polls resolved yet.
            </div>
          ) : (
            <div className="cs-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {reputation.map((t) => {
                const rank = getRank(t.score)
                const topicAccuracy = t.resolved_count > 0 ? t.correct_count / t.resolved_count : 0
                return (
                  <div key={t.topic_id} style={{
                    background: 'var(--color-parchment-surface)',
                    border: '1px solid var(--color-parchment-line)',
                    borderRadius: 4, padding: '20px 22px',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}>
                    {/* Row 1: topic name + rank badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <h3 style={{
                        margin: 0, fontSize: 17, fontWeight: 500,
                        color: 'var(--color-parchment-ink)',
                        letterSpacing: '-0.01em',
                      }}>
                        {t.topics?.label ?? t.topic_id}
                      </h3>
                      <Badge
                        tone={rank === 'Steward' ? 'green' : rank === 'Contributor' ? 'accent' : 'neutral'}
                        mono
                      >
                        {rank}
                      </Badge>
                    </div>

                    {/* Row 2: score + POINTS label */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="font-mono" style={{
                        fontSize: 30,
                        color: 'var(--color-parchment-ink)',
                        letterSpacing: '-0.01em',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {t.score.toLocaleString()}
                      </span>
                      <span className="font-mono" style={{
                        fontSize: 11,
                        color: 'var(--color-parchment-muted)',
                        letterSpacing: '0.04em',
                      }}>
                        POINTS
                      </span>
                    </div>

                    {/* Row 3: progress bar */}
                    <div style={{
                      height: 3,
                      background: 'var(--color-parchment-surface-alt)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${(t.score / maxScore) * 100}%`,
                        height: '100%',
                        background: 'var(--color-parchment-ink)',
                      }} />
                    </div>

                    {/* Row 4: resolved + accuracy */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 12,
                      color: 'var(--color-parchment-ink-soft)',
                    }}>
                      <span>
                        <span style={{ color: 'var(--color-parchment-ink)', fontVariantNumeric: 'tabular-nums' }}>
                          {t.resolved_count}
                        </span>{' '}resolved
                      </span>
                      <span>
                        <span style={{ color: 'var(--color-parchment-ink)', fontVariantNumeric: 'tabular-nums' }}>
                          {t.resolved_count > 0 ? `${Math.round(topicAccuracy * 100)}%` : '—'}
                        </span>{' '}accuracy
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Pending sealed votes */}
        <section style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Eyebrow>Pending sealed votes</Eyebrow>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)' }}>
              {pendingVotes.length} active / awaiting resolution
            </span>
          </div>

          {pendingVotes.length === 0 ? (
            <div style={{
              marginTop: 16, padding: '28px 24px',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
              background: 'var(--color-parchment-surface)',
              fontSize: 14,
              color: 'var(--color-parchment-muted)',
              textAlign: 'center',
            }}>
              No sealed votes yet. Vote on an active poll and it will appear here immediately; reputation points arrive after resolution.
            </div>
          ) : (
            <div style={{
              marginTop: 16,
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
              background: 'var(--color-parchment-surface)',
            }}>
              {pendingVotes.map((row, i) => (
                <div key={row.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto',
                  gap: 24, alignItems: 'center',
                  padding: '16px 22px',
                  borderTop: i > 0 ? '1px solid var(--color-parchment-line-soft)' : 'none',
                }}>
                  <Link href={`/polls/${row.poll_id}`} style={{ fontSize: 14, color: 'var(--color-parchment-ink)', textDecoration: 'none', lineHeight: 1.45 }}>
                    {row.polls?.question ?? row.poll_id}
                  </Link>
                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-parchment-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {row.polls?.topics?.label ?? '—'} · {row.polls?.status ?? 'sealed'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-parchment-ink-soft)', minWidth: 80, textAlign: 'right' }}>
                    Your vote: <strong style={{ color: 'var(--color-parchment-ink)' }}>{row.matched == null ? 'sealed' : row.matched ? 'matched' : 'not matched'}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent resolved contributions */}
        <section style={{ marginTop: 40 }}>
          <Eyebrow>Recent resolved contributions</Eyebrow>

          {contributions.length === 0 ? (
            <div style={{
              marginTop: 16, padding: '32px 24px',
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
              background: 'var(--color-parchment-surface)',
              fontSize: 14,
              color: 'var(--color-parchment-muted)',
              textAlign: 'center',
            }}>
              No polls resolved yet.
            </div>
          ) : (
            <div style={{
              marginTop: 16,
              border: '1px solid var(--color-parchment-line)',
              borderRadius: 4,
              background: 'var(--color-parchment-surface)',
            }}>
              {contributions.map((row, i) => {
                const deltaStr = formatDelta(row.delta)
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto',
                    gap: 24, alignItems: 'center',
                    padding: '16px 22px',
                    borderTop: i > 0 ? '1px solid var(--color-parchment-line-soft)' : 'none',
                  }}>
                    <span style={{
                      fontSize: 14,
                      color: 'var(--color-parchment-ink)',
                      letterSpacing: '-0.005em',
                    }}>
                      {row.polls?.question ?? '—'}
                    </span>
                    <span className="font-mono" style={{
                      fontSize: 11,
                      color: 'var(--color-parchment-muted)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      {row.topics?.label ?? '—'}
                    </span>
                    <span className="font-mono" style={{
                      fontSize: 13,
                      color: deltaStr === '—'
                        ? 'var(--color-parchment-muted)'
                        : 'var(--color-parchment-green)',
                      minWidth: 28,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {deltaStr}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Privacy note */}
        <section style={{
          marginTop: 40, padding: '24px 28px',
          border: '1px dashed var(--color-parchment-line)',
          borderRadius: 4,
          background: 'var(--color-parchment-bg)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28,
        }}>
          <div>
            <Eyebrow>Privacy</Eyebrow>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.55 }}>
              We do not show real names, locations, IP addresses, or device fingerprints. Verifying you are exactly one human and showing your contribution history are the only two things this profile does.
            </p>
          </div>
          <div>
            <Eyebrow>Public framing</Eyebrow>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.55 }}>
              Reputation reads as <em>contribution to public intelligence</em>, not <em>profit and loss</em>. Leaderboards compare topic accuracy; they do not create financial value, transferable status, or a portfolio.
            </p>
          </div>
        </section>

      </main>
    </div>
  )
}
