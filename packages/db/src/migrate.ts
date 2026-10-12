// CLI: apply pending migrations to DATABASE_URL.  pnpm --filter @civicsignal/db db:migrate
import { join, resolve } from 'path'
import { config } from 'dotenv'
import { runMigrations } from './migrator'

// Local development convenience; real environments pass DATABASE_URL directly.
const repoRoot = resolve(__dirname, '../../../')
config({ path: join(repoRoot, 'apps/web/.env.local'), quiet: true })
config({ path: join(repoRoot, '.env.local'), quiet: true })

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

runMigrations({ connectionString }).catch((err: Error) => {
  console.error(err.message)
  process.exit(1)
})
