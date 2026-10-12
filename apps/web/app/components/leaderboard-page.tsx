'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eyebrow } from '@civicsignal/ui'
import { tierLabel } from '@/lib/reputation'

type Topic = {
  id: string
  slug: string
  label: string
}

// Public: the tier only (P10). Exact scores and accuracy would reveal individual answers.
type LeaderboardRow = {
  user_id: string
  tier: string
  profiles: { handle: string; verified: boolean } | null
  topics: { slug: string; label: string } | null
}

export const LeaderboardPage = ({
  topics,
  selectedSlug,
  leaderboard,
}: {
  topics: Topic[]
  selectedSlug: string
  leaderboard: LeaderboardRow[]
}) => {
  const router = useRouter()
  const [activeTopic, setActiveTopic] = useState(selectedSlug)

  const selectedTopic = topics.find((t) => t.slug === activeTopic)

  const handleTopicChange = (slug: string) => {
    setActiveTopic(slug)
    router.push(`/leaderboard?topic=${slug}`)
  }

  return (
    <div style={{ background: 'var(--color-parchment-bg)', color: 'var(--color-parchment-ink)', minHeight: '100%' }}>
      <main style={{ padding: '40px 40px 80px', maxWidth: 1280, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 8 }}>
          <Eyebrow>Topic reputation</Eyebrow>
          <h1 style={{
            margin: '8px 0 0', fontSize: 36, fontWeight: 500,
            letterSpacing: '-0.02em', color: 'var(--color-parchment-ink)',
          }}>
            {selectedTopic ? `${selectedTopic.label} leaders` : 'Topic leaderboard'}
          </h1>
        </div>

        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--color-parchment-ink-soft)', maxWidth: 600 }}>
          Topic reputation reflects sustained accuracy — not activity volume. People are grouped by tier, then listed by handle; exact scores stay private so no one can work out how anyone voted.
        </p>

        {/* Topic pills */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '14px 0',
          borderBottom: '1px solid var(--color-parchment-line)',
          marginTop: 20, marginBottom: 28,
          flexWrap: 'wrap',
        }}>
          <Eyebrow>Topic</Eyebrow>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {topics.map((t) => {
              const active = t.slug === activeTopic
              return (
                <button
                  key={t.slug}
                  onClick={() => handleTopicChange(t.slug)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12.5,
                    color: active ? 'var(--color-parchment-bg)' : 'var(--color-parchment-ink-soft)',
                    background: active ? 'var(--color-parchment-ink)' : 'transparent',
                    border: `1px solid ${active ? 'var(--color-parchment-ink)' : 'var(--color-parchment-line)'}`,
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Leaderboard table */}
        {leaderboard.length === 0 ? (
          <div style={{
            padding: '48px 28px',
            background: 'var(--color-parchment-surface)',
            border: '1px solid var(--color-parchment-line)',
            borderRadius: 4,
            textAlign: 'center',
            fontSize: 14,
            color: 'var(--color-parchment-muted)',
          }}>
            No resolved polls in this topic yet.
          </div>
        ) : (
          <div className="cs-table-scroll" style={{
            background: 'var(--color-parchment-surface)',
            border: '1px solid var(--color-parchment-line)',
            borderRadius: 4,
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px',
              gap: 0,
              padding: '12px 22px',
              borderBottom: '1px solid var(--color-parchment-line)',
            }}>
              {['Handle', 'Tier'].map((col, i) => (
                <span
                  key={col}
                  className="font-mono"
                  style={{
                    fontSize: 10.5,
                    color: 'var(--color-parchment-muted)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    textAlign: i > 0 ? 'right' : 'left',
                  }}
                >
                  {col}
                </span>
              ))}
            </div>

            {/* Rows */}
            {leaderboard.map((row, idx) => {
              const rank = tierLabel(row.tier)
              const handle = row.profiles?.handle ?? row.user_id
              const high = row.tier === 'steward' || row.tier === 'trusted'

              return (
                <div
                  key={row.user_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 160px',
                    gap: 0,
                    alignItems: 'center',
                    padding: '16px 22px',
                    borderTop: idx > 0 ? '1px solid var(--color-parchment-line-soft, var(--color-parchment-line))' : 'none',
                  }}
                >
                  <Link
                    href={`/u/${handle}`}
                    className="font-mono"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--color-parchment-ink)',
                      textDecoration: 'none',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {handle}
                  </Link>
                  <span style={{ textAlign: 'right' }}>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: '0.06em',
                        padding: '2px 7px',
                        borderRadius: 999,
                        color: high ? 'var(--color-parchment-green)' : 'var(--color-parchment-ink-soft)',
                        border: `1px solid ${high ? 'var(--color-parchment-green)' : 'var(--color-parchment-line)'}`,
                      }}
                    >
                      {rank.toUpperCase()}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer note */}
        <p style={{ marginTop: 28, fontSize: 12.5, color: 'var(--color-parchment-muted)', fontStyle: 'italic', maxWidth: 600 }}>
          Tiers are topic-specific. A person who has answered 5 resolved climate polls correctly is a Contributor in climate, whatever they did in politics. There is no global rank.
        </p>
      </main>
    </div>
  )
}
