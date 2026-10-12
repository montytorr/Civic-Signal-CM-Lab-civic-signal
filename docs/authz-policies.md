# CivicSignal authorization rules

CivicSignal no longer uses Supabase. The database is plain Postgres. Only the server (the Next.js
web app and the resolver) reaches it, over `DATABASE_URL`. Row-level security is gone: the
baseline migration (`packages/db/migrations/001_baseline.sql`) creates no policies. **Every
access rule is now a check in server code.**

This document restates every RLS policy from the Supabase-era migrations (002, 008 and 009) as an
explicit rule, so each one can be built as a server check with a test. It also lists the
operations the old policies denied by default, the rule for poll secret keys (S1), and the rules
for the new auth tables.

## Reading the rules

- **Actor.** *Anyone* means any request, signed in or not (Supabase `anon` and `authenticated`;
  none of the old policies had a `TO` clause). *Signed-in user* means a request with a valid
  session (a `sessions` row whose `expires_at` is in the future). *U* is that session's
  `user_id`. `users.id = profiles.id`, so every old `auth.uid()` is now *U*.
- **Old expression** is the policy as written. In Postgres an `UPDATE` policy with no
  `WITH CHECK` also applies its `USING` expression to the new row. The rules below spell this out.
- **Server-internal** means code that acts for the system, not for a request's user: the
  resolver, migrations, and trusted steps inside a route that has already passed its own checks.
  Supabase's `service_role` key bypassed RLS entirely. Server-internal code keeps that power, so
  every user-facing route must apply the rules here before it reads or writes.
- Admin is now `users.is_admin`. It used to be `profiles.is_admin` (old `006_admin_role.sql`);
  it moved off the public profile row.

## Policy rules (P1–P24)

One rule per former `CREATE POLICY`, in migration order.

