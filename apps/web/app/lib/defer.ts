// Work that runs after the response is sent, so a slow side effect (sending email) does not show in
// response times. Account flows use it so that timing does not reveal whether an email has an account.
import { after } from 'next/server'

const inflight = new Set<Promise<void>>()

const guarded = (label: string, task: () => Promise<void>) => async () => {
  try {
    await task()
  } catch (err) {
    console.error(`[defer] ${label} failed:`, err instanceof Error ? err.message : String(err))
  }
}

/**
 * Run a task after the response (next/server `after`). Outside a request scope (tests, scripts)
 * it starts the task now without waiting for it; settleDeferred() waits for those.
 */
export const runAfterResponse = (label: string, task: () => Promise<void>) => {
  const run = guarded(label, task)
  try {
    after(run)
  } catch {
    const promise = run().finally(() => inflight.delete(promise))
    inflight.add(promise)
  }
}

/** Wait for every task started outside a request scope (tests). */
export const settleDeferred = async () => {
  while (inflight.size > 0) await Promise.all([...inflight])
}
