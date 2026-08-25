import { haversineDistance } from '@/lib/map/geo'
import { tokenSimilarity } from './fuzzy'
import { interpretQuery } from './query'
import { buildLexicon, suggestCorrection, type Lexicon } from './lexicon'
import { computeFacets } from './facets'
import { EXPANSION_PENALTY, type ExpandedToken } from './text'
import { SEARCH_FIELDS } from './types'
import type {
  Bounds,
  QueryInterpretation,
  SearchDoc,
  SearchFieldKey,
  SearchFilters,
  SearchHit,
  SearchOptions,
  SearchOutcome,
} from './types'

/**
 * Per-field contribution to relevance.
 *
 * `name` leads because searching a provider by name must find it. `zip` is
 * close behind and is matched exactly, never fuzzily. `street` sits low partly
 * because it is noisy and partly because it is absent entirely on two of the
 * three map surfaces, where the API withholds it.
 */
export const FIELD_WEIGHTS: Readonly<Record<SearchFieldKey, number>> = {
  name: 3.0,
  zip: 2.8,
  specialty: 2.2,
  city: 2.0,
  county: 1.3,
  region: 1.1,
  street: 0.9,
  state: 0.6,
  // Low on purpose: "attorney" should qualify a record, never rank it above a
  // firm whose actual name you typed.
  kind: 0.8,
}

const MAX_WEIGHT = 3.0
/** Non-dominant fields still contribute, so a query spanning two fields wins. */
const CROSS_FIELD_FACTOR = 0.15
const PHRASE_BONUS = 0.15
/** Miles at which proximity value halves. */
const TAU_MILES = 12
/** How much proximity is allowed to move the ranking. */
const ALPHA = 0.6
const AVAILABILITY_BOOST = 1.06
const DEFAULT_MIN_SCORE = 0.18
/**
 * Below this, a query token barely matched anything and is worth offering a
 * spelling correction for.
 *
 * Set under the interior-substring rung, so exact, prefix and one-edit matches
 * are all treated as "the user meant this". Requiring an exact match here made
 * "ortho tampa" propose "north tampa" — "ortho" is a prefix of "orthopedic",
 * not an exact hit, so it looked correctable when it was doing its job.
 */
const WEAK_MATCH_REACH = 0.62

export interface SearchIndex<T = unknown> {
  docs: readonly SearchDoc<T>[]
  lexicon: Lexicon
}

export function buildSearchIndex<T>(docs: readonly SearchDoc<T>[]): SearchIndex<T> {
  return { docs, lexicon: buildLexicon(docs) }
}

/** Memoises token comparisons for the duration of one search call. */
type SimilarityCache = Map<string, Map<string, number>>

function cachedSimilarity(cache: SimilarityCache, query: string, doc: string): number {
  let inner = cache.get(query)
  if (inner === undefined) {
    inner = new Map<string, number>()
    cache.set(query, inner)
  }
  const hit = inner.get(doc)
  if (hit !== undefined) return hit
  const value = tokenSimilarity(query, doc)
  inner.set(doc, value)
  return value
}

/** Best similarity of any variant of `token` against any token in `docTokens`. */
function bestTokenMatch(
  token: ExpandedToken,
  docTokens: readonly string[],
  cache: SimilarityCache
): number {
  let best = 0
  for (let v = 0; v < token.variants.length; v++) {
    const variant = token.variants[v]
    const penalty = v === 0 ? 1 : EXPANSION_PENALTY
    for (const docToken of docTokens) {
      const value = cachedSimilarity(cache, variant, docToken) * penalty
      if (value > best) {
        best = value
        if (best >= 1) return best
      }
    }
  }
  return best
}

interface ScoreResult {
  textScore: number
  matchedFields: SearchFieldKey[]
}

/**
 * Scores one document against an interpreted query.
 *
 * Returns null when the document fails the AND requirement: every full-weight
 * query token must match something, somewhere. That is what makes a two-word
 * query actually narrow — without it, "ortho tampa" would rank every clinic in
 * Miami that happens to do orthopedics.
 */
