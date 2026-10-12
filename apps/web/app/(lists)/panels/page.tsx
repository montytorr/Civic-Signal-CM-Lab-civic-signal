import type { Metadata } from 'next'
import Link from 'next/link'
import { Eyebrow, Badge, Btn } from '@civicsignal/ui'
import { getPanelTransparency } from '@/lib/queries'

export const metadata: Metadata = {
  title: 'Trusted panels | CivicSignal',
  description: 'Public transparency report for CivicSignal panel membership, dispute evidence, and review decisions.',
}

const formatTs = (iso?: string | null) => iso
  ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  : '—'

export default async function Page() {
  const { members, evidence, reviews } = await getPanelTransparency()

  return (
    <div style={{ background: 'var(--color-parchment-bg)', color: 'var(--color-parchment-ink)', minHeight: '100%' }}>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '56px 40px 96px' }}>
        <section style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48, alignItems: 'end', borderBottom: '1px solid var(--color-parchment-line)', paddingBottom: 32 }}>
          <div>
            <Eyebrow>Trusted panels · transparency</Eyebrow>
            <h1 style={{ margin: '12px 0 0', fontSize: 48, lineHeight: 1.08, fontWeight: 500, letterSpacing: '-0.025em', color: 'var(--color-parchment-ink)' }}>
              Evidence and review should leave fingerprints.
            </h1>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: 'var(--color-parchment-ink-soft)', maxWidth: 560 }}>
              Panel membership is reputation-gated by topic. When a resolution is disputed, evidence packets and panel reviews are published here so the review process is inspectable instead of hidden in an admin box.
            </p>
            <div style={{ marginTop: 16 }}>
              <Link href="/panels/me"><Btn kind="primary" size="md">Open panel workspace →</Btn></Link>
            </div>
          </div>
        </section>

        <section className="cs-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 28 }}>
          {[
            ['Panel members', members.length],
            ['Evidence packets', evidence.length],
            ['Panel reviews', reviews.length],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '18px 20px' }}>
              <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-parchment-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
              <div className="font-mono" style={{ marginTop: 8, fontSize: 28, color: 'var(--color-parchment-ink)', fontVariantNumeric: 'tabular-nums' }}>{String(value)}</div>
            </div>
          ))}
        </section>

        <section style={{ marginTop: 36, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="cs-detail-grid">
          <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)' }}><Eyebrow>Reputation-gated panelists</Eyebrow></div>
            {members.length === 0 ? (
              <p style={{ margin: 0, padding: 20, fontSize: 13, color: 'var(--color-parchment-muted)' }}>No panelists invited yet.</p>
            ) : members.map((m) => (
              <div key={m.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <Link href={`/u/${m.profiles?.handle ?? ''}`} style={{ color: 'var(--color-parchment-ink)', textDecoration: 'none', fontSize: 13.5 }}>{m.profiles?.handle ?? m.user_id}</Link>
                  <div style={{ marginTop: 3, fontSize: 12, color: 'var(--color-parchment-muted)' }}>{m.topics?.label ?? 'Topic'} · min rep {m.min_reputation_at_invite}</div>
                </div>
                <Badge tone={m.status === 'active' ? 'green' : 'amber'} mono>{m.status}</Badge>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)' }}><Eyebrow>Recent panel reviews</Eyebrow></div>
            {reviews.length === 0 ? (
              <p style={{ margin: 0, padding: 20, fontSize: 13, color: 'var(--color-parchment-muted)' }}>No panel reviews published yet.</p>
            ) : reviews.map((r) => (
              <div key={r.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Link href={`/polls/${r.disputes?.poll_id}/resolved`} style={{ color: 'var(--color-parchment-ink)', textDecoration: 'none', fontSize: 13 }}>{r.disputes?.polls?.question ?? 'Dispute review'}</Link>
                  <Badge tone={r.decision === 'uphold' ? 'green' : 'neutral'} mono>{r.decision}</Badge>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.45 }}>{r.rationale}</p>
                <div className="font-mono" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--color-parchment-muted)' }}>{r.profiles?.handle ?? 'reviewer'} · {formatTs(r.created_at)}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 24, background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)' }}><Eyebrow>Evidence packets</Eyebrow></div>
          {evidence.length === 0 ? (
            <p style={{ margin: 0, padding: 20, fontSize: 13, color: 'var(--color-parchment-muted)' }}>No dispute evidence has been submitted yet.</p>
          ) : evidence.map((e) => (
            <div key={e.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-parchment-line-soft)' }}>
              <Link href={`/polls/${e.disputes?.poll_id}/resolved`} style={{ color: 'var(--color-parchment-ink)', textDecoration: 'none', fontSize: 13.5 }}>{e.disputes?.polls?.question ?? 'Evidence packet'}</Link>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--color-parchment-ink-soft)', lineHeight: 1.45 }}>{e.summary}</p>
              <div className="font-mono" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--color-parchment-muted)' }}>
                {e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-parchment-accent)' }}>source</a> : 'no source url'} · {formatTs(e.created_at)}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
