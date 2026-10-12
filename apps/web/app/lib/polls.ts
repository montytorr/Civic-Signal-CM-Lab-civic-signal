// Admin poll creation, shared by POST /api/admin/polls and proposal approval. Server-only.
import { generatePollKeypair } from '@civicsignal/crypto'
import { insertRow, type PollRow, type PoolClient } from '@civicsignal/db'

export interface DraftPollFields {
  topic_id: string
  question: string
  region: string
  options: string[]
  source_of_truth: string
  resolution_criteria: string | null
  cutoff_at: string
  resolves_at: string
  created_by: string
}

/**
 * Insert a draft poll with a fresh NaCl keypair, inside the caller's transaction (callers have
 * passed R3 or R8). S1: the secret key goes to poll_secrets only; audit_commitments gets the public
 * key, which voters encrypt to. Returns the poll and its public key, never the secret key.
 */
export const createDraftPoll = async (
  client: PoolClient,
  fields: DraftPollFields,
  commitmentMetadata: Record<string, string> = {},
): Promise<{ poll: PollRow; publicKey: string }> => {
  const keypair = generatePollKeypair()
  const poll = await insertRow('polls', { ...fields, status: 'draft' }, client)
  await client.query('insert into poll_secrets (poll_id, secret_key) values ($1, $2)', [poll.id, keypair.secretKey])
  await insertRow(
    'audit_commitments',
    {
      poll_id: poll.id,
      merkle_root: keypair.publicKey,
      batch_type: 'vote',
      metadata: { type: 'keypair', publicKey: keypair.publicKey, ...commitmentMetadata },
    },
    client,
  )
  return { poll, publicKey: keypair.publicKey }
}

/**
 * The public key votes on this poll are sealed to. A poll that has none yet (the seeded launch
 * polls were inserted by a migration, which cannot make NaCl keys) gets a keypair now, inside the
 * caller's transaction: S1 still holds, the secret goes to poll_secrets only and is never read or
 * returned here. Concurrent first votes agree on one keypair (the poll_secrets primary key).
 */
export const ensurePollPublicKey = async (client: PoolClient, pollId: string): Promise<string> => {
  const keypair = generatePollKeypair()
  const created = await client.query(
    'insert into poll_secrets (poll_id, secret_key) values ($1, $2) on conflict (poll_id) do nothing returning poll_id',
    [pollId, keypair.secretKey],
  )
  if (created.rowCount === 1) {
    await insertRow(
      'audit_commitments',
      { poll_id: pollId, merkle_root: keypair.publicKey, batch_type: 'vote', metadata: { type: 'keypair', publicKey: keypair.publicKey } },
      client,
    )
    return keypair.publicKey
  }
  const existing = await client.query<{ public_key: string }>(
    `select metadata ->> 'publicKey' as public_key from audit_commitments
     where poll_id = $1 and batch_type = 'vote' and metadata ? 'publicKey'
     order by created_at limit 1`,
    [pollId],
  )
  const publicKey = existing.rows[0]?.public_key
  if (!publicKey) throw new Error(`poll ${pollId} has a secret key but no published public key`)
  return publicKey
}