function scoreDoc(
  doc: SearchDoc,
  interpretation: QueryInterpretation,
  cache: SimilarityCache,
  /**
   * Best similarity each query token achieved anywhere in the corpus. Used to
   * decide which tokens are worth offering a spelling correction for — a
   * boolean "matched at all" is too coarse, because the fuzzy matcher already
   * absorbs most typos and would leave nothing to suggest.
   */
  tokenReach: Map<string, number>
): ScoreResult | null {
  const { tokens, phrase, zip } = interpretation

  // Empty query: every document is equally relevant, and the formula below
  // degrades into pure proximity ordering. Same code path as a real search.
  if (tokens.length === 0 && !zip) {
    return { textScore: 1, matchedFields: [] }
  }

  const zipMatches = zip !== null && doc.zip !== null && doc.zip === zip

  // Per-token best across every field, for the AND gate.
  const tokenBest = new Array<number>(tokens.length).fill(0)
  const fieldScores: Partial<Record<SearchFieldKey, number>> = {}
  const matchedFields: SearchFieldKey[] = []

  let weightSum = 0
  for (const token of tokens) weightSum += token.weight
  if (weightSum === 0) weightSum = 1

  for (const field of SEARCH_FIELDS) {
    // ZIP is exact-match only; it never goes through the fuzzy ladder.
    if (field === 'zip') continue
    const docTokens = doc.tokens[field]
    if (!docTokens || docTokens.length === 0) continue

    let weighted = 0
    for (let i = 0; i < tokens.length; i++) {
      const best = bestTokenMatch(tokens[i], docTokens, cache)
      if (best > tokenBest[i]) tokenBest[i] = best
      weighted += best * tokens[i].weight
    }

    let coverage = weighted / weightSum
    if (coverage <= 0) continue

    const fieldText = doc.text[field]
    if (phrase && fieldText && fieldText.includes(phrase)) {
      coverage += PHRASE_BONUS
    }
    const capped = Math.min(1, coverage)
    fieldScores[field] = capped
    matchedFields.push(field)
  }

  // AND gate. Entity suffixes ("PA", "LLC") are exempt — they carry reduced
  // weight precisely because they should never decide a match on their own.
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i].raw
    const previous = tokenReach.get(raw) ?? 0
    if (tokenBest[i] > previous) tokenReach.set(raw, tokenBest[i])
    if (tokens[i].weight < 1) continue
    if (tokenBest[i] > 0) continue
    // A ZIP hit rescues the document: "32801 chiropractic" should still find a
    // clinic in that ZIP whose name has nothing to do with the word.
    if (!zipMatches) return null
  }

  let best = 0
  let sum = 0
  for (const field of matchedFields) {
    const value = FIELD_WEIGHTS[field] * (fieldScores[field] ?? 0)
    sum += value
    if (value > best) best = value
  }

  let textScore = (best + CROSS_FIELD_FACTOR * (sum - best)) / MAX_WEIGHT

  if (zipMatches) {
    textScore = Math.max(textScore, 1)
    if (!matchedFields.includes('zip')) matchedFields.push('zip')
  }

  if (textScore <= 0) return null
  return { textScore, matchedFields }
}

function passesFilters(doc: SearchDoc, filters: SearchFilters | undefined): boolean {
  if (!filters) return true
  if (filters.availableOnly && !doc.available) return false
  // An EMPTY list means "none of them", not "no filter".
  //
  // `filters.types` is only ever set by `useMapSearch`, which builds it from
  // the two pin toggles, so an empty array means the user switched both off —
  // and the honest answer to that is no results. Guarding on `.length > 0`
  // treated it as "unset" instead, so on the clinic map, where the attorney
  // toggle is already off, unchecking Clinics did nothing at all: every pin
  // stayed on screen and the button looked broken.
  //
  // Absent (`undefined`) still means unfiltered; the directory and the
  // specialists list never set it.
  if (filters.types && !filters.types.includes(doc.type)) return false
  if (filters.states && filters.states.length > 0) {
    if (!doc.state || !filters.states.includes(doc.state)) return false
  }
  if (filters.counties && filters.counties.length > 0) {
    if (!doc.county || !filters.counties.includes(doc.county)) return false
  }
  if (filters.cities && filters.cities.length > 0) {
    if (!doc.city || !filters.cities.includes(doc.city)) return false
  }
  if (filters.regions && filters.regions.length > 0) {
    if (!doc.region || !filters.regions.includes(doc.region)) return false
  }
  if (filters.tags && filters.tags.length > 0) {
    if (!doc.tags.some((tag) => filters.tags!.includes(tag))) return false
  }
  return true
}

function withinBounds(doc: SearchDoc, bounds: Bounds): boolean {
  if (doc.lat < bounds.south || doc.lat > bounds.north) return false
  // Defensive antimeridian handling. FL and MN never trigger it, but a wrapped
  // viewport would silently return nothing otherwise.
  if (bounds.west <= bounds.east) {
    return doc.lng >= bounds.west && doc.lng <= bounds.east
  }
  return doc.lng >= bounds.west || doc.lng <= bounds.east
}

function proximity(distance: number): number {
  if (!Number.isFinite(distance)) return 0
  return 1 / (1 + distance / TAU_MILES)
}

