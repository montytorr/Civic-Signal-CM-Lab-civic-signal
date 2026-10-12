// Test support: a fresh, uniquely named database on the server behind TEST_DATABASE_URL.
// Tests that need Postgres skip when TEST_DATABASE_URL is unset (CI without docker).
import { randomBytes } from 'crypto'
import pg from 'pg'

export const testDatabaseUrl = process.env.TEST_DATABASE_URL

export interface TestDatabase {
  url: string
  drop: () => Promise<void>
}

const withAdmin = async (adminUrl: string, sql: string) => {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

/** Create an empty database next to TEST_DATABASE_URL; drop() removes it. */
export const createTestDatabase = async (adminUrl: string = testDatabaseUrl ?? ''): Promise<TestDatabase> => {
  if (!adminUrl) throw new Error('TEST_DATABASE_URL is not set')
  const name = `civic_test_${randomBytes(6).toString('hex')}`
  await withAdmin(adminUrl, `create database ${name}`)
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  return {
    url: url.toString(),
    drop: () => withAdmin(adminUrl, `drop database if exists ${name} with (force)`),
  }
}
