#!/usr/bin/env node
// Seed the launch moderation queue with example poll proposals. Idempotent: proposals are
// matched by question and updated in place on later runs.
// Usage: DATABASE_URL=postgresql://... node scripts/seed-launch-proposals.mjs
import { createRequire } from 'node:module'

const pg = createRequire(new URL('../packages/db/package.json', import.meta.url))('pg')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

// Owns the seed proposals when the database has no admin or verified profile yet. Its
// password hash never verifies, so nobody can sign in as it.
const SEED_OWNER_EMAIL = 'launch-seed@civicsignal.test'
const SEED_OWNER_HANDLE = 'civicsignal-launch-seed'

const proposals = [
  {
    topic: 'climate',
    question: 'Will the International Energy Agency report global coal demand declining year-over-year in its 2026 Coal report?',
    region: 'Global',
    options: ['Yes', 'No'],
    source_of_truth: 'International Energy Agency Coal 2026 report page and data tables',
    resolution_criteria: 'Resolves YES if the official IEA Coal 2026 publication reports global coal demand lower than the prior year. Press previews and third-party summaries do not count.',
    cutoff_at: '2026-12-01T23:59:00Z',
    resolves_at: '2027-01-15T23:59:00Z',
    status: 'pending',
  },
  {
    topic: 'geopol',
    question: 'Will the UN General Assembly adopt a resolution calling for an international AI safety treaty before 31 December 2026?',
    region: 'United Nations',
    options: ['Yes', 'No'],
    source_of_truth: 'United Nations Digital Library official General Assembly voting record',
    resolution_criteria: 'Resolves YES if an adopted UNGA resolution explicitly calls for negotiation, drafting, or adoption of an international AI safety treaty by 2026-12-31. Drafts and speeches do not count.',
    cutoff_at: '2026-12-20T23:59:00Z',
    resolves_at: '2027-01-15T23:59:00Z',
    status: 'pending',
  },
  {
    topic: 'econ',
    question: 'Will the Bank of England cut Bank Rate below 4.0% before 31 December 2026?',
    region: 'United Kingdom',
    options: ['Yes', 'No'],
    source_of_truth: 'Bank of England Monetary Policy Committee decisions page',
    resolution_criteria: 'Resolves YES if an official MPC decision sets Bank Rate below 4.0% with a decision date on or before 2026-12-31. Market pricing and speeches do not count.',
    cutoff_at: '2026-12-18T23:59:00Z',
    resolves_at: '2027-01-08T23:59:00Z',
    status: 'changes_requested',
    moderator_notes: 'Needs explicit handling if an emergency unscheduled MPC meeting occurs; otherwise source and outcome are strong.',
  },
  {
    topic: 'health',
    question: 'Will the WHO publish updated pandemic influenza preparedness guidance before 30 September 2026?',
    region: 'Global',
    options: ['Yes', 'No'],
    source_of_truth: 'World Health Organization official publications page',
    resolution_criteria: 'Resolves YES if WHO publishes a new or updated pandemic influenza preparedness guidance document on who.int by 2026-09-30 23:59 UTC. Regional-office-only publications do not count.',
    cutoff_at: '2026-09-20T23:59:00Z',
    resolves_at: '2026-10-10T23:59:00Z',
    status: 'approved',
    moderator_notes: 'Approved as an example of narrow source-based public-health authoring.',
  },
  {
    topic: 'elect',
    question: 'Will France publish final official turnout above 70% for the first round of the 2027 presidential election?',
    region: 'France',
    options: ['Yes', 'No'],
    source_of_truth: 'French Ministry of Interior official election results',
    resolution_criteria: 'Resolves YES if the Ministry of Interior final first-round turnout figure is strictly above 70.00%. Media projections and partial counts do not count.',
    cutoff_at: '2027-04-10T23:59:00Z',
    resolves_at: '2027-05-05T23:59:00Z',
    status: 'pending',
  },
]

// The seed owner if it exists, otherwise an admin, otherwise a verified profile. On a database
// with none of these, create the seed owner (verified; the users trigger creates its profile).
const findOrCreateOwner = async (client) => {
  const { rows } = await client.query(
    `select p.id, p.handle
       from profiles p
       join users u on u.id = p.id
      where u.email = $1 or u.is_admin or p.verified
      order by (u.email = $1) desc, u.is_admin desc, p.created_at asc
      limit 1`,
    [SEED_OWNER_EMAIL],
  )
  if (rows.length) return { ...rows[0], created: false }

  const { rows: [user] } = await client.query(
    `insert into users (email, password_hash, email_verified_at) values ($1, '!', now()) returning id`,
    [SEED_OWNER_EMAIL],
  )
  await client.query('update profiles set handle = $2 where id = $1', [user.id, SEED_OWNER_HANDLE])
  return { id: user.id, handle: SEED_OWNER_HANDLE, created: true }
}

const client = new pg.Client({ connectionString: databaseUrl, application_name: 'civicsignal-seed' })

try {
  await client.connect()
  await client.query('begin')

  const owner = await findOrCreateOwner(client)
  const { rows: topics } = await client.query('select id, slug from topics')
  const topicId = new Map(topics.map((t) => [t.slug, t.id]))
  let inserted = 0
  let updated = 0

  for (const proposal of proposals) {
    const values = [
      owner.id,
      topicId.get(proposal.topic),
      proposal.question,
      proposal.region,
      JSON.stringify(proposal.options),
      proposal.source_of_truth,
      proposal.resolution_criteria,
      proposal.cutoff_at,
      proposal.resolves_at,
      proposal.status,
      proposal.moderator_notes ?? null,
    ]
    if (!values[1]) throw new Error(`Missing topic ${proposal.topic}`)

    const { rows: existing } = await client.query('select id from poll_proposals where question = $1 limit 1', [proposal.question])
    if (existing.length) {
      await client.query(
        `update poll_proposals
            set proposed_by = $1, topic_id = $2, question = $3, region = $4, options = $5::jsonb,
                source_of_truth = $6, resolution_criteria = $7, cutoff_at = $8, resolves_at = $9,
                status = $10, moderator_notes = $11
          where id = $12`,
        [...values, existing[0].id],
      )
      updated++
    } else {
      await client.query(
        `insert into poll_proposals
           (proposed_by, topic_id, question, region, options, source_of_truth, resolution_criteria,
            cutoff_at, resolves_at, status, moderator_notes)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)`,
        values,
      )
      inserted++
    }
  }

  await client.query('commit')
  console.log(`SEED_OK launch-proposals owner=${owner.handle}${owner.created ? ' (created)' : ''} inserted=${inserted} updated=${updated}`)
} catch (err) {
  try { await client.query('rollback') } catch {}
  console.error('SEED_FAIL launch-proposals:', err.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