| # | Table | Operation | Who may | Condition | Old policy (migration) / old expression |
|---|---|---|---|---|---|
| P1 | `topics` | SELECT | Anyone | All rows. | "Topics are publicly readable" (002) / `using (true)` |
| P2 | `profiles` | SELECT | Anyone | All rows, all columns (`id`, `handle`, `verified`, `verified_at`, `created_at`). | "Profiles are publicly readable" (002) / `using (true)` |
| P3 | `profiles` | UPDATE | Signed-in user | Only the row with `id = U`, and the updated row must still have `id = U` (the id cannot change). | "Users can update own profile" (002) / `using (auth.uid() = id)` |
| P4 | `profiles` | INSERT | Signed-in user | Only a row with `id = U`. In practice the `on_user_created_profile` trigger now creates it (see Profile bootstrap). | "Users can insert own profile" (002) / `with check (auth.uid() = id)` |
| P5 | `polls` | SELECT | Anyone | Only rows with `status in ('active', 'closed', 'resolved')`. `draft` and `disputed` polls are not public. | "Active polls are publicly readable" (002) / `using (status in ('active', 'closed', 'resolved'))` |
| P6 | `polls` | SELECT, INSERT, UPDATE, DELETE | Server-internal only | Any row. For a user-facing request this means an admin (`users.is_admin = true` for U) acting through an admin route. This is the only rule that lets anyone read `draft` and `disputed` polls or write `polls`. | "Admins can manage polls" (002) / `for all using (auth.jwt() ->> 'role' = 'service_role')` |
| P7 | `votes` | INSERT | Signed-in user | The new row must have `user_id = U`. | "Users can insert own vote" (002) / `with check (auth.uid() = user_id)` |
| P8 | `votes` | SELECT | Signed-in user | Only rows with `user_id = U`. Nobody else's votes (`encrypted_answer`, `answer`, `receipt_hash`) are readable by a user. | "Users can read own votes" (002) / `using (auth.uid() = user_id)` |
| P9 | `reputation_events` | SELECT | Anyone | All rows. | "Reputation events are publicly readable" (002) / `using (true)` |
| P10 | `user_topic_reputation` | SELECT | Anyone | All rows. | "User reputation is publicly readable" (002) / `using (true)` |
| P11 | `audit_commitments` | SELECT | Anyone | All rows. They contain only public material: a poll's secret key is never here (S1). | "Audit commitments are publicly readable" (002) / `using (true)` |
| P12 | `disputes` | SELECT | Anyone | All rows. | "Disputes are publicly readable" (002) / `using (true)` |
| P13 | `disputes` | INSERT | Signed-in user | The new row must have `flagged_by = U`. The policy checked nothing else (its comment mentions reputation, but the expression does not test it). | "Authenticated users can create disputes" (002) / `with check (auth.uid() = flagged_by)` |
| P14 | `invites` | SELECT | Signed-in user | Only rows where `created_by = U` or `used_by = U`. | "Users can read own invites" (002) / `using (auth.uid() = created_by or auth.uid() = used_by)` |
| P15 | `panel_members` | SELECT | Anyone | All rows. | "Panel memberships are publicly readable" (008) / `using (true)` |
| P16 | `dispute_evidence` | SELECT | Anyone | All rows. | "Dispute evidence is publicly readable" (008) / `using (true)` |
| P17 | `dispute_evidence` | INSERT | Signed-in user | The new row must have `submitted_by = U`. | "Authenticated users can submit dispute evidence" (008) / `with check (auth.uid() = submitted_by)` |
| P18 | `dispute_reviews` | SELECT | Anyone | All rows. | "Dispute reviews are publicly readable" (008) / `using (true)` |
| P19 | `dispute_reviews` | INSERT | Signed-in user | The new row must have `reviewer_id = U`. The policy did not check panel membership, despite its name. The route check R4 does. | "Panelists can submit own dispute reviews" (008) / `with check (auth.uid() = reviewer_id)` |
| P20 | `source_templates` | SELECT | Anyone | All rows. | "Source templates are publicly readable" (009) / `using (true)` |
| P21 | `poll_proposals` | SELECT | Anyone | All rows, including `moderator_notes`, `appeal_reason` and rejected proposals. | "Poll proposals are publicly readable" (009) / `using (true)` |
| P22 | `poll_proposals` | INSERT | Signed-in user | The new row must have `proposed_by = U`. The policy did not check verification, despite its name. The route check R2 does. | "Verified users can create own poll proposals" (009) / `with check (auth.uid() = proposed_by)` |
| P23 | `poll_proposals` | UPDATE | Signed-in user | Only rows with `proposed_by = U` and `status = 'pending'`. The updated row must still have `proposed_by = U` and `status = 'pending'`, so the proposer cannot change the owner or the status. Revision and appeal transitions are route-level workflow (R6), not this rule. | "Users can update own pending poll proposals" (009) / `using (auth.uid() = proposed_by and status = 'pending')` |
| P24 | `poll_results` | SELECT | Anyone | Only rows whose poll has `status = 'resolved'`. Answer totals of open, closed, draft or disputed polls are not public. | New with sealed votes (no Supabase policy): resolution writes these aggregates instead of storing per-voter answers. |

Total: **24 rules**. Old 002 had 14 policies, 008 had 5 and 009 had 4; P24 is new.

## Poll secret keys (S1)

**S1. `poll_secrets` is server-only. No route reads it on behalf of a caller, and nothing
returns or logs its contents.** It holds each poll's NaCl `secret_key` (one row per poll,
cascade-deleted with the poll). `votes` rows carry `user_id`, so the key would de-anonymize
every ballot. The product only ever reveals aggregates after cutoff.

- **Writers:** admin poll creation. That is `POST /api/admin/polls`, and `PATCH
  /api/admin/proposals/[id]` when approving a proposal creates the poll. Both insert
  `poll_secrets (poll_id, secret_key)` in the same transaction as the poll. One more writer
  provisions a keypair for a public poll that has none (the seeded launch polls, which a migration
  cannot give NaCl keys): the vote route, on the poll's first vote, through
  `ensurePollPublicKey` in `apps/web/app/lib/polls.ts`. It inserts the secret and publishes the
  public key without reading or returning the secret.
- **Readers:** the resolver (`services/resolver`) and the admin resolution route
  (`POST /api/admin/polls/[id]/resolve`). The resolution route decrypts ballots to tally them
  after passing R3. It uses the key in memory only and never returns it.
