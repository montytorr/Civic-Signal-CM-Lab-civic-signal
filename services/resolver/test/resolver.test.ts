// Resolver behaviour against a real Postgres. Skipped when TEST_DATABASE_URL is unset;
// `pnpm --filter @civicsignal/resolver test:pg` runs it in a throwaway postgres:17-alpine container.
import { buildMerkleRoot, encryptVote, generatePollKeypair } from '@civicsignal/crypto'
import { createPool, insertRow, query, queryOne, type Pool } from '@civicsignal/db'
import { runMigrations } from '@civicsignal/db/migrator'
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '@civicsignal/db/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoClosePolls, generateCommitments, processResolutions, tick } from '../src/resolver'

describe.skipIf(!testDatabaseUrl)('resolver', () => {
  let db: TestDatabase
  let pool: Pool
  let topicId: string

  const newUser = async (email: string) => (await insertRow('users', { email, password_hash: 'x' }, pool)).id

  const newPoll = async (fields: { cutoff_at: string; status?: 'draft' | 'active' | 'closed' | 'resolved'; outcome?: string }) =>
    insertRow(
      'polls',
      {
        topic_id: topicId,
        question: `Resolver test ${Math.random()}`,
        region: 'Test',
        options: ['Yes', 'No'],
        source_of_truth: 'Test',
        resolves_at: '2030-01-01T00:00:00.000Z',
        ...fields,
      },
      pool,
    )

  beforeAll(async () => {
    db = await createTestDatabase()
    await runMigrations({ connectionString: db.url, log: () => undefined })
    pool = createPool(db.url)
    topicId = (await queryOne<{ id: string }>(`select id from topics where slug = 'econ'`, [], pool))!.id
    // The seed polls are not part of these tests.
    await query('delete from polls', [], pool)
  })

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterAll(async () => {
    await pool?.end()
    await db?.drop()
  })

  it('closes active polls past their cutoff and leaves the rest', async () => {
    const expired = await newPoll({ cutoff_at: '2020-01-01T00:00:00.000Z', status: 'active' })
    const open = await newPoll({ cutoff_at: '2099-01-01T00:00:00.000Z', status: 'active' })
    const draft = await newPoll({ cutoff_at: '2020-01-01T00:00:00.000Z', status: 'draft' })

    await autoClosePolls(pool)

    const statuses = await query<{ id: string; status: string }>('select id, status from polls where id = any($1)', [[expired.id, open.id, draft.id]], pool)
    expect(Object.fromEntries(statuses.map((p) => [p.id, p.status]))).toEqual({
      [expired.id]: 'closed',
      [open.id]: 'active',
      [draft.id]: 'draft',
    })
  })

  it('commits a Merkle root once per closed poll that has no vote commitment', async () => {
    const poll = await newPoll({ cutoff_at: '2020-01-01T00:00:00.000Z', status: 'closed' })
    const voter = await newUser('voter1@example.com')
    await insertRow('votes', { poll_id: poll.id, user_id: voter, encrypted_answer: 'Yes', receipt_hash: 'r1' }, pool)

    await generateCommitments(pool)
    await generateCommitments(pool)

    const commitments = await query<{ merkle_root: string; metadata: { vote_count: number } }>(
      `select merkle_root, metadata from audit_commitments where poll_id = $1 and batch_type = 'vote'`,
      [poll.id],
      pool,
    )
    expect(commitments).toHaveLength(1)
    expect(commitments[0].metadata).toEqual({ vote_count: 1 })
    expect(commitments[0].merkle_root).toBe(buildMerkleRoot(['r1']))
  })

  // A resolved poll with its keypair: public half in the public commitment, secret half in the
  // server-only table.
  const keyedPoll = async (outcome: string) => {
    const keypair = generatePollKeypair()
    const poll = await newPoll({ cutoff_at: '2020-01-01T00:00:00.000Z', status: 'resolved', outcome })
    await insertRow(
      'audit_commitments',
      { poll_id: poll.id, merkle_root: 'keypair', batch_type: 'vote', metadata: { type: 'keypair', publicKey: keypair.publicKey } },
      pool,
    )
    await insertRow('poll_secrets', { poll_id: poll.id, secret_key: keypair.secretKey }, pool)
    return { poll, publicKey: keypair.publicKey }
  }

  it('scores resolved polls once, decrypting with the poll key and accumulating reputation', async () => {
    const right = await newUser('right@example.com')
    const wrong = await newUser('wrong@example.com')

    const { poll: first, publicKey: firstKey } = await keyedPoll('Yes')
    await insertRow('votes', { poll_id: first.id, user_id: right, encrypted_answer: encryptVote('Yes', firstKey), receipt_hash: 'a' }, pool)
    await insertRow('votes', { poll_id: first.id, user_id: wrong, encrypted_answer: encryptVote('No', firstKey), receipt_hash: 'b' }, pool)

    // A second poll in the same topic adds to the same reputation rows.
    const { poll: second, publicKey: secondKey } = await keyedPoll('No')
    await insertRow('votes', { poll_id: second.id, user_id: right, encrypted_answer: encryptVote('Yes', secondKey), receipt_hash: 'c' }, pool)
    await insertRow('votes', { poll_id: second.id, user_id: wrong, encrypted_answer: encryptVote('No', secondKey), receipt_hash: 'd' }, pool)

    await processResolutions(pool)
    await processResolutions(pool)

    const events = await query<{ poll_id: string; user_id: string; delta: number }>(
      'select poll_id, user_id, delta from reputation_events where poll_id = any($1) order by poll_id, user_id',
      [[first.id, second.id]],
      pool,
    )
    expect(events).toHaveLength(4)
    const delta = (pollId: string, userId: string) => events.find((e) => e.poll_id === pollId && e.user_id === userId)?.delta
    expect(delta(first.id, right)).toBe(1)
    expect(delta(first.id, wrong)).toBe(0)
    expect(delta(second.id, right)).toBe(0)
    expect(delta(second.id, wrong)).toBe(1)

    const reputation = await query<{ user_id: string; score: number; resolved_count: number; correct_count: number }>(
      'select user_id, score, resolved_count, correct_count from user_topic_reputation where topic_id = $1 and user_id = any($2)',
      [topicId, [right, wrong]],
      pool,
    )
    const of = (userId: string) => reputation.find((r) => r.user_id === userId)
    expect(of(right)).toMatchObject({ score: 1, resolved_count: 2, correct_count: 1 })
    expect(of(wrong)).toMatchObject({ score: 1, resolved_count: 2, correct_count: 1 })

    // Answer totals only, per poll; nothing per voter.
    const results = await query<{ poll_id: string; answer: string; votes: number }>(
      'select poll_id, answer, votes from poll_results where poll_id = any($1) order by poll_id, answer',
      [[first.id, second.id]],
      pool,
    )
    expect(results.filter((r) => r.poll_id === first.id).map(({ answer, votes }) => ({ answer, votes }))).toEqual([
      { answer: 'No', votes: 1 },
      { answer: 'Yes', votes: 1 },
    ])
    expect(results.filter((r) => r.poll_id === second.id)).toHaveLength(2)
    const voteColumns = await query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'votes'`, [], pool)
    expect(voteColumns.map((c) => c.column_name)).not.toContain('answer')
  })

  it('counts a ballot that is not one of the options toward nothing', async () => {
    const voter = await newUser('odd@example.com')
    const { poll, publicKey } = await keyedPoll('Yes')
    await insertRow('votes', { poll_id: poll.id, user_id: voter, encrypted_answer: encryptVote('Maybe', publicKey), receipt_hash: 'f' }, pool)
    await processResolutions(pool)
    const results = await query<{ answer: string; votes: number }>('select answer, votes from poll_results where poll_id = $1 order by answer', [poll.id], pool)
    expect(results).toEqual([{ answer: 'No', votes: 0 }, { answer: 'Yes', votes: 0 }])
    expect((await queryOne<{ n: string }>('select count(*) as n from reputation_events where poll_id = $1', [poll.id], pool))?.n).toBe('0')
  })

  it('reads the key only from poll_secrets; public metadata cannot hold one', async () => {
    const keypair = generatePollKeypair()
    const voter = await newUser('legacy@example.com')
    const poll = await newPoll({ cutoff_at: '2020-01-01T00:00:00.000Z', status: 'resolved', outcome: 'Yes' })
    // The schema refuses a secretKey in public metadata outright.
    await expect(
      insertRow('audit_commitments', { poll_id: poll.id, merkle_root: 'k', batch_type: 'vote', metadata: { secretKey: keypair.secretKey } }, pool),
    ).rejects.toThrow(/audit_commitments_no_secret_key/)
    // Without a poll_secrets row the ballots cannot be opened: the poll is left unscored.
    await insertRow('votes', { poll_id: poll.id, user_id: voter, encrypted_answer: encryptVote('Yes', keypair.publicKey), receipt_hash: 'e' }, pool)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await processResolutions(pool)
    expect(await queryOne('select 1 from reputation_events where poll_id = $1', [poll.id], pool)).toBeNull()
    expect(await queryOne('select 1 from poll_results where poll_id = $1', [poll.id], pool)).toBeNull()
  })

  it('skips resolved polls with no votes and runs a full tick without throwing', async () => {
    const empty = await newPoll({ cutoff_at: '2020-01-01T00:00:00.000Z', status: 'resolved', outcome: 'Yes' })
    await tick(pool)
    const events = await queryOne<{ n: string }>('select count(*) as n from reputation_events where poll_id = $1', [empty.id], pool)
    expect(events?.n).toBe('0')
  })
})
