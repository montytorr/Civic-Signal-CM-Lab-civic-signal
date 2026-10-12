// Static checks on the migration files. These need no database and always run.
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS_DIR, listMigrationFiles } from '../src/migrator'

const files = listMigrationFiles()
const read = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

describe('migration files', () => {
  it('are the Postgres-native baseline and seed', () => {
    expect(files).toEqual(['001_baseline.sql', '002_seed_content.sql'])
  })

  it.each(files)('%s has no Supabase auth, roles or RLS', (file) => {
    // Comments included: a grep over the files must come back empty too.
    const sql = read(file)
    expect(sql).not.toMatch(/auth\.(uid|jwt)\s*\(/i)
    expect(sql).not.toMatch(/auth\.users/i)
    expect(sql).not.toMatch(/\bservice_role\b|\banon\b|\bauthenticated\b/i)
    expect(sql).not.toMatch(/create\s+policy/i)
    expect(sql).not.toMatch(/row\s+level\s+security/i)
    expect(sql).not.toMatch(/raw_user_meta_data|email_confirmed_at/i)
  })
})
