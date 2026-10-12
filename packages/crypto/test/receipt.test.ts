import { describe, it, expect } from 'vitest'
import { createVoteReceipt, generateReceiptHash } from '../src/receipt'

describe('createVoteReceipt', () => {
  const POLL_ID = 'poll-abc123'
  const USER_ID = 'user-xyz789'
  const ENCRYPTED_VOTE = 'c2VjcmV0LWVuY3J5cHRlZC12b3Rl'

  it('returns an object with hash, shortHash, timestamp, pollId, and userId', () => {
    const receipt = createVoteReceipt(POLL_ID, USER_ID, ENCRYPTED_VOTE)
    expect(receipt).toHaveProperty('hash')
    expect(receipt).toHaveProperty('shortHash')
    expect(receipt).toHaveProperty('timestamp')
    expect(receipt).toHaveProperty('pollId', POLL_ID)
    expect(receipt).toHaveProperty('userId', USER_ID)
  })

  it('hash is a 64-character hex string', () => {
    const { hash } = createVoteReceipt(POLL_ID, USER_ID, ENCRYPTED_VOTE)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('shortHash starts with 0x', () => {
    const { shortHash } = createVoteReceipt(POLL_ID, USER_ID, ENCRYPTED_VOTE)
    expect(shortHash.startsWith('0x')).toBe(true)
  })

  it('shortHash contains the first 4 chars of hash (uppercased)', () => {
    const { hash, shortHash } = createVoteReceipt(POLL_ID, USER_ID, ENCRYPTED_VOTE)
    const expectedPrefix = hash.slice(0, 4).toUpperCase()
    expect(shortHash).toContain(expectedPrefix)
  })

  it('shortHash contains the last 4 chars of hash (uppercased)', () => {
    const { hash, shortHash } = createVoteReceipt(POLL_ID, USER_ID, ENCRYPTED_VOTE)
    const expectedSuffix = hash.slice(-4).toUpperCase()
    expect(shortHash).toContain(expectedSuffix)
  })

  it('timestamp is a valid ISO 8601 string', () => {
    const { timestamp } = createVoteReceipt(POLL_ID, USER_ID, ENCRYPTED_VOTE)
    expect(() => new Date(timestamp).toISOString()).not.toThrow()
    expect(new Date(timestamp).toISOString()).toBe(timestamp)
  })

  it('produces the same hash when called with the same timestamp', () => {
    const fixedTimestamp = '2024-01-15T10:00:00.000Z'
    const hash1 = generateReceiptHash(POLL_ID, USER_ID, ENCRYPTED_VOTE, fixedTimestamp)
    const hash2 = generateReceiptHash(POLL_ID, USER_ID, ENCRYPTED_VOTE, fixedTimestamp)
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different poll IDs', () => {
    const timestamp = '2024-01-15T10:00:00.000Z'
    const hash1 = generateReceiptHash('poll-1', USER_ID, ENCRYPTED_VOTE, timestamp)
    const hash2 = generateReceiptHash('poll-2', USER_ID, ENCRYPTED_VOTE, timestamp)
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hashes for different user IDs', () => {
    const timestamp = '2024-01-15T10:00:00.000Z'
    const hash1 = generateReceiptHash(POLL_ID, 'user-1', ENCRYPTED_VOTE, timestamp)
    const hash2 = generateReceiptHash(POLL_ID, 'user-2', ENCRYPTED_VOTE, timestamp)
    expect(hash1).not.toBe(hash2)
  })

  it('timestamp in receipt is close to now', () => {
    const before = Date.now()
    const { timestamp } = createVoteReceipt(POLL_ID, USER_ID, ENCRYPTED_VOTE)
    const after = Date.now()
    const receiptTime = new Date(timestamp).getTime()
    expect(receiptTime).toBeGreaterThanOrEqual(before)
    expect(receiptTime).toBeLessThanOrEqual(after)
  })
})
