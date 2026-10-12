import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eyebrow, Btn, Badge } from '@civicsignal/ui'
import { query, queryOne } from '@civicsignal/db'
import { getViewer } from '@/lib/auth/server'
import { ResendVerification } from '@/components/resend-verification'

export const metadata: Metadata = {
  title: 'Activation | CivicSignal',
  description: 'First-session activation dashboard for CivicSignal participants.',
}

type ActivationStep = {
  n: string
  title: string
  body: string
  href: string
  cta: string
  done: boolean
  primary?: boolean
}

const statusTone = (done: boolean) => (done ? 'green' : 'amber') as 'green' | 'amber'

export default async function Page() {
  const viewer = await getViewer()
  if (!viewer) redirect('/auth/signin')

  const [counts, recentVotes] = await Promise.all([
    queryOne<{ votes: string; proposals: string; active_polls: string; commitments: string }>(
      `select (select count(*) from votes where user_id = $1) as votes,
              (select count(*) from poll_proposals where proposed_by = $1) as proposals,
              (select count(*) from polls where status = 'active') as active_polls,
              (select count(*) from audit_commitments) as commitments`,
      [viewer.id],
    ),
    // P8: the viewer's own votes only; P5: the poll question only for public polls.
    query<{
      id: string
      poll_id: string
      receipt_hash: string
      created_at: string
      polls: { question: string; status: string; topics: { label: string } | null } | null
    }>(
      `select v.id, v.poll_id, v.receipt_hash, v.created_at,
              case when p.status in ('active', 'closed', 'resolved') then json_build_object(
                'question', p.question, 'status', p.status,
                'topics', case when t.id is null then null else json_build_object('label', t.label) end
              ) else null end as polls
       from votes v join polls p on p.id = v.poll_id left join topics t on t.id = p.topic_id
       where v.user_id = $1
       order by v.created_at desc
       limit 3`,
      [viewer.id],
    ),
  ])

  const profile = { handle: viewer.handle, verified: viewer.verified }
  const voteCount = Number(counts?.votes ?? 0)
  const proposalCount = Number(counts?.proposals ?? 0)
  const activePollCount = Number(counts?.active_polls ?? 0)
  const commitmentCount = Number(counts?.commitments ?? 0)

  const verified = Boolean(profile?.verified)
  const hasVoted = voteCount > 0
  const hasProposed = proposalCount > 0
  const hasAuditTrail = recentVotes.length > 0 || commitmentCount > 0
  const completed = [verified, hasVoted, hasProposed, hasAuditTrail].filter(Boolean).length

  const steps: ActivationStep[] = [
    {
      n: '01',
      title: verified ? 'Profile verified' : 'Finish verification',
      body: verified
        ? 'Your profile can vote, propose, and build topic reputation.'
        : 'Confirm your email with the link we sent before casting votes or proposing public questions.',
      href: profile?.handle ? `/u/${profile.handle}` : '/u',
      cta: verified ? 'View profile' : 'Open profile',
      done: verified,
      primary: !verified,
    },
    {
      n: '02',
      title: hasVoted ? 'First vote cast' : 'Cast your first vote',
      body: hasVoted
        ? `You have ${voteCount} vote${voteCount === 1 ? '' : 's'} recorded. Keep an eye on cutoff and resolution windows.`
        : `${activePollCount} active poll${activePollCount === 1 ? '' : 's'} are open. Pick one with a source you trust.`,
      href: '/polls',
      cta: hasVoted ? 'Browse more polls' : 'Vote now',
      done: hasVoted,
      primary: verified && !hasVoted,
    },
    {
      n: '03',
      title: hasProposed ? 'First proposal submitted' : 'Propose one serious question',
      body: hasProposed
        ? `You have ${proposalCount} proposal${proposalCount === 1 ? '' : 's'} in the public moderation trail.`
        : 'Submit a neutral, resolvable civic question with a named source and clean resolution criteria.',
      href: '/proposals',
      cta: hasProposed ? 'View proposals' : 'Propose poll',
      done: hasProposed,
      primary: verified && hasVoted && !hasProposed,
    },
    {
      n: '04',
      title: 'Inspect your audit trail',
      body: hasAuditTrail
        ? `${commitmentCount} public commitment${commitmentCount === 1 ? '' : 's'} are visible in the trust console.`
        : 'After voting, use the audit page to understand receipts, commitments, disputes, and panel reviews.',
      href: '/verify',
      cta: 'Open audit',
      done: hasAuditTrail,
      primary: verified && hasVoted && hasProposed,
    },
  ]

  const nextStep = steps.find((s) => !s.done) ?? steps[steps.length - 1]

  return (
    <div style={{ background: 'var(--color-parchment-bg)', color: 'var(--color-parchment-ink)', minHeight: '100%' }}>
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '58px 40px 96px' }}>
        <section style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 48, alignItems: 'end', borderBottom: '1px solid var(--color-parchment-line)', paddingBottom: 30 }}>
          <div>
            <Eyebrow>Participant activation</Eyebrow>
            <h1 style={{ margin: '12px 0 0', fontSize: 48, lineHeight: 1.06, fontWeight: 500, letterSpacing: '-0.025em' }}>Your first session dashboard.</h1>
          </div>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Badge tone={statusTone(verified)} mono>{verified ? 'verified profile' : 'verification needed'}</Badge>
              <Badge tone="neutral" mono>{profile?.handle ?? 'pseudonymous handle pending'}</Badge>
              <Badge tone="neutral" mono>{completed}/4 activated</Badge>
            </div>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.58, color: 'var(--color-parchment-ink-soft)' }}>
              This page is not the product tour. It is your activation checklist: finish profile status, cast one vote, propose one poll, and learn where your receipts and public audit evidence live.
            </p>
            {!verified && <ResendVerification />}
          </div>
        </section>

        <section style={{ marginTop: 30, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }} className="cs-form-grid">
          {[
            { k: 'Votes', v: voteCount, sub: hasVoted ? 'recorded under your account' : 'cast one to start' },
            { k: 'Proposals', v: proposalCount, sub: hasProposed ? 'in public moderation' : 'submit one serious question' },
            { k: 'Active polls', v: activePollCount, sub: 'available now' },
            { k: 'Audit commitments', v: commitmentCount, sub: 'public trust records' },
          ].map((stat) => (
            <div key={stat.k} style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '16px 18px' }}>
              <Eyebrow>{stat.k}</Eyebrow>
              <div className="font-mono" style={{ marginTop: 8, fontSize: 28, color: 'var(--color-parchment-ink)' }}>{stat.v.toLocaleString()}</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--color-parchment-muted)' }}>{stat.sub}</div>
            </div>
          ))}
        </section>

        <section style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 18 }} className="cs-detail-grid">
          <div style={{ background: '#FBF8F1', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '22px 24px' }}>
            <Eyebrow>Next best action</Eyebrow>
            <h2 style={{ margin: '10px 0 8px', fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em' }}>{nextStep.title}</h2>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.58, color: 'var(--color-parchment-ink-soft)' }}>{nextStep.body}</p>
            <Link href={nextStep.href} style={{ display: 'inline-block', marginTop: 18 }}>
              <Btn kind="primary" size="md">{nextStep.cta} →</Btn>
            </Link>
          </div>

          <div style={{ background: 'var(--color-parchment-surface)', border: '1px solid var(--color-parchment-line)', borderRadius: 4, padding: '22px 24px' }}>
            <Eyebrow>Recent receipts</Eyebrow>
            {recentVotes.length === 0 ? (
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--color-parchment-ink-soft)' }}>
                No vote receipts yet. Once you vote, your latest receipt hashes appear here so onboarding becomes operational rather than decorative.
              </p>
            ) : (
              <div style={{ marginTop: 8, borderTop: '1px solid var(--color-parchment-line-soft)' }}>
                {recentVotes.map((vote) => (
                  <Link key={vote.id} href={`/polls/${vote.poll_id}`} style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid var(--color-parchment-line-soft)', textDecoration: 'none' }}>
                    <div style={{ fontSize: 13.5, lineHeight: 1.4, color: 'var(--color-parchment-ink)' }}>{vote.polls?.question ?? 'Poll receipt'}</div>
                    <div className="font-mono" style={{ marginTop: 4, fontSize: 11, color: 'var(--color-parchment-muted)' }}>{vote.receipt_hash.slice(0, 12)}… · {vote.polls?.topics?.label ?? 'CivicSignal'}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid var(--color-parchment-line)', marginTop: 34 }} className="cs-form-grid">
          {steps.map((step, i) => (
            <div key={step.n} style={{ padding: i === 0 ? '28px 24px 28px 0' : '28px 24px', borderRight: i < steps.length - 1 ? '1px solid var(--color-parchment-line)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-parchment-muted)', letterSpacing: '0.06em' }}>{step.n}</span>
                <Badge tone={statusTone(step.done)} mono>{step.done ? 'done' : 'next'}</Badge>
              </div>
              <h2 style={{ margin: '12px 0 9px', fontSize: 20, fontWeight: 500, lineHeight: 1.25 }}>{step.title}</h2>
              <p style={{ minHeight: 84, margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-parchment-ink-soft)' }}>{step.body}</p>
              <Link href={step.href} style={{ display: 'inline-block', marginTop: 16 }}><Btn kind={step.primary ? 'primary' : 'ghost'} size="sm">{step.cta} →</Btn></Link>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
