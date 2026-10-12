// Server-side Postgres access. Never import this from browser code: it reads DATABASE_URL.
import pg from 'pg'
import type { Pool, PoolClient, PoolConfig, QueryResultRow } from 'pg'
import type { Insert, Row, TableName } from './types'

export type { Pool, PoolClient, QueryResultRow } from 'pg'

const TIMESTAMPTZ_OID = 1184
const TIMESTAMP_OID = 1114

// Keep timestamps as ISO strings (what the row types and the Supabase-era code expect).
const toIsoString = (parse: (value: string) => unknown) => (value: string): string => {
  const parsed = parse(value)
  return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : value
}

const typeParsers = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    if (oid === TIMESTAMPTZ_OID || oid === TIMESTAMP_OID) {
      return toIsoString(pg.types.getTypeParser(oid, 'text'))
    }
    return format === 'binary' ? pg.types.getTypeParser(oid, 'binary') : pg.types.getTypeParser(oid, 'text')
  }) as NonNullable<PoolConfig['types']>['getTypeParser'],
}

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = Pick<Pool, 'query'> | PoolClient

/** Create a new pool. Prefer getPool() unless you need a separate connection string (tests, migrator). */
export const createPool = (connectionString: string, config: Omit<PoolConfig, 'connectionString'> = {}): Pool => {
  const pool = new pg.Pool({ application_name: 'civicsignal', ...config, connectionString, types: typeParsers })
  // An idle client losing its connection must not crash the process.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message))
  return pool
}

// Survive module reloads (Next.js dev) without leaking pools.
const globalForPool = globalThis as unknown as { __civicsignalPool?: Pool }

/** The process-wide pool, created on first use from DATABASE_URL. */
export const getPool = (): Pool => {
  if (!globalForPool.__civicsignalPool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    globalForPool.__civicsignalPool = createPool(url)
  }
  return globalForPool.__civicsignalPool
}

/** Close the process-wide pool (on shutdown). */
export const closePool = async (): Promise<void> => {
  const pool = globalForPool.__civicsignalPool
  globalForPool.__civicsignalPool = undefined
  if (pool) await pool.end()
}

/** Run a query and return its rows. */
export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Queryable = getPool(),
): Promise<T[]> => (await db.query<T>(text, params)).rows

/** Run a query and return the first row, or null. */
export const queryOne = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Queryable = getPool(),
): Promise<T | null> => (await db.query<T>(text, params)).rows[0] ?? null

/** Run fn inside BEGIN/COMMIT on one client; roll back if it throws. */
export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>, pool: Pool = getPool()): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

const quoteIdentifier = (name: string): string => {
  if (!IDENTIFIER.test(name)) throw new Error(`Invalid SQL identifier: ${name}`)
  return `"${name}"`
}

// pg sends JS arrays as Postgres arrays; every array or object column in this schema is jsonb.
const toParam = (value: unknown): unknown =>
  value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)
    ? JSON.stringify(value)
    : value

/** Insert rows into a table and return them. Columns missing from a row get their default. */
export const insertRows = async <T extends TableName>(
  table: T,
  rows: Insert<T>[],
  db: Queryable = getPool(),
): Promise<Row<T>[]> => {
  if (rows.length === 0) return []
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  if (columns.length === 0) throw new Error(`insertRows(${table}): rows have no columns`)
  const params: unknown[] = []
  const tuples = rows.map((row) => {
    const values = columns.map((column) => {
      const value = (row as Record<string, unknown>)[column]
      if (value === undefined) return 'default'
      params.push(toParam(value))
      return `$${params.length}`
    })
    return `(${values.join(', ')})`
  })
  const text = `insert into ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) values ${tuples.join(', ')} returning *`
  return query<Row<T> & QueryResultRow>(text, params, db)
}

/** Insert one row into a table and return it. */
export const insertRow = async <T extends TableName>(table: T, row: Insert<T>, db: Queryable = getPool()): Promise<Row<T>> => {
  const [inserted] = await insertRows(table, [row], db)
  return inserted
}
