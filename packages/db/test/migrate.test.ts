// Migrator and schema tests against a real Postgres. Skipped when TEST_DATABASE_URL is unset;
// `pnpm --filter @civicsignal/db test:pg` runs them in a throwaway postgres:17-alpine container.
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPool, insertRow, insertRows, query, queryOne, type Pool } from '../src/client'
import { listMigrationFiles, runMigrations } from '../src/migrator'
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '../src/testing'

const quiet = () => undefined

describe.skipIf(!testDatabaseUrl)('migrator on an empty Postgres', () => {
  let db: TestDatabase
  let pool: Pool
  let firstRun: Awaited<ReturnType<typeof runMigrations>>

  beforeAll(async () => {
    db = await createTestDatabase()
    firstRun = await runMigrations({ connectionString: db.url, log: quiet })
    pool = createPool(db.url)
  })

  afterAll(async () => {
    await pool?.end()
    await db?.drop()
  })

  it('runs on Postgres 17', async () => {
    const row = await queryOne<{ server_version_num: string }>('show server_version_num', [], pool)
    expect(Number(row?.server_version_num)).toBeGreaterThanOrEqual(170000)
  })

  it('applies every migration and records each in schema_migrations', async () => {
    expect(firstRun.applied).toEqual(listMigrationFiles())
    expect(firstRun.skipped).toEqual([])
    const ledger = await query<{ filename: string }>('select filename from schema_migrations order by filename', [], pool)
    expect(ledger.map((r) => r.filename)).toEqual(listMigrationFiles())
  })

  it('applies nothing on a second run', async () => {
    const before = await queryOne<{ n: string }>('select count(*) as n from polls', [], pool)
    const second = await runMigrations({ connectionString: db.url, log: quiet })
    expect(second.applied).toEqual([])
    expect(second.skipped).toEqual(listMigrationFiles())
    const after = await queryOne<{ n: string }>('select count(*) as n from polls', [], pool)
    expect(after?.n).toBe(before?.n)
  })

  it('has no row-level security, policies or auth schema', async () => {
    const policies = await queryOne<{ n: string }>('select count(*) as n from pg_policies', [], pool)
    expect(policies?.n).toBe('0')
    const rls = await query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relrowsecurity`,
      [],
      pool,
    )
    expect(rls).toEqual([])
    const auth = await queryOne<{ n: string }>(`select count(*) as n from pg_namespace where nspname = 'auth'`, [], pool)
    expect(auth?.n).toBe('0')
  })

  it('creates the app auth tables', async () => {
    const tables = await query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name in ('users', 'sessions', 'email_tokens')
       order by table_name`,
      [],
      pool,
    )
    expect(tables.map((t) => t.table_name)).toEqual(['email_tokens', 'sessions', 'users'])
  })

  it('points profiles (the former auth.users FK) and the auth tables at users(id)', async () => {
    const fks = await query<{ source: string; target: string }>(
      `select conrelid::regclass::text as source, confrelid::regclass::text as target
       from pg_constraint
       where contype = 'f' and confrelid = 'public.users'::regclass
       order by source`,
      [],
      pool,
    )
    expect(fks).toEqual([
      { source: 'email_tokens', target: 'users' },
      { source: 'profiles', target: 'users' },
      { source: 'sessions', target: 'users' },
    ])
    // Every foreign key in the schema stays inside public.
    const outside = await queryOne<{ n: string }>(
      `select count(*) as n from pg_constraint c join pg_class t on t.oid = c.confrelid
       join pg_namespace n on n.oid = t.relnamespace
       where c.contype = 'f' and n.nspname <> 'public'`,
      [],
      pool,
    )
    expect(outside?.n).toBe('0')
  })

  it('seeds the topics, source templates and launch polls (old 001, 003, 005, 009–012)', async () => {
    const topics = await query<{ slug: string }>('select slug from topics order by slug', [], pool)
    expect(topics.map((t) => t.slug)).toEqual(['climate', 'econ', 'elect', 'energy', 'geopol', 'health', 'science', 'tech'])

    const templates = await queryOne<{ n: string }>('select count(*) as n from source_templates', [], pool)
    expect(templates?.n).toBe('11')

    const polls = await queryOne<{ n: string; distinct_questions: string; active: string }>(
      `select count(*) as n, count(distinct question) as distinct_questions,
              count(*) filter (where status = 'active') as active
       from polls`,
      [],
      pool,
    )
    // 10 (old 003) + 25 (old 005) + 8 (old 011), no duplicates (old 012).
    expect(polls).toEqual({ n: '43', distinct_questions: '43', active: '43' })

    for (const question of [
      'Will the U.S. Federal Reserve cut its benchmark rate at the June 2026 FOMC meeting?', // old 003
      'Will the Bank of Japan raise its policy rate above 1% before the end of 2026?', // old 005
      'Will UK CPI inflation be at or below 2.0% in any ONS monthly release published before 31 December 2026?', // old 011
    ]) {
      const found = await queryOne('select 1 from polls where question = $1', [question], pool)
      expect(found, question).not.toBeNull()
    }
  })

  it('creates a profile for each new user and marks it verified when the email is', async () => {
    const user = await insertRow('users', { email: 'alice@example.com', password_hash: 'x' }, pool)
    const profile = await queryOne<{ handle: string; verified: boolean }>('select handle, verified from profiles where id = $1', [user.id], pool)
    expect(profile?.handle).toMatch(/^[a-z]+-[a-z]+-\d{4}$/)
    expect(profile?.verified).toBe(false)

    await query('update users set email_verified_at = now() where id = $1', [user.id], pool)
    const verified = await queryOne<{ verified: boolean; verified_at: string | null }>(
      'select verified, verified_at from profiles where id = $1',
      [user.id],
      pool,
    )
    expect(verified?.verified).toBe(true)
    expect(verified?.verified_at).not.toBeNull()

    // Deleting a user removes its profile and sessions.
    await insertRow('sessions', { user_id: user.id, token_hash: 'h1', expires_at: new Date(Date.now() + 60_000).toISOString() }, pool)
    await query('delete from users where id = $1', [user.id], pool)
    expect(await queryOne('select 1 from profiles where id = $1', [user.id], pool)).toBeNull()
    expect(await queryOne('select 1 from sessions where user_id = $1', [user.id], pool)).toBeNull()
  })

  it('keeps poll secret keys out of the public audit_commitments', async () => {
    const leaked = await queryOne<{ n: string }>(
      `select count(*) as n from audit_commitments where metadata ? 'secretKey'`,
      [],
      pool,
    )
    expect(leaked?.n).toBe('0')

    const poll = await queryOne<{ id: string }>('select id from polls limit 1', [], pool)
    await expect(
      insertRow('audit_commitments', { poll_id: poll!.id, merkle_root: 'r', batch_type: 'vote', metadata: { publicKey: 'p', secretKey: 's' } }, pool),
    ).rejects.toThrow(/audit_commitments_no_secret_key/)

    // The key lives in the server-only poll_secrets table, one per poll.
    await insertRow('audit_commitments', { poll_id: poll!.id, merkle_root: 'r', batch_type: 'vote', metadata: { publicKey: 'p' } }, pool)
    await insertRow('poll_secrets', { poll_id: poll!.id, secret_key: 's' }, pool)
    await expect(insertRow('poll_secrets', { poll_id: poll!.id, secret_key: 's2' }, pool)).rejects.toThrow(/duplicate key/)
  })

  it('allows one published public key per poll', async () => {
    const poll = await queryOne<{ id: string }>(
      `select p.id from polls p where not exists (select 1 from audit_commitments a where a.poll_id = p.id) limit 1`,
      [],
      pool,
    )
    await insertRow('audit_commitments', { poll_id: poll!.id, merkle_root: 'k1', batch_type: 'vote', metadata: { type: 'keypair', publicKey: 'p1' } }, pool)
    await expect(
      insertRow('audit_commitments', { poll_id: poll!.id, merkle_root: 'k2', batch_type: 'vote', metadata: { type: 'keypair', publicKey: 'p2' } }, pool),
    ).rejects.toThrow(/audit_commitments_one_public_key/)
    // Commitments without a public key (Merkle roots, resolutions) are not limited.
    await insertRow('audit_commitments', { poll_id: poll!.id, merkle_root: 'm1', batch_type: 'vote', metadata: { vote_count: 0 } }, pool)
    await insertRow('audit_commitments', { poll_id: poll!.id, merkle_root: 'm2', batch_type: 'resolution', metadata: null }, pool)
  })

  it('counts wrong passwords on an email token', async () => {
    const column = await queryOne<{ column_default: string; is_nullable: string }>(
      `select column_default, is_nullable from information_schema.columns where table_name = 'email_tokens' and column_name = 'failed_attempts'`,
      [],
      pool,
    )
    expect(column).toEqual({ column_default: '0', is_nullable: 'NO' })
  })

  it('stores votes sealed only: no plaintext answer column', async () => {
    const columns = await query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'votes' order by ordinal_position`,
      [],
      pool,
    )
    expect(columns.map((c) => c.column_name)).toEqual(['id', 'poll_id', 'user_id', 'encrypted_answer', 'receipt_hash', 'created_at'])
  })

  it('keeps resolved answer totals in poll_results, without user ids', async () => {
    const columns = await query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'poll_results' order by ordinal_position`,
      [],
      pool,
    )
    expect(columns.map((c) => c.column_name)).toEqual(['poll_id', 'answer', 'votes'])
    const poll = await queryOne<{ id: string }>('select id from polls limit 1', [], pool)
    await insertRow('poll_results', { poll_id: poll!.id, answer: 'Yes', votes: 2 }, pool)
    await expect(insertRow('poll_results', { poll_id: poll!.id, answer: 'Yes', votes: 3 }, pool)).rejects.toThrow(/duplicate key/)
    await expect(insertRow('poll_results', { poll_id: poll!.id, answer: 'No', votes: -1 }, pool)).rejects.toThrow(/check constraint/)
  })

  it('keeps emails unique and lowercase', async () => {
    await insertRow('users', { email: 'bob@example.com', password_hash: 'x' }, pool)
    await expect(insertRow('users', { email: 'bob@example.com', password_hash: 'y' }, pool)).rejects.toThrow(/unique/)
    await expect(insertRow('users', { email: 'Carol@Example.com', password_hash: 'x' }, pool)).rejects.toThrow(/check/)
  })

  it('only accepts verify and reset email tokens', async () => {
    const user = await insertRow('users', { email: 'dave@example.com', password_hash: 'x' }, pool)
    const expires_at = new Date(Date.now() + 60_000).toISOString()
    await insertRow('email_tokens', { user_id: user.id, purpose: 'verify', token_hash: 't1', expires_at }, pool)
    await expect(
      query(`insert into email_tokens (user_id, purpose, token_hash, expires_at) values ($1, 'login', 't2', now())`, [user.id], pool),
    ).rejects.toThrow(/check/)
  })

  it('round-trips jsonb arrays and returns timestamps as ISO strings', async () => {
    const topic = await queryOne<{ id: string }>(`select id from topics where slug = 'tech'`, [], pool)
    const [poll] = await insertRows(
      'polls',
      [
        {
          topic_id: topic!.id,
          question: 'Test poll?',
          region: 'Test',
          options: ['Yes', 'No'],
          source_of_truth: 'Test',
          cutoff_at: '2030-01-01T00:00:00.000Z',
          resolves_at: '2030-02-01T00:00:00.000Z',
        },
      ],
      pool,
    )
    expect(poll.options).toEqual(['Yes', 'No'])
    expect(poll.cutoff_at).toBe('2030-01-01T00:00:00.000Z')
    expect(poll.status).toBe('draft')
  })
})

