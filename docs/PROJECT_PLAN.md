# Civic Polling Network

Status: paused
Owner: Cal / Clawdius
Created: 2026-05-03
Paused: 2026-09-11
Category: civic-tech
Private GitHub repo: https://github.com/montytorr/civicsignal

> **Operational state (2026-09-11): PAUSED.** CivicSignal runtime resources are intentionally stopped to free server capacity. This is not retirement and no data/volumes were deleted. Reactivation is documented in `/root/projects/civic-polling-network.md`; do not restart services automatically while this status remains paused.

## Goal

Build a serious civic-tech platform where verified humans answer topic-specific real-world polls, earn non-transferable reputation only when they are directionally right, and eventually participate in a democracy-native governance layer.

The product should feel credible from day one: not a meme coin, not a prediction casino, not a survey toy. The brand is civic legitimacy, collective intelligence, and democratic accountability.

## Core Thesis

Most public polling measures opinion. This platform measures informed civic judgment over time.

Users build reputation by making calls on real-world civic and world-event questions. Reputation is non-transferable, topic-specific, and increases only after a correct/winning outcome. Over time, high-reputation verified humans can become trusted signal providers for public institutions, media, NGOs, researchers, and communities.

## Product Shape

### One-liner

CivicSignal is a global, open-source, verified-human civic polling network where people earn non-transferable topic reputation for being right about real-world issues.

### User-facing pitch

Vote on real-world questions. Build reputation when your judgment proves right. Help create a more accountable democratic signal layer.

### Serious positioning

- Civic intelligence infrastructure
- Verified-human polling
- Non-transferable public reputation
- Topic-specific forecasting without financialized betting
- Democracy roadmap from launch

## Target Users

### Initial users

- Global civically engaged people
- Journalists / policy nerds
- NGO and think-tank audiences
- University politics / economics / IR communities
- Local democracy groups
- People who like prediction markets but dislike gambling / crypto vibes

### Later users

- Municipalities
- Newsrooms
- Pollsters
- Civic platforms
- DAOs / governance orgs that need human legitimacy
- Researchers studying public judgment

## Core Requirements From Cal

1. Serious civic-tech product.
2. Reputation is non-transferable.
3. Use the best architecture judgment available.
4. Polls are based on real-world outcomes.
5. Reputation is topic-specific.
6. Users should be verified humans.
7. Polls focus on world events / civic issues.
8. Only winning/correct outcomes increase reputation.
9. Democracy brand from day one with a clear roadmap to get there.
10. Complete project plan before implementation.
11. Global scope from launch.
12. Publicly pseudonymous by default.
13. Votes hidden until poll cutoff.
14. Position as a public-good civic platform.
15. Working name: CivicSignal.
16. Open-source by default; architecture, docs, and implementation should assume public repo standards.

## Chain / Cost Strategy

### Short answer

Yes, we can make the chain part effectively free for users at launch.

### Recommendation

Do not put every poll vote on-chain. That is expensive, slow, and unnecessary early on.

Use a hybrid architecture:

1. Off-chain app database for votes, poll state, identity status, and UX.
2. Cryptographic audit log / Merkle roots for integrity.
3. Periodic anchoring to a low-cost chain or data availability layer.
4. Optional on-chain non-transferable reputation later, once the product has traction.

### Best launch option

Start off-chain with signed vote receipts and periodic public commitments.

This gives:

- Free user experience
- Fast iteration
- No wallet requirement on day one
- Public auditability later
- A clean migration path to on-chain reputation

### Chain cost / who pays

Users should never pay gas in the MVP.

The platform pays any chain cost through a backend-controlled anchoring wallet. The chain is a thin public audit layer, not a user-facing transaction system.

Launch posture:

1. Generate signed vote receipts and Merkle/audit commitments off-chain first.
2. Build the anchoring module so it can be switched on cleanly.
3. Only start spending gas once there is enough real usage worth notarizing.
4. Anchor in batches — per poll, per resolution batch, or daily — rather than per vote.

Expected cost profile:

- Off-chain commitments only: $0 chain cost.
- L2 anchoring on Base / Optimism: likely cents to low dollars depending on frequency.
- Ethereum mainnet: only for rare high-credibility checkpoints later, not MVP operations.

Decision: Cal agrees the platform, not users, pays any chain anchoring cost. No tokenomics, no user gas, no wallet requirement at launch.

### Where the chain lives

The chain lives beside the app as a public audit layer:

- CivicSignal app/database: users, polls, hidden votes, reputation, moderation.
- Commitment service: computes Merkle roots for poll/vote/reputation batches.
- Anchoring contract: stores only roots, timestamps, poll/batch IDs, and metadata pointers on a cheap L2.
- Public verifier: open-source script/page lets anyone recompute roots from exported data and verify they match the chain.

Users should barely notice this exists. Its job is to prove CivicSignal did not tamper with the civic record, not to create a financial product.

### Chain options later

