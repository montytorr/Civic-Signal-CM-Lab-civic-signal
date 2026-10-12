// @vitest-environment node
// Structural checks on the server code: the default-deny rules (D1–D17), poll secrets (S1), the
// auth tables (A1, A2, A4) and the route checks. With no row-level security, a write to a table is
// allowed only in the files listed here, each of which runs its own check first. A new write
// anywhere else fails this test until it is reviewed against docs/authz-policies.md.
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../..')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })

const SOURCES = new Map(
  [...walk(join(ROOT, 'app')), join(ROOT, 'middleware.ts')].map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')]),
)

type Op = 'insert' | 'update' | 'delete' | 'select'

const PATTERNS: Record<Op, (table: string) => RegExp> = {
  insert: (t) => new RegExp(`insert\\s+into\\s+(public\\.)?"?${t}"?\\b|insertRows?\\(\\s*'${t}'`, 'i'),
  update: (t) => new RegExp(`\\bupdate\\s+(public\\.)?"?${t}"?\\s+set\\b`, 'i'),
  delete: (t) => new RegExp(`delete\\s+from\\s+(public\\.)?"?${t}"?\\b`, 'i'),
  select: (t) => new RegExp(`\\b(from|join)\\s+(public\\.)?"?${t}"?\\b`, 'i'),
}

/** The files that perform an operation on a table. */
const filesThat = (op: Op, table: string) =>
  [...SOURCES].filter(([, text]) => PATTERNS[op](table).test(text)).map(([file]) => file).sort()

const ROUTES = {
  adminPolls: 'app/api/admin/polls/route.ts',
  publish: 'app/api/admin/polls/[id]/publish/route.ts',
  resolve: 'app/api/admin/polls/[id]/resolve/route.ts',
  adminDispute: 'app/api/admin/disputes/[id]/route.ts',
  reviews: 'app/api/admin/disputes/[id]/reviews/route.ts',
  panelInvite: 'app/api/admin/panels/invite/route.ts',
  adminProposal: 'app/api/admin/proposals/[id]/route.ts',
  vote: 'app/api/polls/[id]/vote/route.ts',
  dispute: 'app/api/polls/[id]/dispute/route.ts',
  invites: 'app/api/invites/route.ts',
  redeem: 'app/api/invites/[code]/route.ts',
  proposals: 'app/api/proposals/route.ts',
  proposal: 'app/api/proposals/[id]/route.ts',
}
const POLLS_LIB = 'app/lib/polls.ts'

