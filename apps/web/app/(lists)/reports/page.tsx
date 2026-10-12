import type { Metadata } from 'next'
import Link from 'next/link'
import { Eyebrow, Badge, Btn } from '@civicsignal/ui'
import { getLaunchSignalReport } from '@/lib/queries'

export const metadata: Metadata = {
  title: 'Signal report | CivicSignal',
  description: 'Weekly beta signal report for CivicSignal participation, polls, disputes, and methodology changes.',
}

const formatDate = (iso?: string | null) => {
  if (!iso) return 'Not yet'
  return new Date(iso).toISOString().slice(0, 10)
}

export default async function Page() {
  const report = await getLaunchSignalReport()

  const metrics = [
    { k: 'Active polls', v: report.activePolls, sub: 'open for voting' },
    { k: 'Resolved polls', v: report.resolvedPolls, sub: 'with outcomes recorded' },
    { k: 'Votes', v: report.votes, sub: 'sealed receipts created' },
    { k: 'Proposals', v: report.proposals, sub: `${report.pendingProposals} pending or appealed` },
    { k: 'Beta invites', v: report.invitesIssued, sub: `${report.invitesAccepted} accepted · ${report.invitesOpen} open` },
    { k: 'Disputes', v: report.disputes, sub: `${report.openDisputes} open or reviewing` },
    { k: 'Panel reviews', v: report.panelReviews, sub: 'evidence decisions' },
  ]

  return (
    <div style={{ background: 'var(--color-parchment-bg)', color: 'var(--color-parchment-ink)', minHeight: '100%' }}>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 40px 96px' }}>
        <section style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 56, alignItems: 'end', borderBottom: '1px solid var(--color-parchment-line)', paddingBottom: 32 }}>
          <div>
            <Eyebrow>Weekly signal report · beta</Eyebrow>
            <h1 style={{ margin: '14px 0 0', fontSize: 52, lineHeight: 1.05, fontWeight: 500, letterSpacing: '-0.025em', color: 'var(--color-parchment-ink)' }}>
              The operating record, not the marketing story.
            </h1>
          </div>
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <Badge tone="green" mono>generated {formatDate(report.generatedAt)}</Badge>
              <Badge tone="neutral" mono>methodology v0.9 beta</Badge>
            </div>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.58, color: 'var(--color-parchment-ink-soft)' }}>
              This page is the recurring beta report format: participation, poll inventory, proposal moderation, disputes, panel review, and methodology changes. It starts sparse on purpose; the point is to make the operating rhythm public before the cohort grows.
            </p>
          </div>
        </section>

        <section style={{ marginTop: 30, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="cs-form-grid">
          {metrics.map((m) => (
            <div key={m.k} style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '17px 18px' }}>
              <Eyebrow>{m.k}</Eyebrow>
              <div className="font-mono" style={{ marginTop: 8, fontSize: 30, color: 'var(--color-parchment-ink)' }}>{m.v.toLocaleString()}</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--color-parchment-muted)' }}>{m.sub}</div>
            </div>
          ))}
        </section>

        <section style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="cs-detail-grid">
          <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '22px 24px' }}>
            <Eyebrow>Poll quality watchlist</Eyebrow>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {report.watchlist.map((item) => (
                <div key={item} style={{ paddingBottom: 10, borderBottom: '1px solid var(--color-parchment-line-soft)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-parchment-ink-soft)' }}>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '22px 24px' }}>
            <Eyebrow>Methodology changes this cycle</Eyebrow>
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-parchment-ink-soft)' }}>
              <li>Launch copy now labels verification, audit, and Trusted Panels as beta where appropriate.</li>
              <li>Onboarding now behaves as participant activation rather than another product tour.</li>
              <li>Header navigation now prioritizes polls, proposals, and methodology; trust/education pages moved into More/footer.</li>
              <li>Smoke harness cleanup now checks synthetic lifecycle polls are not left behind.</li>
            </ul>
          </div>
        </section>

        <section style={{ marginTop: 28, background: '#FBF8F1', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '22px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <div>
            <Eyebrow>Next report trigger</Eyebrow>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--color-parchment-ink-soft)' }}>
              Publish the first real report after the first external cohort casts votes or submits proposals. Until then, this page tracks the invite funnel, operating metrics, and quality baseline.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <Link href="/verify"><Btn kind="ghost" size="md">Audit data →</Btn></Link>
            <Link href="/proposals"><Btn kind="primary" size="md">Moderation queue →</Btn></Link>
          </div>
        </section>
      </main>
    </div>
  )
}