- Base / Optimism / Arbitrum: cheap EVM, good ecosystem.
- Polygon PoS: cheap and familiar, but weaker civic credibility.
- Ceramic / Veramo / DIDs: stronger identity/reputation angle.
- Ethereum mainnet: only for periodic anchoring, not per-vote actions.
- World Chain / World ID: useful if World ID becomes the verification provider.

### My take

Do not lead with blockchain. Lead with civic trust. Use crypto underneath only where it earns its keep: auditability, non-transferable credentials, and public legitimacy.

## Human Verification Strategy

Verification should be layered, not one magic gate.

### Phase 1 — Practical MVP

- Email + phone verification
- Device / abuse fingerprinting
- Rate limits
- Basic duplicate detection
- Optional OAuth login

This is enough for a closed/private beta.

### Phase 2 — Stronger verified-human layer

Offer one or more:

- World ID proof-of-personhood
- Gitcoin Passport / Passport XYZ score
- Civic-style identity checks where available
- Stripe Identity / Persona for higher-trust cohorts
- Institution/community verification for special groups

### Phase 3 — Civic-grade identity

- Verifiable credentials
- Soulbound identity/reputation attestations
- Anonymous-but-verified voting proofs
- Anti-Sybil scoring without public doxxing

### Principle

The platform should verify humanness, not expose identity. Public users can remain pseudonymous while the system knows they are likely unique humans.

## Reputation Design

### Reputation properties

- Non-transferable
- Topic-specific
- Earned only through correct outcomes
- Decays or stabilizes over time to prevent ancient reputation from dominating forever
- Public enough to be trusted, private enough to avoid harassment

### Topic categories

Initial categories:

- Elections & governance
- Geopolitics
- Economy & markets
- Climate & energy
- Technology & AI
- Public health
- Local civic issues

### Scoring principle

A user earns reputation when:

1. They answer before the cutoff.
2. The question resolves objectively.
3. Their answer matches the winning/resolved outcome.

Incorrect answers do not increase reputation. They may reduce confidence metrics, but the main rule is: only winning increases it.

### Avoid early complexity

MVP should avoid fancy tokenomics. Start with:

- Total reputation
- Topic reputation
- Accuracy percentage
- Number of resolved predictions
- Streaks / badges for engagement

## Poll Design

### Good poll format

Polls must be resolvable by public evidence.

Examples:

- “Will candidate X win election Y?”
- “Will the French government pass policy Z before DATE?”
- “Will CPI in country X be above Y% on DATE?”
- “Will institution X declare Y before DATE?”
- “Will conflict/event X occur before DATE?”

### Bad poll format

Avoid:

- Pure opinions: “Is X good?”
- Ambiguous moral questions
- Unresolvable predictions
- Questions that encourage harassment, manipulation, or violence
- Anything requiring insider information or illegal activity

### Resolution

Each poll needs:

- Clear source of truth
- Resolution date
- Cutoff date
- Outcome options
- Dispute window
- Moderator/resolver notes

## Democracy Roadmap

### Day-one brand promise

The platform exists to improve democratic signal quality: verified humans, transparent questions, accountable resolution, and reputation that cannot be bought.

### Roadmap

#### Stage 1 — Civic signal

Users answer real-world civic polls and build topic reputation.

#### Stage 2 — Trusted panels

High-reputation users become eligible for topic-specific panels.

#### Stage 3 — Community deliberation

Communities can create structured civic questions, debates, and resolutions.

#### Stage 4 — Participatory governance

Verified users and high-reputation panels help prioritize questions, audit resolutions, and govern platform rules.

#### Stage 5 — Public-interest infrastructure

Open APIs and public datasets allow researchers, journalists, and civic institutions to use the signal.

## MVP Scope

### Must have

- User accounts
- Human verification v1
- Poll list
- Poll detail page
- Vote/answer flow
- Cutoff and resolution mechanics
- Topic tags
- Reputation ledger
- User profile with topic reputation
- Admin panel for creating/resolving polls
- Public explanation of methodology
- Basic anti-Sybil / abuse controls

### Should have

- Signed vote receipts
- Public poll archive
- Leaderboards by topic
- Dispute/resolution notes
- Basic invite system
- Private beta cohort management

### Not in MVP

- Tradable tokens
- Financial betting
- Full DAO governance
- Fully on-chain voting
- Complex quadratic voting
- Mobile app
- Paid institutional dashboard

## Architecture Recommendation

### MVP stack

- Next.js app
- Supabase Postgres + Auth
- Server-side poll resolution jobs
- Redis or Postgres queues if needed
- Object storage for receipts/exports
- Optional Merkle tree commitment script
- Later: EVM anchoring contract for poll/reputation roots

### Core tables

- users
- verification_status
- topics
- polls
- poll_options
- votes
- poll_resolutions
- reputation_events
- user_topic_reputation
- audit_commitments
- disputes

### Integrity model

Each vote creates an immutable vote record.

Periodically:

1. Hash vote records.
2. Build Merkle root.
3. Store root in database.
4. Publish root publicly.
5. Later anchor roots on-chain.