describe.skipIf(!testDatabaseUrl)('migrator failure handling', () => {
  let db: TestDatabase

  beforeAll(async () => {
    db = await createTestDatabase()
  })

  afterAll(async () => {
    await db?.drop()
  })

  it('rolls back a failing file, records nothing for it and stops', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'civic-migrations-'))
    writeFileSync(join(dir, '001_ok.sql'), 'create table ok_table (id int);')
    writeFileSync(join(dir, '002_bad.sql'), 'create table half_done (id int);\nselect * from missing_table;')
    writeFileSync(join(dir, '003_after.sql'), 'create table after_table (id int);')

    await expect(runMigrations({ connectionString: db.url, migrationsDir: dir, log: quiet })).rejects.toThrow(/002_bad\.sql/)

    const pool = createPool(db.url)
    try {
      const ledger = await query<{ filename: string }>('select filename from schema_migrations', [], pool)
      expect(ledger.map((r) => r.filename)).toEqual(['001_ok.sql'])
      const tables = await query<{ name: string | null }>(
        `select to_regclass('public.half_done')::text as name union all select to_regclass('public.after_table')::text`,
        [],
        pool,
      )
      expect(tables).toEqual([{ name: null }, { name: null }])
    } finally {
      await pool.end()
    }
  })
})
