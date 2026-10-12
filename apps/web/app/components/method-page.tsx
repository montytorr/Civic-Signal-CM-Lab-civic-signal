import Link from 'next/link'
import { Eyebrow, Btn } from '@civicsignal/ui'

const SECTIONS = [
  {
    id: 'humans',
    n: '01',
    h: 'Verified humans',
    d: 'Beta participation starts with account, email, invite/profile, rate-limit, and abuse controls. Stronger proof-of-personhood providers can be added without changing the public reputation model.',
    bullets: [
      'Email and invite/profile checks',
      'Verified profile required to vote',
      'Rate-limited sensitive actions',
      'Stronger providers planned',
    ],
  },
  {
    id: 'pseudo',
    n: '02',
    h: 'Pseudonymity by default',
    d: 'Every account receives a stable public handle. Email and account metadata stay in the authentication layer; the public product is built around handles, topic reputation, proposals, votes, and disputes.',
    bullets: [
      'Stable public handles',
      'No real-name requirement',
      'No location display by default',
      'Public reputation is topic-scoped',
    ],
  },
  {
    id: 'sealed',
    n: '03',
    h: 'Sealed votes',
    d: 'When you answer, the active public feed keeps aggregate results hidden until cutoff. The server checks your answer is one of the options, seals it to the poll’s public key and stores only the sealed answer and a receipt hash. No readable copy of your answer is kept. At resolution the ballots are opened in memory to count them: only the totals per answer are published, and your profile records only whether your answer matched.',
    bullets: [
      'Active vote split hidden publicly',
      'Encrypted answer plus receipt hash',
      'One vote per verified user per poll',
      'No vote reweighting',
    ],
  },
  {
    id: 'authoring',
    n: '04',
    h: 'Community poll authoring',
    d: 'Verified users can propose civic polls with a question, topic, region, outcome options, cutoff, source-of-truth, and resolution criteria. Proposals enter a moderation queue instead of going straight live, so poll quality improves without hiding the curation layer.',
    bullets: [
      'Verified-user proposals',
      'Public proposal log',
      'Reusable source templates',
      'Admin or panel moderation',
    ],
  },
  {
    id: 'resolve',
    n: '05',
    h: 'Resolution',
    d: 'Every poll names a single source-of-truth before it opens, often from a region-specific template. After cutoff, a resolver records the outcome with linked evidence, a timestamp, and the named source — then a 24h dispute window opens.',
    bullets: [
      'Source named pre-launch',
      'Linked, timestamped evidence',
      '24h public dispute window',
      'Trusted-panel review on disputes',
    ],
  },
  {
    id: 'rep',
    n: '06',
    h: 'Reputation',
    d: "Reputation is topic-specific and earned by being on the correct side of a resolved poll. It can’t be transferred, sold, staked, or boosted by paying. There is no single global score.",
    bullets: [
      'Per-topic only',
      'Non-transferable',
      'No financial value',
      'Decays slowly to reward sustained accuracy',
    ],
  },
  {
    id: 'panels',
    n: '07',
    h: 'Trusted panels',
    d: 'High-reputation users can be invited into topic panels. Panels review disputes, assess evidence, and help turn edge cases into auditable decisions without making CivicSignal dependent on a single resolver.',
    bullets: [
      'Topic-specific panel seats',
      'Dispute evidence review',
      'Moderator notes preserved',
      'Panel workspace for review',
    ],
  },
  {
    id: 'audit',
    n: '08',
    h: 'Open audit',
    d: 'The public audit console exposes proposal counts, source-template coverage, disputes, panel reviews, vote commitments, and resolution evidence. A standalone export/verifier CLI is planned after beta data stabilizes.',
    bullets: [
      'MPL-2.0 reference implementation',
      'Public audit console live',
      'Commitment rows visible',
      'Verifier export planned',
    ],
  },
]

export const MethodPage = () => (
  <div className="bg-parchment-bg text-parchment-ink" style={{ minHeight: '100%' }}>

    {/* HERO BAND */}
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
        <Eyebrow>Methodology · v0.9 beta</Eyebrow>
        <h1
          style={{
            margin: '14px 0 0',
            fontSize: 52,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            color: '#0E1F36',
            textWrap: 'balance' as never,
          }}
        >
          How CivicSignal stays trustworthy.
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
        Trust is not a feeling we ask you for — it is the property of a system you can inspect.
        This page separates what is live in beta from the stronger verification and audit layers still planned, so CivicSignal earns credibility without pretending the hard parts are already finished.
      </p>
      </div>
    </section>

    {/* SIX NUMBERED SECTIONS */}
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px' }}>
      {SECTIONS.map((s, i) => (
        <div
          key={s.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr 1.2fr',
            gap: 40,
            padding: '52px 0',
            borderBottom: i < SECTIONS.length - 1 ? '1px solid #D9D1BD' : 'none',
          }}
        >
          {/* Col 1 — number */}
          <div
            className="font-mono"
            style={{ fontSize: 12, color: '#6B7488', letterSpacing: '0.06em' }}
          >
            {s.n}
          </div>

          {/* Col 2 — heading + description */}
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
              {s.h}
            </h2>
            <p
              style={{
                marginTop: 14,
                fontSize: 14.5,
                lineHeight: 1.6,
                color: '#3A4861',
                maxWidth: 480,
                textWrap: 'pretty' as never,
              }}
            >
              {s.d}
            </p>
          </div>

          {/* Col 3 — bullets */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              borderTop: '1px solid #E5DEC9',
            }}
          >
            {s.bullets.map((b) => (
              <div
                key={b}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #E5DEC9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 13.5, color: '#3A4861' }}>{b}</span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#2F6B4A',
                    flexShrink: 0,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>

    {/* CTA STRIP */}
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
          padding: '64px 40px 96px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
          alignItems: 'center',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: '#0E1F36',
            textWrap: 'balance' as never,
          }}
        >
          Read the source. Propose a poll. Run the auditor.
        </h2>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Link href="https://github.com/montytorr/civicsignal" target="_blank" rel="noopener noreferrer">
            <Btn kind="ghost" size="md">Auditor CLI →</Btn>
          </Link>
          <Link href="/proposals">
            <Btn kind="primary" size="md">Propose a poll →</Btn>
          </Link>
        </div>
      </div>
    </section>

  </div>
)