This gives credible auditability without forcing users to pay gas.

## Business Model

### Avoid early monetization that corrupts trust

Do not sell influence. Do not let money buy reputation. Do not make this look like a casino.

### Possible revenue later

- Institutional analytics subscriptions
- Custom verified civic panels
- Research exports
- Sponsored public-interest polling with transparent labeling
- Grants / civic-tech funding
- Municipality/community deployments

## Brand Direction

### Tone

- Serious
- Democratic
- Clean
- Trustworthy
- Modern but not crypto-native

### Avoid

- Meme coin language
- “Earn money by predicting” language
- Speculative token hype
- Partisan positioning

### Possible names

- CivicSignal
- Polity
- Agora Signal
- Verity Civic
- Public Proof
- Civic Oracle
- Mandate

My favorite: CivicSignal. It says what it does without sounding like a DAO from 2021.

## Risks

### Main risks

- Sybil attacks / fake accounts
- Poll resolution disputes
- Political bias accusations
- Low-quality questions
- Reputation gaming
- Looking too crypto
- Legal/regulatory confusion if it resembles betting

### Mitigations

- No financial wagering
- Transparent methodology
- Clear sources of truth
- Human verification layers
- Public moderation standards
- Topic-specific reputation
- Independent advisory board later

## Open Questions

1. Should the first beta be global politics/world events or local France/EU civic issues?
2. Should users be pseudonymous publicly or real-name optional?
3. Should answers be hidden until cutoff to prevent herding?
4. Who resolves disputed polls at launch?
5. Should reputation ever decrease, or only confidence scores change?
6. Should private beta require invites?

## Recommended First Sprint

### Sprint 0 — Foundation

- Pick name and positioning.
- Define MVP poll/reputation model.
- Create product spec.
- Create database schema.
- Build clickable landing + dashboard prototype.

### Sprint 1 — MVP app

- Auth
- Poll browsing
- Vote submission
- Admin poll creation
- Resolution flow
- Reputation updates

### Sprint 2 — Trust layer

- Verification v1
- Audit log
- Signed vote receipts
- Public methodology page
- Abuse protections

### Sprint 3 — Beta launch

- Seed 25-50 serious polls
- Invite first 50-200 users
- Run weekly resolution cycles
- Publish first public signal report

## Immediate TODO

- [x] Choose working name: CivicSignal.
- [x] Decide first beta domain: global civic/world events.
- [x] Draft poll schema and reputation formula: see `docs/MVP_SCHEMA.md`.
- [x] Create product spec from this project file: see `docs/PRODUCT_SPEC.md`.
- [x] Build landing page and public product surfaces.
- [x] Build database schema and Supabase migrations.
- [x] Build MVP voting flow with sealed active vote splits.
- [x] Add verification v1 through Supabase auth, profiles, rate limits, and invite/onboarding flows.
- [x] Add admin creation, publication, proposal moderation, resolution, and dispute review flows.
- [x] Add public methodology, roadmap, audit, panels, proposal, archive, and leaderboard pages.
- [x] Seed 25-50 serious launch polls.
- [x] Add proposal lifecycle and trusted-panel smoke checks.
- [ ] Run first external beta cohort and publish the first weekly public signal report.

## Decision Log

- 2026-05-03: Chain should be invisible/free to users at launch. Use off-chain app DB + cryptographic audit commitments, with optional low-cost chain anchoring later.
- 2026-05-03: Cal agreed chain costs, if/when anchoring is enabled, are paid by the platform via backend wallet — no user gas, no wallet requirement, no tokenomics.
- 2026-05-03: Chain lives beside the app as a thin audit layer: commitment service + L2 anchoring contract + public verifier, not as the core product UX.
- 2026-05-03: Created private GitHub repo at https://github.com/montytorr/civicsignal and seeded it with the updated project/design markdown docs.
- 2026-05-03: Reputation is non-transferable, topic-specific, and only increases on correct/winning outcomes.
- 2026-05-03: Product should lead with democracy/civic legitimacy, not crypto/token language.
- 2026-05-03: Working name is CivicSignal.
- 2026-05-03: Scope is global.
- 2026-05-03: Users are pseudonymous by default, with verification hidden from public identity.
- 2026-05-03: Votes are hidden until poll cutoff to reduce herding.
- 2026-05-03: Positioning is public-good civic platform.
- 2026-05-03: Project should be open-source by default.
- 2026-05-03: First beta domain should be global civic/world events, not France/EU-only.
- 2026-05-03: MVP product spec and MVP schema/reputation draft were created in `docs/PRODUCT_SPEC.md` and `docs/MVP_SCHEMA.md`.

## Current Status

CivicSignal is in credible pre-launch/beta-readiness mode: the MVP app, public trust surfaces, proposal governance, signed receipts/audit commitments, seeded polls, admin flows, and Trusted Panels path are live. The remaining work is operational launch discipline: keep QA/smoke checks clean, invite the first external cohort, moderate real proposals, and publish the first weekly public signal report.