- **Votes are sealed server-side and stored only sealed.** The vote route checks the answer is one
  of the poll's options and encrypts it to the poll's public key (public material, so S1 holds);
  `votes` has no plaintext column. Resolution decrypts in memory and writes only answer totals
  (`poll_results`, P24) and each voter's correctness (`reputation_events`, P9). Both resolution
  paths use the same function, `scoreResolvedPoll` in `packages/db`.
- **`audit_commitments` stays public (P11) and holds only public material:** the public key,
  hashes and Merkle roots. The schema enforces this. The constraint
  `audit_commitments_no_secret_key` rejects any `metadata` that has a `secretKey` key.

**CIVIC-6 must change these routes.** `apps/web/app/api/admin/polls/route.ts` and
`apps/web/app/api/admin/proposals/[id]/route.ts` must stop putting `secretKey` into
`audit_commitments.metadata` and insert it into `poll_secrets` instead. As they are written
today, the database rejects their insert. `apps/web/app/api/admin/polls/[id]/resolve/route.ts`
must read the key from `poll_secrets`.

Why: under Supabase, both routes wrote the secret key into `metadata`, and P11 made it readable
by anyone. Anyone could decrypt every sealed vote of an open poll and link it to a user.

## Default-deny rules (D1–D17)

With RLS enabled, any operation that no policy allowed was refused for `anon` and
`authenticated`. These refusals are part of the old contract too. For a user-facing request,
each operation below is **server-internal only**. A route may perform it only after its own
check (R-rules), never directly on behalf of the caller.

