# CivicSignal MVP Schema & Reputation Model

Status: implemented baseline / migration-backed v0.7
Created: 2026-05-03

## Design Principles

- Off-chain first.
- Append-only where trust matters.
- Pseudonymous public identity; private verification state.
- Active vote splits hidden until cutoff.
- Topic-specific, non-transferable reputation.
- Correct outcomes increase reputation; incorrect outcomes do not increase core reputation in MVP.

## Core Tables

### users

- `id` uuid primary key
- `email_hash` text unique not null
- `phone_hash` text nullable
- `public_handle` text unique not null
- `display_name` text nullable
- `avatar_url` text nullable
- `created_at` timestamptz not null
- `updated_at` timestamptz not null
- `status` enum: `active`, `suspended`, `deleted`

### verification_profiles

- `user_id` uuid primary key references users(id)
- `email_verified_at` timestamptz nullable
- `phone_verified_at` timestamptz nullable
- `verification_level` enum: `none`, `basic`, `strong`, `institutional`
- `proof_provider` text nullable
- `proof_reference_hash` text nullable
- `device_fingerprint_hash` text nullable
- `sybil_risk_score` numeric default 0
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

### topics

- `id` uuid primary key
- `slug` text unique not null
- `name` text not null
- `description` text nullable
- `parent_topic_id` uuid nullable references topics(id)

Initial topic slugs:

- `elections-governance`
- `geopolitics`
- `economy-markets`
- `climate-energy`
- `technology-ai`
- `public-health`
- `local-civic`

### polls

- `id` uuid primary key
- `slug` text unique not null
- `question` text not null
- `description` text nullable
- `topic_id` uuid references topics(id)
- `region` text default `global`
- `status` enum: `draft`, `active`, `cutoff`, `resolving`, `resolved`, `void`
- `cutoff_at` timestamptz not null
- `resolution_due_at` timestamptz not null
- `source_of_truth_label` text not null
- `source_of_truth_url` text nullable
- `resolution_criteria` text not null
- `created_by` uuid references users(id)
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

### poll_options

- `id` uuid primary key
- `poll_id` uuid references polls(id)
- `label` text not null
- `sort_order` integer not null
- `is_winning_option` boolean nullable

### votes

- `id` uuid primary key
- `poll_id` uuid references polls(id)
- `user_id` uuid references users(id)
- `option_id` uuid references poll_options(id)
- `sealed_choice_hash` text not null
- `receipt_id` uuid not null
- `receipt_signature` text not null
- `submitted_at` timestamptz not null
- `status` enum: `valid`, `invalidated`
- unique(`poll_id`, `user_id`)

As built: ballots are encrypted, and no plaintext choice is stored. The `votes` table in `packages/db/migrations/001_baseline.sql` has `encrypted_answer` (the answer sealed server-side to the poll's NaCl public key, which is published in `audit_commitments`) and `receipt_hash`, with no `option_id` or plaintext answer column. The poll's secret key lives only in the server-only `poll_secrets` table. At resolution the ballots are decrypted in memory, and only two things are written: answer totals to `poll_results (poll_id, answer, votes)`, which are public once the poll is resolved, and each voter's correctness to `reputation_events`. Before resolution a voter sees "sealed"; after it, "matched" or "not matched". See `docs/authz-policies.md` (S1, P24, D17).

### vote_receipts

- `id` uuid primary key
- `vote_id` uuid references votes(id)
- `poll_id` uuid references polls(id)
- `user_id` uuid references users(id)
- `receipt_payload_hash` text not null
- `signature` text not null
- `created_at` timestamptz not null

Receipt payload should include poll id, user id hash, option hash, submitted timestamp, and app signing key id.

### poll_resolutions

- `id` uuid primary key
- `poll_id` uuid unique references polls(id)
- `winning_option_id` uuid nullable references poll_options(id)
- `status` enum: `resolved`, `void`
- `evidence_urls` jsonb not null default `[]`
- `resolution_note` text not null
- `resolved_by` uuid references users(id)
- `resolved_at` timestamptz not null

### reputation_balances

- `user_id` uuid references users(id)
- `topic_id` uuid references topics(id)
- `score` numeric not null default 0
- `correct_count` integer not null default 0
- `resolved_count` integer not null default 0
- `last_updated_at` timestamptz not null
- primary key (`user_id`, `topic_id`)

### reputation_events

- `id` uuid primary key
- `user_id` uuid references users(id)
- `poll_id` uuid references polls(id)
- `topic_id` uuid references topics(id)
- `event_type` enum: `correct_resolution_award`, `void_noop`, `manual_adjustment`
- `delta` numeric not null
- `reason` text not null
- `created_at` timestamptz not null
- `created_by` uuid nullable references users(id)

### audit_events

- `id` uuid primary key
- `entity_type` text not null
- `entity_id` uuid not null
- `event_type` text not null
- `actor_user_id` uuid nullable references users(id)
- `payload_hash` text not null
- `payload` jsonb not null
- `created_at` timestamptz not null

### audit_commitments

- `id` uuid primary key
- `commitment_type` enum: `votes_batch`, `resolution_batch`, `reputation_batch`
- `range_start_at` timestamptz not null
- `range_end_at` timestamptz not null
- `merkle_root` text not null
- `item_count` integer not null
- `chain_id` text nullable
- `tx_hash` text nullable
- `created_at` timestamptz not null

## Reputation Formula — MVP

Keep this deliberately boring:

```text
base_award = 10
participation_quality_multiplier = 1.0 for MVP
reputation_delta = base_award * participation_quality_multiplier
```

Rules:

1. Only valid votes submitted before cutoff are eligible.
2. Only votes matching the resolved winning option receive `+10` in the poll topic.
3. Incorrect votes receive `0` core reputation change.
4. Voided polls produce no score changes.
5. `resolved_count` increments for every valid vote on a resolved non-void poll.
6. `correct_count` increments only for correct votes.
7. Accuracy is derived: `correct_count / resolved_count`.

Future formula can add difficulty, early-confidence, and reputation decay, but MVP should avoid gaming incentives until real behavior is observed.

## API Endpoints — MVP

Public:

- `GET /api/polls`
- `GET /api/polls/:slug`
- `GET /api/polls/:slug/results` — only returns aggregate before cutoff as hidden/unavailable
- `GET /api/topics`
- `GET /api/methodology`

Participant:

- `POST /api/polls/:id/votes`
- `GET /api/me/votes`
- `GET /api/me/reputation`
- `GET /api/receipts/:id`

Admin:

- `POST /api/admin/polls`
- `PATCH /api/admin/polls/:id`
- `POST /api/admin/polls/:id/resolve`
- `POST /api/admin/polls/:id/void`

Audit:

- `GET /api/audit/resolved-polls/export`
- `GET /api/audit/commitments`

## Required Tests Before Beta

- One vote per verified user per poll.
- Votes after cutoff are rejected.
- Active poll aggregate percentages are not exposed.
- Cutoff polls reveal aggregate counts.
- Correct resolution awards only matching voters.
- Incorrect resolution awards zero.
- Voided poll awards zero.
- Receipt signature verifies against payload hash.
- Reputation update is idempotent if resolution job retries.
