// Password hashing (argon2id) and random tokens. Server-only.
import { createHash, randomBytes } from 'crypto'
import { hash, verify } from '@node-rs/argon2'

export const PASSWORD_MIN_LENGTH = 8
// Bounds the work an attacker can make argon2 do per request.
export const PASSWORD_MAX_LENGTH = 256

// OWASP's argon2id baseline: 19 MiB, 2 passes, 1 lane. The library's default algorithm is argon2id.
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

export const hashPassword = (password: string): Promise<string> => hash(password, ARGON2_OPTIONS)

/** True if the password matches the stored hash. A malformed hash is a mismatch, not an error. */
export const verifyPassword = async (passwordHash: string, password: string): Promise<boolean> => {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | null = null

/** Spend the same time as a real check when the email is unknown, so timing does not reveal it. */
export const verifyAgainstDummy = async (password: string): Promise<false> => {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(await dummyHash, password)
  return false
}

/** A random 32-byte token, base64url (43 characters). Sent to the client; never stored. */
export const generateToken = (): string => randomBytes(32).toString('base64url')

/** SHA-256 of a token, hex. This is what sessions and email_tokens store. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export const validatePassword = (password: unknown): string | null => {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  }
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  return null
}

/** Trimmed, lowercased email (users.email is stored that way), or null if it does not look like one. */
export const normalizeEmail = (email: unknown): string | null => {
  if (typeof email !== 'string') return null
  const clean = email.trim().toLowerCase()
  if (clean.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null
  return clean
}
