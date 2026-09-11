/**
 * What to do when a search finds nothing.
 *
 * "No firms match these filters" is true and useless. It cannot tell
 * apart the four reasons a query comes back empty, and each one has a
 * different way out:
 *
 *   Personal Injury Bradenton  the city is real, the practice area is
 *                              real, and no firm is both
 *   Anna Maria                 the place is real and we cover none of it
 *   Bradneton                  a typo the corrector cannot reach
 *   zzzz                       nothing
 *
 * So the engine reports facts and this decides what to try next. It
 * lives outside `search()` deliberately: every portal caller would
 * otherwise inherit the ladder, and the map's counts and marker logic
 * assume `hits` are matches rather than consolation prizes.
 */
import { search, type SearchIndex } from './engine'
import type { SearchFilters, SearchOptions, SearchOutcome } from './types'

export type LadderKind = 'filters-relaxed' | 'partial' | 'nearby'

export interface SearchLadderStep<T = unknown> {
  kind: LadderKind
  outcome: SearchOutcome<T>
  /** What the rung gave up to find these. */
  dropped?: { filters?: (keyof SearchFilters)[] }
  /** Set on the `nearby` rung. */
  near?: { place: string; miles: number; count: number; city: string }
}

export interface FallbackResult<T = unknown> {
  /** The real answer. Facets and counts must be read from here. */
  primary: SearchOutcome<T>
  /** The consolation, or null when the primary found something. */
  fallback: SearchLadderStep<T> | null
}

export interface LadderOptions {
  /**
   * Where the query pointed, if anywhere. Supplied by the caller from
   * `resolveLocationIntent` so this module keeps no dependency on the
   * gazetteer — and so the rungs can order by distance from the place
   * the visitor actually named.
   */
  anchor?: readonly [number, number] | null
  /** Names the place in the "nothing here" message. */
  placeLabel?: string | null
  /** Nearest cities to the anchor, computed by the caller over the index. */
  nearest?: { city: string; miles: number; count: number }[]
  /**
   * The query was nothing but a place name.
   *
   * This reorders the ladder, and it has to. Partial matching on a
   * place is not a near miss, it is word salad: "Key West" came back
   * with 38 firms whose only connection was the word "west", and "Anna
   * Maria" with a firm belonging to someone called Maria. Presenting
   * those as "closest matches" is worse than the blank page they
   * replaced, because it looks like an answer.
   *
   * When the whole query was a place, "we do not cover it, here is who
   * is nearest" is the only honest thing left to say.
   */
  placeOnly?: boolean
  limit?: number
}

/** Which filters are actually narrowing anything. */
function activeFilterKeys(filters: SearchFilters | undefined): (keyof SearchFilters)[] {
  if (!filters) return []
  const keys: (keyof SearchFilters)[] = []
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
      keys.push(key as keyof SearchFilters)
    }
  }
  return keys
}

export function searchWithFallback<T>(
  index: SearchIndex<T>,
  rawQuery: string,
  options: SearchOptions = {},
  ladder: LadderOptions = {}
): FallbackResult<T> {
  const primary = search(index, rawQuery, options)
  if (primary.total > 0 || primary.interpretation.kind === 'empty') {
    return { primary, fallback: null }
  }

  const { anchor = null, placeLabel = null, nearest = [], placeOnly = false, limit } = ladder
  const base: SearchOptions = { ...options, limit, anchor: anchor ?? options.anchor ?? null }

  /** Rung 3, hoisted so rung 2 can defer to it for a bare place name. */
  const nearbyStep = (): SearchLadderStep<T> | null => {
    if (!anchor || nearest.length === 0) return null
    const closest = nearest[0]
    const outcome = search(index, '', {
      ...base,
      filters: undefined,
      anchor,
      sort: 'distance',
    })
    if (outcome.total === 0) return null
    return {
      kind: 'nearby',
      outcome,
      near: {
        place: placeLabel ?? closest.city,
        city: closest.city,
        miles: closest.miles,
        count: closest.count,
      },
    }
  }

  /**
   * Rung 1 — drop the filters, keep the words.
   *
   * The cheapest and by far the most common: someone picks a
   * practice-area card, then types a city that has no firm in that
   * area. "0 with these filters, 11 matching Bradenton overall" is an
   * answer; a blank page is not.
   */
  const dropped = activeFilterKeys(options.filters)
  if (dropped.length > 0) {
    const relaxed = search(index, rawQuery, { ...base, filters: undefined })
    if (relaxed.total > 0) {
      return { primary, fallback: { kind: 'filters-relaxed', outcome: relaxed, dropped: { filters: dropped } } }
    }
  }

  /**
   * A bare place name skips straight to "who is nearest". Breaking it
   * into words and matching those is how "Key West" produced 38 firms
   * that merely contained "west".
   */
  if (placeOnly) {
    const nearby = nearbyStep()
    if (nearby) return { primary, fallback: nearby }
  }

  /**
   * Rung 2 — match some of the words instead of all of them.
   *
   * Anchored where possible, so "Personal Injury Bradenton" comes back
   * ordered by distance from Bradenton rather than by whichever
   * personal-injury firm happens to score highest in Miami.
   */
  const partial = search(index, rawQuery, {
    ...base,
    filters: undefined,
    requireAll: false,
    minScore: 0,
    /**
     * Distance, not relevance, whenever there is an anchor — because
     * the banner over these rows says "closest", and it has to be true.
     * Relevance led "Personal Injury Bradenton" with a firm 37 miles
     * away, on the strength of having the words in its name, above one
     * 9 miles away that did not. Nothing about that row explains why it
     * is first, so it just looks wrong.
     */
    sort: anchor ? 'distance' : base.sort,
  })
  if (partial.total > 0) {
    return { primary, fallback: { kind: 'partial', outcome: partial } }
  }

  /** Rung 3 — the place is real and we have nothing anywhere near it. */
  const nearby = nearbyStep()
  if (nearby) return { primary, fallback: nearby }

  return { primary, fallback: null }
}