| # | Table | Operations denied to users |
|---|---|---|
| D1 | `topics` | INSERT, UPDATE, DELETE |
| D2 | `profiles` | DELETE; INSERT or UPDATE of any row other than `id = U` |
| D3 | `polls` | everything except P5 reads (see P6) |
| D4 | `votes` | UPDATE, DELETE; SELECT of other users' votes; INSERT for another user |
| D5 | `reputation_events` | INSERT, UPDATE, DELETE (resolver only) |
| D6 | `user_topic_reputation` | INSERT, UPDATE, DELETE (resolver only) |
| D7 | `audit_commitments` | INSERT, UPDATE, DELETE (resolver and admin routes only) |
| D8 | `disputes` | UPDATE, DELETE (status changes are admin route R5) |
| D9 | `invites` | INSERT, UPDATE, DELETE; SELECT of invites the user neither created nor used |
| D10 | `panel_members` | INSERT, UPDATE, DELETE (admin route R7) |
| D11 | `dispute_evidence` | UPDATE, DELETE; INSERT for another user |
| D12 | `dispute_reviews` | UPDATE, DELETE; INSERT for another user |
| D13 | `source_templates` | INSERT, UPDATE, DELETE |
| D14 | `poll_proposals` | DELETE; UPDATE outside P23 (other users' proposals, non-pending proposals, status changes) except the route workflows R6 and R8 |
| D15 | `schema_migrations` | everything (migrator only) |
| D16 | `poll_secrets` | everything: SELECT, INSERT, UPDATE, DELETE. There is no read route. Admin poll creation writes it; the resolver and the resolution route read it server-side (S1). |
| D17 | `poll_results` | INSERT, UPDATE, DELETE (resolution only: the admin resolution route and the resolver, through `scoreResolvedPoll`); SELECT of results of a poll that is not resolved (P24) |

## Auth tables (A1–A5)

`users`, `sessions` and `email_tokens` are new. Supabase kept their equivalents in its `auth`
schema, which clients could not read directly.

| # | Rule |
|---|---|
| A1 | `users`, `sessions` and `email_tokens` are server-internal. No route returns their rows directly. |
| A2 | `users.password_hash`, `sessions.token_hash` and `email_tokens.token_hash` are never sent to a client or written to a log. The cookie carries the raw session token; the database stores only its hash. |
| A3 | A signed-in user may read their own `email`, `email_verified_at` and `is_admin`, and nobody else's. Public identity is the profile (P2). |
| A4 | Only server-internal code sets `users.is_admin`. There is no self-service path. On a fresh database, promote the first admin by hand: `update users set is_admin = true where email = '<email>';` (old 006 promoted the handle `cedar-thrush-04`, which does not exist on the fresh database). |
| A5 | A session is valid only while `expires_at > now()`. An `email_tokens` row is usable once (`used_at is null`), before `expires_at`, and only for its `purpose` (`verify` or `reset`). A successful reset should end the user's other sessions. Before an email is verified its account is untrusted (anyone can sign up with any email): signing up again for an unverified email replaces the password and ends its sessions, and confirming the email needs the account's current password and ends every session before starting the verifier's. |

## Route checks that were never RLS (R1–R8)

The old web routes used the service-role client, which bypassed RLS, and enforced these checks
in code instead. They are listed so that CIVIC-6 keeps them; the list is not exhaustive. Read
the routes for their full validation.

| # | Route | Check |
|---|---|---|
| R1 | `POST /api/polls/[id]/vote` | Signed in, and `profiles.verified = true` for U (403 `UNVERIFIED` otherwise). |
| R2 | `POST /api/proposals` | Signed in, and `profiles.verified = true` for U. |
| R3 | `admin/polls` (GET, POST), `admin/polls/[id]/publish`, `admin/polls/[id]/resolve` | Signed in and admin. |
| R4 | `POST /api/admin/disputes/[id]/reviews` | Signed in; dispute `status in ('open', 'reviewing')`; U is admin **or** an `active` `panel_members` row for the poll's topic. |
| R5 | `PATCH /api/admin/disputes/[id]` | Signed in and admin. |
| R6 | `PATCH /api/proposals/[id]` | Signed in, and U is the proposer. `appeal`: only from `rejected`, and sets `status = 'appealed'`. `revise`: only from `changes_requested` or `rejected`, and sets `status = 'pending'` and bumps `revision_count`. |
| R7 | `POST /api/admin/panels/invite` | Signed in and admin. |
| R8 | `PATCH /api/admin/proposals/[id]` | Signed in and admin. |

**Gap:** `GET /api/admin/polls/[id]` only checks that the caller is signed in. It used the
user-scoped client, so P5 hid draft and disputed polls from non-admins. A server-side port that
reads polls directly would expose drafts to any signed-in user unless it adds the admin check
(R3) or applies P5.

## Profile bootstrap

Old `007_auth_profile_bootstrap.sql` created a profile for each new Supabase auth user. That is
now **a trigger on `users`**, not a step the web signup must do:

- `on_user_created_profile` (after insert on `users`) inserts `profiles (id, handle, verified,
  verified_at)`. The handle comes from `generate_profile_handle()`, and `verified` mirrors
  `email_verified_at`. To use a handle the signup chose, update `profiles.handle` in the same
  transaction after inserting the user.
- `on_user_email_verified` (after update of `email_verified_at`, from null to a value) sets
  `profiles.verified = true` and `verified_at`. The old Supabase auth callback did this in code.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | web, resolver, migrator | Postgres connection URL for the app role, e.g. `postgresql://civicsignal:…@clawdius-postgres:5432/civicsignal`. |
| `TEST_DATABASE_URL` | tests only | A Postgres server where tests may create and drop throwaway databases. If unset, the database tests are skipped. `pnpm --filter @civicsignal/db test:pg` starts a throwaway postgres:17-alpine and sets it. |
| `SESSION_SECRET` | web (CIVIC-6) | Signs or derives session cookie values. |
| `RESEND_API_KEY` | web (CIVIC-6) | Resend API key for verification and reset email. |
| `EMAIL_FROM` | web (CIVIC-6) | Sender address for those emails. |
| `APP_URL` | web (CIVIC-6) | Public base URL for links in emails, e.g. `https://civicsignal.montytorr.com`. |

Retired: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Run migrations with `DATABASE_URL=… pnpm --filter @civicsignal/db db:migrate`. The migrator
applies each pending file in its own transaction, records it in `schema_migrations (filename,
applied_at)`, and does nothing on a second run.
