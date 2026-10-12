import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../../../apps/web/.env.local'), quiet: true })

import { closePool, getPool } from '@civicsignal/db'
import { tick } from './resolver'

if (!process.env.DATABASE_URL) {
  console.error('[resolver] Missing DATABASE_URL')
  process.exit(1)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Host and database only: never log the credentials in DATABASE_URL.
const describeDatabase = (url: string) => {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

let running = true

const shutdown = (signal: string) => {
  console.log(`[resolver] Received ${signal} — shutting down gracefully`)
  running = false
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

const run = async () => {
  console.log('[resolver] CivicSignal resolver service starting')
  console.log(`[resolver] Connected to ${describeDatabase(process.env.DATABASE_URL ?? '')}`)
  const pool = getPool()

  while (running) {
    const start = Date.now()
    console.log(`[resolver] Tick at ${new Date().toISOString()}`)

    await tick(pool)

    const elapsed = Date.now() - start
    console.log(`[resolver] Tick completed in ${elapsed}ms — sleeping 60s`)

    // Sleep in small increments so SIGINT/SIGTERM can interrupt promptly
    const sleepEnd = Date.now() + 60_000
    while (running && Date.now() < sleepEnd) {
      await sleep(250)
    }
  }

  await closePool()
  console.log('[resolver] Exited cleanly')
}

run().catch((err) => {
  console.error('[resolver] Fatal error:', err)
  process.exit(1)
})
