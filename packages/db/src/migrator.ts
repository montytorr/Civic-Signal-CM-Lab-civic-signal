import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import pg from 'pg'

export const MIGRATIONS_DIR = resolve(__dirname, '../migrations')

// Any constant works; it only has to be the same for every migrator run against a database.
const MIGRATION_LOCK_KEY = 4_317_001

export interface MigrateOptions {
  connectionString: string
  migrationsDir?: string
  log?: (message: string) => void
}

export interface MigrateResult {
  applied: string[]
  skipped: string[]
}

export const listMigrationFiles = (migrationsDir: string = MIGRATIONS_DIR): string[] =>
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

/**
 * Apply every migration not yet recorded in schema_migrations, in filename order.
 * Each file runs in its own transaction together with its ledger row, so a failing file
 * leaves nothing behind and stops the run. A session advisory lock keeps concurrent
 * migrators (two deploys) from racing. Running it again applies nothing.
 */
export const runMigrations = async ({
  connectionString,
  migrationsDir = MIGRATIONS_DIR,
  log = console.log,
}: MigrateOptions): Promise<MigrateResult> => {
  const files = listMigrationFiles(migrationsDir)
  const result: MigrateResult = { applied: [], skipped: [] }
  const client = new pg.Client({ connectionString, application_name: 'civicsignal-migrate' })
  await client.connect()

  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `)

    const { rows } = await client.query<{ filename: string }>('select filename from schema_migrations')
    const applied = new Set(rows.map((r) => r.filename))

    for (const file of files) {
      if (applied.has(file)) {
        result.skipped.push(file)
        continue
      }

      log(`Applying migration ${file}`)
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      try {
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into schema_migrations (filename) values ($1)', [file])
        await client.query('commit')
      } catch (err) {
        await client.query('rollback').catch(() => undefined)
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err })
      }
      result.applied.push(file)
    }

    log(`Migrations: ${result.applied.length} applied, ${result.skipped.length} already applied`)
    return result
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined)
    await client.end()
  }
}
