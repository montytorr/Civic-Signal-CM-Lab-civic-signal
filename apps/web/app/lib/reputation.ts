// Reputation tiers: the only form in which anyone but the owner sees a topic score (P10).
//
// Why: a score moves by exactly one per correct answer, so an exact public score (or a public
// per-poll delta, P9) diffed across a resolution reveals how someone voted. A coarse tier changes
// rarely; the residual risk (a tier boundary crossed right after a single resolution hints at that
// one answer) is described under "Vote privacy" in docs/authz-policies.md.
//
// Edge-safe and client-safe: no server imports, so components can label tiers too.

export const REPUTATION_TIERS = [
  { key: 'newcomer', label: 'Newcomer', min: 0 },
  { key: 'participant', label: 'Participant', min: 1 },
  { key: 'contributor', label: 'Contributor', min: 5 },
  { key: 'trusted', label: 'Trusted', min: 20 },
  { key: 'steward', label: 'Steward', min: 50 },
] as const

export type ReputationTier = (typeof REPUTATION_TIERS)[number]['key']

/** The tier of an exact score (server-side, for the owner's own view or server checks). */
export const tierOf = (score: number | null | undefined): ReputationTier => {
  let tier: ReputationTier = 'newcomer'
  for (const t of REPUTATION_TIERS) if ((score ?? 0) >= t.min) tier = t.key
  return tier
}

export const tierLabel = (tier: ReputationTier | string): string =>
  REPUTATION_TIERS.find((t) => t.key === tier)?.label ?? 'Newcomer'

/** 0 for the lowest tier, upwards. */
export const tierRank = (tier: ReputationTier | string): number => Math.max(0, REPUTATION_TIERS.findIndex((t) => t.key === tier))

/**
 * The tier as a SQL expression over a score column, so public queries never return the score.
 * Only trusted column names are passed (code, never input).
 */
export const tierSql = (column: string): string =>
  `case ${[...REPUTATION_TIERS].reverse().map((t) => `when coalesce(${column}, 0) >= ${t.min} then '${t.key}'`).join(' ')} end`

/** The tier's rank as SQL, for ordering a public list by tier. */
export const tierRankSql = (column: string): string =>
  `case ${[...REPUTATION_TIERS].map((t, i) => [t, i] as const).reverse().map(([t, i]) => `when coalesce(${column}, 0) >= ${t.min} then ${i}`).join(' ')} end`
