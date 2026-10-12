# CivicSignal Launch QA

Status: active checklist  
Last updated: 2026-05-13

## Latest gate run — 2026-05-14 UTC

Result: **pass**

- `corepack pnpm -r test` — passed (crypto 33 tests, web 48 tests)
- `corepack pnpm --filter @civicsignal/web typecheck` — passed
- `corepack pnpm --filter @civicsignal/web build` — passed
- `node scripts/smoke-proposal-lifecycle.mjs` — `SMOKE_OK proposal-lifecycle`
- `node scripts/smoke-trusted-panels.mjs` — `SMOKE_OK trusted-panels`
- Production route sweep — 11/11 public launch routes returned HTTP 200.

Follow-up shipped from this pass:

- `/reports` now includes the beta invite funnel: issued, accepted, and open invites alongside poll/proposal/dispute/review metrics.
- `/verify` links a machine-readable `/api/audit/export` JSON snapshot.
- `/invites` frames invites as an early-cohort operating loop rather than just code generation.
- Header/footer navigation exposes signal reports and audit export.
- Production public routes checked: `/`, `/polls`, `/proposals`, `/methodology`, `/roadmap`, `/verify`, `/panels`, `/leaderboard`, `/archive`, `/demo`, `/reputation`.

This checklist is the minimum bar before inviting a wider public beta cohort. CivicSignal is a trust product; broken trust flows are launch blockers, not cosmetic bugs.

## Required gates

Run from the repository root. The smoke scripts drive the HTTP API of a running web app (`BASE_URL`, default `http://localhost:3000`) with real sessions, and use its Postgres database (`DATABASE_URL`) only to read a topic, verify their throwaway accounts, promote their admin, set up topic reputation, and clean up:

```bash
corepack pnpm -r test
corepack pnpm --filter @civicsignal/db test:pg
corepack pnpm --filter @civicsignal/resolver test:pg
corepack pnpm --filter @civicsignal/web test:pg
corepack pnpm --filter @civicsignal/web typecheck
corepack pnpm --filter @civicsignal/web build
BASE_URL=https://civicsignal.montytorr.com DATABASE_URL=postgresql://... node scripts/smoke-proposal-lifecycle.mjs
BASE_URL=https://civicsignal.montytorr.com DATABASE_URL=postgresql://... node scripts/smoke-trusted-panels.mjs
```

The `test:pg` scripts start a throwaway Postgres container, so they need Docker. `BASE_URL` must have the same origin as the app's `APP_URL`: the app rejects writes whose `Origin` header does not match. Each smoke script signs up and logs in three accounts, which stays under the auth rate limits (per IP: 10 signups and 30 login attempts per 15 minutes).

Expected smoke output:

- `SMOKE_OK proposal-lifecycle ...`
- `SMOKE_OK trusted-panels ...`

Each smoke script must clean up every synthetic poll, poll secret, proposal, vote, audit commitment, reputation event, topic reputation row, panel membership, dispute, evidence row, review row, profile, session, and user account it creates, and prints `SMOKE_FAIL` if it cannot. Synthetic `Proposal lifecycle smoke test ...` or `Trusted Panels smoke test ...` rows, or `@smoke.civicsignal.test` accounts, in production are a failure.

## Live route checks

These routes should return 200 in production:

- `/`
- `/polls`
- `/proposals`
- `/methodology`
- `/roadmap`
- `/verify`
- `/panels`
- `/leaderboard`
- `/archive`
- `/demo`
- `/reputation`

These authenticated routes should redirect unauthenticated visitors to sign-in rather than leaking privileged UI:

- `/admin`
- `/invites`
- `/panels/me`

## Launch content bar

- Active poll feed has at least 25 serious, non-duplicate polls.
- Each poll has neutral wording, source-of-truth, cutoff, resolution timing, and explicit resolution criteria.
- Public methodology, roadmap, verify, panels, README, and docs agree with shipped behavior.
- No public page says the MVP/schema/spec is merely an unbuilt draft.

## First beta operating loop

1. Invite 50-200 early users.
2. Moderate incoming proposals daily.
3. Resolve eligible polls against declared sources.
4. Publish a weekly public signal report summarizing participation, resolved outcomes, disputes, and methodology changes.
5. Treat stale methodology, hidden broken buttons, or synthetic QA data as launch blockers.