// The shared scorer in packages/db (resolution writes go through it) and the web files that call it.
const SCORER = readFileSync(join(ROOT, '../../packages/db/src/resolution.ts'), 'utf8')
const SCORER_USERS = [...SOURCES].filter(([, text]) => /scoreResolvedPoll\(/.test(text)).map(([file]) => file).sort()
const AUTH_SERVICE = 'app/lib/auth/service.ts'

const writes = (table: string) => ({
  insert: filesThat('insert', table),
  update: filesThat('update', table),
  delete: filesThat('delete', table),
})

const sorted = (...files: string[]) => [...files].sort()

describe('default deny: who may write each table', () => {
  it('D1: no route writes topics', () => {
    expect(writes('topics')).toEqual({ insert: [], update: [], delete: [] })
  })

  it('D2: profiles are never deleted or inserted by a route; only signup sets the new user’s own handle', () => {
    expect(writes('profiles')).toEqual({ insert: [], update: [AUTH_SERVICE], delete: [] })
  })

  it('D3: polls are written only by admin routes (and R4 panel review marking a poll disputed)', () => {
    expect(writes('polls')).toEqual({
      insert: [POLLS_LIB],
      update: sorted(ROUTES.publish, ROUTES.resolve, ROUTES.adminDispute, ROUTES.reviews),
      delete: [],
    })
  })

  it('D4: votes are only inserted, by the vote route; never updated or deleted', () => {
    expect(writes('votes')).toEqual({ insert: [ROUTES.vote], update: [], delete: [] })
  })

  it('D5: reputation events are written only by resolution (the shared scorer, from the resolve route)', () => {
    expect(writes('reputation_events')).toEqual({ insert: [], update: [], delete: [] })
    expect(SCORER_USERS).toEqual([ROUTES.resolve])
    expect(SCORER).toMatch(/insertRows\('reputation_events'/)
  })

  it('D6: topic reputation is written only by resolution (the shared scorer)', () => {
    expect(writes('user_topic_reputation')).toEqual({ insert: [], update: [], delete: [] })
    expect(SCORER).toMatch(/insert into user_topic_reputation/)
  })

  it('D7: audit commitments are written only by admin poll creation and resolution', () => {
    expect(writes('audit_commitments')).toEqual({ insert: sorted(POLLS_LIB, ROUTES.resolve), update: [], delete: [] })
  })

  it('D8: disputes are inserted by the dispute route; status changes only in the admin and review routes', () => {
    expect(writes('disputes')).toEqual({ insert: [ROUTES.dispute], update: sorted(ROUTES.adminDispute, ROUTES.reviews), delete: [] })
  })

  it('D9: invites are written only by the invite routes, never deleted', () => {
    expect(writes('invites')).toEqual({ insert: [ROUTES.invites], update: [ROUTES.redeem], delete: [] })
  })

  it('D10: panel membership is written only by the admin invite route', () => {
    expect(writes('panel_members')).toEqual({ insert: [ROUTES.panelInvite], update: [], delete: [] })
  })

  it('D11: dispute evidence is only inserted, by the dispute route', () => {
    expect(writes('dispute_evidence')).toEqual({ insert: [ROUTES.dispute], update: [], delete: [] })
  })

  it('D12: dispute reviews are only inserted (or replaced by their reviewer), by the review route', () => {
    expect(writes('dispute_reviews')).toEqual({ insert: [ROUTES.reviews], update: [], delete: [] })
    expect(SOURCES.get(ROUTES.reviews)).toMatch(/on conflict \(dispute_id, reviewer_id\) do update/)
  })

  it('D13: no route writes source templates', () => {
    expect(writes('source_templates')).toEqual({ insert: [], update: [], delete: [] })
  })

  it('D14: proposals are inserted by the proposal route, updated only by the proposer (R6) and moderation (R8) routes, never deleted', () => {
    expect(writes('poll_proposals')).toEqual({
      insert: [ROUTES.proposals],
      update: sorted(ROUTES.proposal, ROUTES.adminProposal),
      delete: [],
    })
  })

  it('D15: the web app never touches schema_migrations', () => {
    expect([...SOURCES].filter(([, text]) => /schema_migrations/.test(text)).map(([file]) => file)).toEqual([])
  })

  it('D16: poll_secrets is inserted only by lib/polls (admin creation, first-vote provisioning) and read only by resolution', () => {
    expect(writes('poll_secrets')).toEqual({ insert: [POLLS_LIB], update: [], delete: [] })
    expect(filesThat('select', 'poll_secrets')).toEqual([ROUTES.resolve])
  })

  it('D17: poll results are written only by the shared scorer and read only through the P24 filter', () => {
    expect(writes('poll_results')).toEqual({ insert: [], update: [], delete: [] })
    expect(SCORER).toMatch(/insertRows\('poll_results'/)
    expect(filesThat('select', 'poll_results')).toEqual(['app/lib/queries.ts'])
    expect(SOURCES.get('app/lib/queries.ts')).toMatch(/from poll_results r join polls p on p\.id = r\.poll_id\s+where r\.poll_id = \$1 and \$\{RESULTS_VISIBLE\('p'\)\}/)
  })
})

describe('poll secrets', () => {
  it('S1: only admin poll creation and proposal approval create polls; the vote route only provisions a missing keypair', () => {
    const importers = [...SOURCES].filter(([, text]) => /from '@\/lib\/polls'/.test(text)).map(([file]) => file).sort()
    expect(importers).toEqual(sorted(ROUTES.adminPolls, ROUTES.adminProposal, ROUTES.vote))
    expect(SOURCES.get(ROUTES.vote)).toMatch(/import \{ ensurePollPublicKey \} from '@\/lib\/polls'/)
    expect(SOURCES.get(POLLS_LIB)).not.toMatch(/select[^`']*secret_key/i)
  })

  it('S1: votes are sealed server-side and stored without a plaintext answer; the answer is never logged', () => {
    const vote = SOURCES.get(ROUTES.vote) ?? ''
    expect(vote).toMatch(/encryptVote\(answer, await ensurePollPublicKey\(client, pollId\)\)/)
    expect(vote).toMatch(/insert into votes \(poll_id, user_id, encrypted_answer, receipt_hash\)/)
    expect(vote).not.toMatch(/encryptedAnswer\s*}\s*=\s*body|body\.encryptedAnswer/)
    expect(vote).not.toMatch(/console\./)
    for (const [file, text] of SOURCES) expect(text, file).not.toMatch(/\bv\.answer\b|votes set answer|answer = \$\d+ where id/)
  })

  it('S1: routes that touch secrets pass their responses through assertNoSecretKey', () => {
    for (const file of [ROUTES.adminPolls, ROUTES.adminProposal, ROUTES.resolve]) {
      expect(SOURCES.get(file), file).toMatch(/NextResponse\.json\(assertNoSecretKey\(/)
    }
  })

  it('S1: no code puts a secretKey into audit_commitments metadata', () => {
    expect([...SOURCES].filter(([, text]) => /secretKey\s*:/.test(text)).map(([file]) => file)).toEqual([])
  })

  it('S1: the secret key is never logged', () => {
    for (const [file, text] of SOURCES) {
      expect(text, file).not.toMatch(/console\.\w+\([^)]*secret/i)
    }
  })
})

describe('vote privacy: reputation is tiered for everyone but its owner', () => {
  // Every SQL string literal in the app that reads reputation_events or user_topic_reputation.
  const reputationSql = [...SOURCES].flatMap(([file, text]) =>
    [...text.matchAll(/`[^`]*`|'[^'\n]*'/g)]
      .filter((m) => /\b(reputation_events|user_topic_reputation)\b/.test(m[0]))
      .map((m) => {
        const before = text.slice(0, m.index)
        const owner = [...before.matchAll(/(?:export )?const (\w+) =/g)].at(-1)?.[1] ?? '(top level)'
        // What the statement exposes once tier expressions are taken out.
        const exposed = m[0].replace(/\$\{tier(Rank)?Sql\('[^']*'\)\}/g, 'TIER')
        return { file, owner, sql: m[0], exposed }
      }),
  )
  const RAW = /\b(score|delta|resolved_count|correct_count)\b/

  // Owner-only readers (they take the viewer and filter on viewer.id) and server-internal checks
  // that compare a score without returning it.
  const ALLOWED = new Set([
    'app/lib/queries.ts#getOwnReputation',
    'app/lib/queries.ts#getOwnContributions',
    'app/lib/queries.ts#matchedSql',
    'app/api/polls/[id]/dispute/route.ts#reputation', // the disputer's own score > 0, not returned
    'app/api/admin/panels/invite/route.ts#rep', // compared with a tier minimum, not returned
  ])

  it('P9: no public query reads reputation events', () => {
    const offenders = reputationSql
      .filter((q) => /\breputation_events\b/.test(q.sql) && !ALLOWED.has(`${q.file}#${q.owner}`))
      .map((q) => `${q.file}#${q.owner}`)
    expect(offenders).toEqual([])
  })

  it('P10: no public query selects an exact score or count; only tierSql/tierRankSql', () => {
    const offenders = reputationSql
      .filter((q) => RAW.test(q.exposed) && !ALLOWED.has(`${q.file}#${q.owner}`))
      .map((q) => `${q.file}#${q.owner}: ${q.exposed.replace(/\s+/g, ' ').slice(0, 120)}`)
    expect(offenders).toEqual([])
    expect(reputationSql.length).toBeGreaterThan(5)
  })

  it('P10: the owner-only readers are keyed on the viewer, and the public ones gate on the owner check', () => {
    const queries = SOURCES.get('app/lib/queries.ts') ?? ''
    expect(queries).toMatch(/export const getOwnReputation = \(viewer: Viewer\)[\s\S]*?\[viewer\.id\]/)
    expect(queries).toMatch(/export const getOwnContributions = \(viewer: Viewer\)[\s\S]*?\[viewer\.id\]/)
    expect(queries).toMatch(/canReadExactReputation\(viewer, userId\) \? getOwnReputation\(viewer\)/)
    expect(queries).toMatch(/canReadReputationEvents\(viewer, userId\) \? getOwnContributions\(viewer\)/)
    const callers = [...SOURCES].filter(([, text]) => /getOwn(Reputation|Contributions)\(/.test(text)).map(([file]) => file)
    expect(callers).toEqual(['app/lib/queries.ts'])
  })

  it('P10: public components show tiers, not scores', () => {
    for (const file of ['app/components/leaderboard-page.tsx', 'app/components/admin-page.tsx']) {
      expect(SOURCES.get(file), file).not.toMatch(/\.(score|correct_count|resolved_count)\b/)
    }
  })
})

describe('auth tables', () => {
  const AUTH_LIB = /^app\/lib\/auth\//

  it('A1: users, sessions and email_tokens are read and written only by lib/auth', () => {
    for (const table of ['users', 'sessions', 'email_tokens']) {
      for (const op of ['insert', 'update', 'delete', 'select'] as const) {
        const outside = filesThat(op, table).filter((file) => !AUTH_LIB.test(file))
        expect(outside, `${op} ${table}`).toEqual([])
      }
    }
  })

  it('A2: password and token hashes appear only in lib/auth, and lib/auth never logs them', () => {
    for (const [file, text] of SOURCES) {
      if (AUTH_LIB.test(file)) {
        expect(text, file).not.toMatch(/console\.\w+\([^)]*(password_hash|token_hash|passwordHash)/)
      } else {
        expect(text, file).not.toMatch(/password_hash|token_hash/)
      }
    }
  })

  it('A4: nothing sets users.is_admin', () => {
    for (const [file, text] of SOURCES) expect(text, file).not.toMatch(/is_admin\s*=\s*(true|\$)/i)
  })
})

describe('route checks', () => {
  const routeFiles = [...SOURCES.keys()].filter((file) => file.startsWith('app/') && file.endsWith('/route.ts'))

  it('every mutating route handler checks Origin (mutation wrapper)', () => {
    for (const file of routeFiles) {
      const text = SOURCES.get(file) ?? ''
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        if (new RegExp(`export const ${method}\\b`).test(text)) {
          expect(text, `${method} in ${file}`).toMatch(new RegExp(`export const ${method} = mutation\\(`))
        }
      }
      expect(text, file).not.toMatch(/export (async )?function (POST|PATCH|PUT|DELETE)/)
    }
  })

  it('P6: every admin route except panel review requires an admin', () => {
    const adminRoutes = routeFiles.filter((file) => file.startsWith('app/api/admin/') && file !== ROUTES.reviews)
    expect(adminRoutes.length).toBeGreaterThanOrEqual(7)
    for (const file of adminRoutes) {
      const text = SOURCES.get(file) ?? ''
      const handlers = text.match(/export const (GET|POST|PATCH|PUT|DELETE)\b/g) ?? []
      const checks = text.match(/requireAdmin\(await getRequestViewer\(req\)\)/g) ?? []
      expect(checks.length, file).toBe(handlers.length)
    }
  })

  it('R1: the vote route requires a verified user', () => expect(SOURCES.get(ROUTES.vote)).toMatch(/requireVerified\(/))
  it('R2: the proposal route requires a verified user', () => expect(SOURCES.get(ROUTES.proposals)).toMatch(/requireVerified\(/))
  it('R3: the admin poll routes require admin', () => {
    for (const file of [ROUTES.adminPolls, ROUTES.publish, ROUTES.resolve, 'app/api/admin/polls/[id]/route.ts']) {
      expect(SOURCES.get(file), file).toMatch(/requireAdmin\(/)
    }
  })
  it('R4: the review route checks the dispute status and panel membership', () =>
    expect(SOURCES.get(ROUTES.reviews)).toMatch(/assertCanReviewDispute\(viewer, dispute, !!panelist\)/))
  it('R5: the dispute status route requires admin', () => expect(SOURCES.get(ROUTES.adminDispute)).toMatch(/requireAdmin\(/))
  it('R6: the proposer route checks the proposer and the transition', () => {
    expect(SOURCES.get(ROUTES.proposal)).toMatch(/assertProposer\(viewer, current\)/)
    expect(SOURCES.get(ROUTES.proposal)).toMatch(/proposerTransition\(action, current\.status\)/)
  })
  it('R7: the panel invite route requires admin', () => expect(SOURCES.get(ROUTES.panelInvite)).toMatch(/requireAdmin\(/))
  it('R8: the moderation route requires admin', () => expect(SOURCES.get(ROUTES.adminProposal)).toMatch(/requireAdmin\(/))
})

// The retired hosted backend: spelled in two parts so a repo grep for its name stays empty.
const RETIRED = new RegExp(['supa', 'base'].join(''), 'i')

describe('no retired backend', () => {
  it('no source mentions it', () => {
    for (const [file, text] of SOURCES) expect(text, file).not.toMatch(RETIRED)
  })

  it('no secret or database setting is exposed through a NEXT_PUBLIC variable', () => {
    for (const [file, text] of SOURCES) {
      for (const name of text.match(/NEXT_PUBLIC_\w+/g) ?? []) expect(name, file).toBe('NEXT_PUBLIC_SITE_URL')
    }
  })

  it('client components never import the database or server-only auth', () => {
    for (const [file, text] of SOURCES) {
      if (!/^['"]use client['"]/.test(text)) continue
      expect(text, file).not.toMatch(/@civicsignal\/db|@\/lib\/(queries|auth\/(session|server|service|crypto|email-tokens)|polls)'/)
    }
  })
})

describe('every rule in docs/authz-policies.md has tests named by its id', () => {
  const doc = readFileSync(join(ROOT, '../../docs/authz-policies.md'), 'utf8')
  const ids = [...new Set(doc.match(/^\| ([PDR]\d+) \|/gm)?.map((m) => m.slice(2, -2)) ?? [])]
  ids.push('S1')
  const testText = (dir: string) => walk(join(ROOT, dir)).map((path) => readFileSync(path, 'utf8')).join('\n')
  const named = (text: string, id: string) => new RegExp(`it(\\.each\\([^)]*\\))?\\(\\s*['\`"]${id}:`).test(text)

  it('the document lists P1–P24, D1–D17 and R1–R8', () => {
    expect(ids.filter((id) => id.startsWith('P'))).toHaveLength(24)
    expect(ids.filter((id) => id.startsWith('D'))).toHaveLength(17)
    expect(ids.filter((id) => id.startsWith('R'))).toHaveLength(8)
  })

  it('in the tests that always run', () => {
    const text = testText('test/lib') + testText('test/authz')
    expect(ids.filter((id) => !named(text, id))).toEqual([])
  })

  it('in the Postgres integration tests', () => {
    const text = testText('test/integration')
    expect(ids.filter((id) => !named(text, id))).toEqual([])
  })
})
