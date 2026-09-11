/**
 * Shared search core.
 *
 * Pure, synchronous and dependency-free (beyond `haversineDistance`), so it can
 * be imported from API routes, migration scripts and every client surface.
 *
 * Typical use:
 *
 *   const index = buildSearchIndex(toSearchDocs(clinics, lawyers))
 *   const { hits, facets, didYouMean } = search(index, query, {
 *     anchor, radiusMiles, filters, sort,
 *   })
 */

export {
  fold,
  tokenize,
  prepareQuery,
  expandQueryTokens,
  applyPhraseExpansions,
  extractZip,
  isZipToken,
  normalizeZip,
  STOPWORDS,
  ENTITY_SUFFIXES,
  GEO_SUFFIXES,
  GEO_TOKEN_WEIGHT,
  SUFFIX_TOKEN_WEIGHT,
  TOKEN_EXPANSIONS,
  PHRASE_EXPANSIONS,
  EXPANSION_PENALTY,
  type ExpandedToken,
} from './text'

export {
  damerauLevenshtein,
  maxEditsFor,
  trigrams,
  trigramSimilarity,
  tokenSimilarity,
} from './fuzzy'

export { interpretQuery } from './query'

export { buildLexicon, suggestCorrection, type Lexicon } from './lexicon'

export { computeFacets } from './facets'

export {
  buildSearchIndex,
  search,
  suggestEntities,
  FIELD_WEIGHTS,
  type SearchIndex,
} from './engine'

export {
  searchWithFallback,
  type FallbackResult,
  type LadderKind,
  type LadderOptions,
  type SearchLadderStep,
} from './fallback'

export {
  clinicToDoc,
  lawyerToDoc,
  toSearchDocs,
  type ClinicLike,
  type LawyerLike,
  type DocOptions,
} from './documents'

export {
  SEARCH_FIELDS,
  type Bounds,
  type Facets,
  type FacetValue,
  type QueryInterpretation,
  type QueryKind,
  type SearchDoc,
  type SearchDocType,
  type SearchFieldKey,
  type SearchFilters,
  type SearchHit,
  type SearchOptions,
  type SearchOutcome,
  type SortMode,
} from './types'
