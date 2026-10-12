import { Eyebrow, Badge } from '@civicsignal/ui'

const PHASES = [
  {
    id: 'signal',
    date: '2026 · Q2',
    state: 'beta' as const,
    title: 'Civic signal',
    subtitle: 'Verified-human polling on real-world events.',
    description:
      'Users answer real-world civic polls and build topic reputation. Each participant clears beta verification checks. Active vote splits are hidden publicly until cutoff, then resolved against a named source-of-truth.',
    milestones: [
      { label: 'Pseudonymous handle generation', done: true },
      { label: 'Beta verification gate', done: true },
      { label: 'Poll creation and publishing', done: true },
      { label: 'Publicly hidden active vote splits', done: true },
      { label: 'Single-source resolution', done: true },
      { label: 'Topic-specific reputation', done: true },
      { label: 'Signed vote receipts', done: true },
      { label: 'Public commitment hashes', done: true },
    ],
  },
  {
    id: 'panels',
    date: '2026 · Q3',
    state: 'beta' as const,
    title: 'Trusted panels',
    subtitle: 'Reputation-weighted evidence and review.',
    description:
      'High-reputation users become eligible for topic-specific panels. Panel members can submit evidence on resolution edge cases and participate in dispute review.',
    milestones: [
      { label: 'Reputation-gated panel invitations', done: true },
      { label: 'Evidence submission workflow', done: true },
      { label: 'Multi-resolver dispute review', done: true },
      { label: 'Panel transparency surface', done: true },
    ],
  },
  {
    id: 'deliberation',
    date: '2026 · Q4',
    state: 'now' as const,
    title: 'Community deliberation',
    subtitle: 'Cross-jurisdiction polls and structured civic questions.',
    description:
      'Communities can create structured civic questions, debates, and resolutions. Region-aware question authoring with locale-specific resolution sources enables cross-border civic intelligence.',
    milestones: [
      { label: 'Community poll authoring', done: true },
      { label: 'Region-specific resolution sources', done: true },
      { label: 'Structured debate format', done: false },
      { label: 'Cross-jurisdiction aggregation', done: false },
      { label: 'Locale-aware question templates', done: true },
      { label: 'Guided civic-loop demo', done: true },
      { label: 'Launch seed questions', done: true },
    ],
  },
  {
    id: 'governance',
    date: '2027 · H2',
    state: 'planned' as const,
    title: 'Participatory governance',
    subtitle: 'Reputation-gated platform governance.',
    description:
      'Verified users and high-reputation panels help prioritize questions, audit resolutions, and govern platform rules. The platform transitions from operator-managed to community-governed.',
    milestones: [
      { label: 'Reputation-gated governance proposals', done: false },
      { label: 'Community dispute arbitration', done: false },
      { label: 'Source curation governance', done: false },
      { label: 'Proposal appeal process', done: true },
      { label: 'Rule-change voting', done: false },
    ],
  },
  {
    id: 'infrastructure',
    date: '2028+',
    state: 'planned' as const,
    title: 'Public-interest infrastructure',
    subtitle: 'Open APIs and public datasets for civic institutions.',
    description:
      'Open APIs and public datasets allow researchers, journalists, and civic institutions to use the signal. CivicSignal becomes civic infrastructure — not a product, but a public good.',
    milestones: [
      { label: 'Public API for researchers', done: false },
      { label: 'Institutional analytics dashboard', done: false },
      { label: 'Data export and public archives', done: false },
      { label: 'Municipality deployment toolkit', done: false },
      { label: 'On-chain reputation anchoring', done: false },
    ],
  },
]

const stateBadge = (state: 'done' | 'beta' | 'now' | 'next' | 'planned') => {
  if (state === 'done') return <Badge tone="green" mono>Done</Badge>
  if (state === 'beta') return <Badge tone="green" mono>Beta</Badge>
  if (state === 'now') return <Badge tone="amber" mono>Now</Badge>
  if (state === 'next') return <Badge tone="amber" mono>Next</Badge>
  return <Badge tone="neutral" mono>Planned</Badge>
}

const doneCount = (phase: (typeof PHASES)[number]) =>
  phase.milestones.filter((m) => m.done).length

export const RoadmapPage = () => (
  <div className="bg-parchment-bg text-parchment-ink" style={{ minHeight: '100%' }}>

    <section style={{ borderBottom: '1px solid #D9D1BD' }}>
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '64px 40px 32px',
          display: 'grid',
          gridTemplateColumns: '0.9fr 1.1fr',
          gap: 56,
          alignItems: 'end',
        }}
      >
        <div>
          <Eyebrow>Democracy roadmap · v1.0 beta</Eyebrow>
          <h1
            style={{
              margin: '14px 0 0',
              fontSize: 48,
              fontWeight: 500,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: '#0E1F36',
              textWrap: 'balance' as never,
            }}
          >
            From civic polling toward shared public reasoning.
          </h1>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 16,
            lineHeight: 1.55,
            color: '#3A4861',
            maxWidth: 540,
            textWrap: 'pretty' as never,
          }}
        >
          CivicSignal is not a finished product — it is a staged commitment to building civic
          infrastructure that earns trust over time. Beta-complete phases are marked explicitly;
          the current build focus is external beta operations, public audit clarity, and the first weekly signal report.
        </p>
      </div>
    </section>

    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px' }}>
      {PHASES.map((phase, i) => (
        <div
          key={phase.id}
          id={phase.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr',
            gap: 48,
            padding: '56px 0',
            borderBottom: i < PHASES.length - 1 ? '1px solid #D9D1BD' : 'none',
          }}
        >
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span
                className="font-mono"
                style={{ fontSize: 12, color: '#6B7488', letterSpacing: '0.04em' }}
              >
                {phase.date}
              </span>
              {stateBadge(phase.state)}
            </div>
          </div>

          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: '#0E1F36',
              }}
            >
              {phase.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#3A4861',
                }}
              >
                {phase.subtitle}
              </p>
              <span className="font-mono" style={{ fontSize: 11, color: '#6B7488', letterSpacing: '0.04em' }}>
                {doneCount(phase)}/{phase.milestones.length} done
              </span>
            </div>
            <p
              style={{
                marginTop: 16,
                fontSize: 14.5,
                lineHeight: 1.6,
                color: '#3A4861',
                maxWidth: 640,
                textWrap: 'pretty' as never,
              }}
            >
              {phase.description}
            </p>

            <div
              style={{
                marginTop: 24,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 0,
                borderTop: '1px solid #E5DEC9',
              }}
            >
              {phase.milestones.map((m) => (
                <div
                  key={m.label}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid #E5DEC9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    paddingRight: 16,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: m.done ? '#2F6B4A' : '#D9D1BD',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13.5,
                      color: m.done ? '#0E1F36' : '#3A4861',
                      flex: 1,
                    }}
                  >
                    {m.label}
                  </span>
                  <span className="font-mono" style={{
                    fontSize: 10.5,
                    color: m.done ? '#2F6B4A' : '#6B7488',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    {m.done ? (phase.state === 'beta' ? 'Beta' : 'Done') : phase.state === 'now' ? 'Next' : 'Later'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </section>

    <section
      style={{
        borderTop: '1px solid #D9D1BD',
        background: '#FBF8F1',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '56px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 32,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontStyle: 'italic',
              color: '#3A4861',
              maxWidth: 600,
            }}
          >
            &quot;This roadmap is a public commitment, not a marketing timeline. Each phase ships
            only when the previous one has earned trust through real usage and public audit.&quot;
          </p>
        </div>
        <Eyebrow dim>Updated 2026-05-12</Eyebrow>
      </div>
    </section>

  </div>
)
