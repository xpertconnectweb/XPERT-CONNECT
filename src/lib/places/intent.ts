/**
 * Does this query name a place in Florida?
 *
 * Pure, index-free and cheap — it reads the gazetteer and nothing else,
 * so a caller can ask before searching and pass the answer in as an
 * anchor. Kept out of `src/lib/search` on purpose: the engine must not
 * start anchoring on city names behind its callers' backs, because the
 * portal's map passes an explicit `anchor` that would then be fighting
 * one nobody asked for.
 */
import { fold } from '@/lib/search/text'
import { countyName, FL_COUNTY_CENTROIDS, lookupPlace, type Place } from './florida'
import type { QueryInterpretation } from '@/lib/search/types'

export interface LocationIntent {
  kind: 'city' | 'county'
  /** For a county, a synthesised place at the county's centroid. */
  place: Place
  /** Display name: "Bradenton" or "Manatee County". */
  label: string
  /** The folded tokens the place name consumed. */
  matched: string[]
}

/**
 * Longest trailing run of tokens first.
 *
 * People put the place at the end — "personal injury bradenton", "family
 * lawyer palm beach gardens" — and the longest match has to win, or
 * "palm beach gardens" resolves to Palm Beach, forty minutes away.
 */
function trailingNgrams(tokens: readonly string[]): string[][] {
  const out: string[][] = []
  for (let start = 0; start < tokens.length; start++) {
    out.push(tokens.slice(start))
  }
  // Longest first.
  return out
}

export function resolveLocationIntent(
  interpretation: QueryInterpretation
): LocationIntent | null {
  const tokens = interpretation.tokens.map((t) => t.raw)
  if (tokens.length === 0) return null

  /**
   * "manatee county" is the county, not a city called Manatee County.
   * The qualifier carries reduced weight in the scorer for the same
   * reason; here it is simply dropped before lookup.
   */
  const qualifiers = new Set(['county', 'parish', 'borough', 'fl', 'florida'])
  const meaningful = tokens.filter((t) => !qualifiers.has(t))
  if (meaningful.length === 0) return null

  const namesCounty = tokens.some((t) => t === 'county')

  for (const gram of trailingNgrams(meaningful)) {
    const folded = gram.join(' ')

    // A county reading wins when the query said "county" out loud.
    const county = countyName(folded)
    if (county && (namesCounty || gram.length === meaningful.length)) {
      const centre = FL_COUNTY_CENTROIDS.get(folded)
      if (centre) {
        return {
          kind: 'county',
          place: {
            name: county,
            county,
            lat: centre.lat,
            lng: centre.lng,
            key: folded,
            points: 0,
          },
          label: `${county} County`,
          matched: gram,
        }
      }
    }

    const place = lookupPlace(folded)
    if (place) {
      return { kind: 'city', place, label: place.name, matched: gram }
    }
  }

  return null
}
