import type { ExpandedToken } from './text'

/** The fields a record can be matched on. */
export type SearchFieldKey =
  | 'name'
  | 'zip'
  | 'specialty'
  | 'city'
  | 'county'
  | 'region'
  | 'street'
  | 'state'
  /**
   * Generic words for what the record *is* ("attorney", "law firm", "clinic",
   * "provider"). Kept apart from `specialty` so that vocabulary never leaks
   * into the specialty facet counts, while still letting "orlando attorney"
   * find something — with strict AND semantics, a query token that matches
   * nothing drops the whole record.
   */
  | 'kind'

export const SEARCH_FIELDS: readonly SearchFieldKey[] = [
  'name',
  'zip',
  'specialty',
  'city',
  'county',
  'region',
  'street',
  'state',
  'kind',
]

export type SearchDocType = 'clinic' | 'lawyer'

/**
 * A record prepared for searching.
 *
 * Token arrays and folded field strings are computed once at index build time,
 * never per keystroke. `source` carries the original domain object back out so
 * rendering never has to re-look-it-up.
 *
 * Every field is optional: the professionals and partners maps deliberately
 * withhold street and phone, so `street` is simply absent there. Nothing in the
 * scorer special-cases that — a missing field just contributes zero.
 */
export interface SearchDoc<T = unknown> {
  id: string
  type: SearchDocType
  tokens: Partial<Record<SearchFieldKey, readonly string[]>>
  text: Partial<Record<SearchFieldKey, string>>
  /** Canonical specialties or practice areas, for chip filtering and facets. */
  tags: readonly string[]
  city: string | null
  state: string | null
  zip: string | null
  county: string | null
  region: string | null
  lat: number
  lng: number
  available: boolean
  source: T
}

export type QueryKind = 'empty' | 'zip' | 'text' | 'mixed'

export interface QueryInterpretation {
  kind: QueryKind
  raw: string
  /** Exact five-digit ZIP if one appears anywhere in the query. */
  zip: string | null
  /** Expanded query tokens, with any ZIP token removed. */
  tokens: ExpandedToken[]
  /** The folded whole-query string, used for the phrase-containment bonus. */
  phrase: string
  /**
   * The query asked for "near me" — the words have been removed from
   * `phrase` and `tokens`, and what is left is the real search.
   *
   * Reported, never acted on. `search()` has no way to geolocate anyone
   * and must not: resolving someone's position because they typed a
   * word is not a thing to do without being asked. The surface decides
   * what to offer, which on the public directory is a one-tap "Use my
   * location" above the results.
   */
  nearMe: boolean
}

export type SortMode = 'relevance' | 'distance' | 'name' | 'availability'

/** Geographic bounds, expressed without importing Leaflet. */
export interface Bounds {
  south: number
  north: number
  west: number
  east: number
}

export interface SearchFilters {
  /** OR within the list; a doc matches if it carries any of these tags. */
  tags?: readonly string[]
  types?: readonly SearchDocType[]
  states?: readonly string[]
  counties?: readonly string[]
  cities?: readonly string[]
  regions?: readonly string[]
  availableOnly?: boolean
}

export interface SearchOptions {
  /** Origin for distance measurement, usually the searched client address. */
  anchor?: readonly [number, number] | null
  /** Viewport filter, set by "Search this area". */
  bounds?: Bounds | null
  /** Radius filter in miles, only meaningful with an anchor. */
  radiusMiles?: number | null
  sort?: SortMode
  filters?: SearchFilters
  limit?: number
  /** Relevance floor for non-empty queries. Below this a hit is noise. */
  minScore?: number
  /**
   * A ZIP alongside other words narrows the results to that ZIP.
   *
   * On by default, because a postcode is a statement about where. The
   * escape hatch exists for one reason: this changes the map's
   * behaviour for queries like "32801 chiropractic", which used to
   * return every chiropractor in the state ranked with the local ones
   * on top. If that turns out to be load-bearing for someone, it is one
   * line to put back rather than a revert.
   */
  zipNarrows?: boolean
  /**
   * Drop the AND requirement: score documents that match only some of
   * the query's tokens.
   *
   * Off by default, and it must stay that way — the AND gate is what
   * makes a two-word query narrow at all. This exists for the "Closest
   * matches" rung of `searchWithFallback`, which runs only after an
   * exact search has already come back empty.
   */
  requireAll?: boolean
}

export interface SearchHit<T = unknown> {
  doc: SearchDoc<T>
  /** Final blended score used for ordering. */
  score: number
  /** Text relevance before the distance blend, ~0..1.15. */
  textScore: number
  /** Miles from the anchor; Infinity when there is no anchor. */
  distance: number
  matchedFields: SearchFieldKey[]
  /** The document is in the ZIP the query named, if it named one. */
  inZip?: boolean
}

export interface FacetValue {
  value: string
  count: number
}

export interface Facets {
  tags: FacetValue[]
  counties: FacetValue[]
  cities: FacetValue[]
  states: FacetValue[]
  regions: FacetValue[]
  types: { value: SearchDocType; count: number }[]
  available: number
}

export interface SearchOutcome<T = unknown> {
  hits: SearchHit<T>[]
  /** Matches after filtering, before `limit` is applied. */
  total: number
  didYouMean: string | null
  facets: Facets
  interpretation: QueryInterpretation
}
