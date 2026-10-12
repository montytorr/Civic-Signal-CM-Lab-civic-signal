// Poll proposal fields: parsing from a request body, the creation rules, and validating a merged row
// before any write (creation, the proposer's edit and revise, and admin moderation). Server-only.
import { queryOne, type Queryable } from '@civicsignal/db'
import { HttpError, isUuid } from '@/lib/http'

/** The editable columns of a proposal (and of the draft poll an approval creates). */
export interface ProposalFields {
  question: string
  topic_id: string
  region: string
  options: string[]
  source_of_truth: string
  resolution_criteria: string
  cutoff_at: string
  resolves_at: string
}

const cleanOptions = (options: unknown[]) => options.map(String).map((o) => o.trim()).filter(Boolean)

const toIso = (value: unknown, key: string): string => {
  const date = new Date(String(value))
  if (isNaN(date.getTime())) throw new HttpError(400, `${key} must be a valid date`, 'INVALID_BODY')
  return date.toISOString()
}

/** The fields a request body sets (camelCase in, column names out). Unknown keys are ignored. */
export const proposalEdits = (body: Record<string, unknown>): Partial<ProposalFields> => {
  const out: Partial<ProposalFields> = {}
  if (typeof body.question === 'string') out.question = body.question.trim()
  if (body.topicId !== undefined) {
    if (!isUuid(body.topicId)) throw new HttpError(400, 'Topic is required.', 'INVALID_BODY')
    out.topic_id = body.topicId
  }
  if (typeof body.region === 'string') out.region = body.region.trim()
  if (Array.isArray(body.options)) out.options = cleanOptions(body.options)
  if (typeof body.sourceOfTruth === 'string') out.source_of_truth = body.sourceOfTruth.trim()
  if (typeof body.resolutionCriteria === 'string') out.resolution_criteria = body.resolutionCriteria.trim()
  if (body.cutoffAt) out.cutoff_at = toIso(body.cutoffAt, 'cutoffAt')
  if (body.resolvesAt) out.resolves_at = toIso(body.resolvesAt, 'resolvesAt')
  return out
}

/** The creation rules, applied to a whole proposal. Returns the first problem, or null. */
export const validateProposal = (p: Partial<Record<keyof ProposalFields, unknown>>): string | null => {
  const { question, topic_id, region, options, source_of_truth, resolution_criteria, cutoff_at, resolves_at } = p
  if (typeof question !== 'string' || question.trim().length < 12 || question.length > 500) return 'Question must be 12-500 characters.'
  if (!isUuid(topic_id)) return 'Topic is required.'
  if (typeof region !== 'string' || !region.trim() || region.length > 100) return 'Region is required.'
  if (!Array.isArray(options) || cleanOptions(options).length < 2) return 'Add at least two outcome options.'
  if (typeof source_of_truth !== 'string' || source_of_truth.trim().length < 8 || source_of_truth.length > 500) return 'Source-of-truth is required.'
  if (typeof resolution_criteria !== 'string' || resolution_criteria.trim().length < 20 || resolution_criteria.length > 2000) return 'Resolution criteria must be specific.'
  const cutoff = new Date(String(cutoff_at))
  const resolves = new Date(String(resolves_at))
  if (Number.isNaN(cutoff.getTime()) || Number.isNaN(resolves.getTime())) return 'Cutoff and resolution date must be valid.'
  if (cutoff >= resolves) return 'Cutoff must be before resolution date.'
  return null
}

/** Validate a whole proposal and check its topic exists: a 400, never a database error. */
export const assertValidProposal = async (p: Partial<Record<keyof ProposalFields, unknown>>, db?: Queryable) => {
  const problem = validateProposal(p)
  if (problem) throw new HttpError(400, problem, 'INVALID_BODY')
  const topic = await queryOne('select 1 from topics where id = $1', [p.topic_id], db)
  if (!topic) throw new HttpError(400, 'Topic is required.', 'INVALID_BODY')
}

/** A stored row's options as a list (jsonb arrives parsed). */
export const optionsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** SQL `set` assignments for edits and extra columns, numbered from $first. options become jsonb. */
export const setClause = (values: Record<string, unknown>, first: number) => {
  const columns = Object.keys(values)
  return {
    sql: columns.map((column, i) => `${column} = $${i + first}`).join(', '),
    params: columns.map((column) => (column === 'options' ? JSON.stringify(values[column]) : values[column])),
  }
}