function compare(a: SearchHit, b: SearchHit, sort: string): number {
  switch (sort) {
    case 'distance': {
      const d = a.distance - b.distance
      if (d !== 0) return d
      break
    }
    case 'name': {
      const n = a.doc.text.name?.localeCompare(b.doc.text.name ?? '') ?? 0
      if (n !== 0) return n
      break
    }
    case 'availability': {
      if (a.doc.available !== b.doc.available) return a.doc.available ? -1 : 1
      const s = b.score - a.score
      if (s !== 0) return s
      break
    }
    default: {
      const s = b.score - a.score
      if (s !== 0) return s
      break
    }
  }
  // Deterministic tie-break, so repeated renders and snapshot tests are stable.
  return a.doc.id.localeCompare(b.doc.id)
}

export function search<T>(
  index: SearchIndex<T>,
  rawQuery: string,
  options: SearchOptions = {},
  /**
   * Internal. False on the verification pass inside `verifiedCorrection`, which
   * is what stops a corrected-but-still-thin query from recursing forever.
   */
  allowCorrection = true
): SearchOutcome<T> {
  const interpretation = interpretQuery(rawQuery)
  const {
    anchor = null,
    bounds = null,
    radiusMiles = null,
    sort = interpretation.kind === 'empty' && anchor ? 'distance' : 'relevance',
    filters,
    limit,
    minScore = DEFAULT_MIN_SCORE,
  } = options

  const cache: SimilarityCache = new Map()
  const hasQuery = interpretation.kind !== 'empty'
  const tokenReach = new Map<string, number>()
  const hits: SearchHit<T>[] = []
  // Facets are computed over everything that matched the TEXT, before the
  // spatial and chip filters, so a chip never reports zero for a value that
  // selecting it would reveal.
  const textMatched: SearchHit<T>[] = []

  for (const doc of index.docs) {
    const scored = scoreDoc(doc, interpretation, cache, tokenReach)
    if (!scored) continue
    if (hasQuery && scored.textScore < minScore) continue

    const distance = anchor
      ? haversineDistance(anchor[0], anchor[1], doc.lat, doc.lng)
      : Infinity

    const hit: SearchHit<T> = {
      doc,
      score: 0,
      textScore: scored.textScore,
      distance,
      matchedFields: scored.matchedFields,
    }

    if (bounds && !withinBounds(doc, bounds)) continue
    if (radiusMiles !== null && anchor && distance > radiusMiles) continue

    hit.score =
      scored.textScore *
      (1 + ALPHA * proximity(distance)) *
      (doc.available ? AVAILABILITY_BOOST : 1)

    textMatched.push(hit)
    if (passesFilters(doc, filters)) hits.push(hit)
  }

  hits.sort((a, b) => compare(a, b, sort))

  const total = hits.length
  const limited = typeof limit === 'number' && limit >= 0 ? hits.slice(0, limit) : hits

  return {
    hits: limited,
    total,
    didYouMean: allowCorrection && hasQuery && total < 3
      ? verifiedCorrection(index, interpretation, tokenReach, options, total)
      : null,
    facets: computeFacets(textMatched, filters),
    interpretation,
  }
}

/**
 * Proposes a spelling correction and only returns it if it genuinely helps.
 *
 * Re-running the search costs one extra scan (~2 ms on this corpus) and buys
 * the guarantee that we never show "Did you mean X?" leading to another empty
 * page — the classic failure that makes a search feel broken rather than
 * helpful.
 */
function verifiedCorrection<T>(
  index: SearchIndex<T>,
  interpretation: QueryInterpretation,
  tokenReach: ReadonlyMap<string, number>,
  options: SearchOptions,
  currentTotal: number
): string | null {
  // Only tokens that barely matched anything are correction candidates.
  const weak = new Set<string>()
  for (const token of interpretation.tokens) {
    if ((tokenReach.get(token.raw) ?? 0) < WEAK_MATCH_REACH) weak.add(token.raw)
  }
  if (weak.size === 0) return null

  const suggestion = suggestCorrection(index.lexicon, interpretation, weak)
  if (!suggestion || suggestion === interpretation.raw) return null

  // Verify against the same filters, so the count comparison is like-for-like.
  const check = search(index, suggestion, { ...options, limit: 0 }, false)
  return check.total > currentTotal ? suggestion : null
}

/**
 * Top entity matches for the search box's suggestion list.
 *
 * Intentionally ignores spatial filters: a suggestion dropdown should be able
 * to jump you to a firm that is off-screen.
 */
export function suggestEntities<T>(
  index: SearchIndex<T>,
  rawQuery: string,
  limit = 5,
  anchor?: readonly [number, number] | null
): SearchHit<T>[] {
  if (!rawQuery || rawQuery.trim().length < 2) return []
  return search(index, rawQuery, { anchor, limit, sort: 'relevance' }).hits
}
