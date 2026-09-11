/**
 * Florida places, so the directory knows where things are.
 *
 * Until this existed, the search's entire geography was whatever the
 * 627 firm records happened to contain. A city with no firm in it was
 * indistinguishable from a city that does not exist — "Anna Maria"
 * returned the same blank page as "Zzzz" — and "Bradenton" had no idea
 * it was in Manatee County, even though seventeen firms in that county
 * say so on their own rows.
 *
 * Built by `scripts/places/build-fl-gazetteer.ts` from the address
 * index already in this repo. Pure data and pure functions: no network,
 * no geocoder, nothing per-search to pay for.
 *
 * This module is deliberately OUTSIDE `src/lib/search`. Folding it into
 * the engine would make every caller — the portal map, the specialists
 * list — silently start anchoring on city names, fighting the explicit
 * `anchor` those surfaces already pass. Callers opt in instead.
 */
import { haversineDistance } from '@/lib/map/geo'
import { tokenSimilarity } from '@/lib/search/fuzzy'
import { fold } from '@/lib/search/text'
import raw from './fl-places.json'

export interface Place {
  /** As written, for display: "Bradenton". */
  name: string
  /** Bare, matching the storage convention in `lawyers.county`. */
  county: string
  lat: number
  lng: number
  /** Folded name, which is what every lookup here is keyed on. */
  key: string
  /** Address points behind the name. A size proxy, not a population. */
  points: number
}

type PlaceTuple = [string, string, number, number, number]

export const FL_PLACES: readonly Place[] = (raw.places as PlaceTuple[]).map(
  ([name, county, lat, lng, points]) => ({
    name,
    county,
    lat,
    lng,
    points,
    key: fold(name),
  })
)

/**
 * "St." and "Saint" are the same place.
 *
 * The source data does not agree with itself — it has "Saint Augustine"
 * and "St Petersburg" — and the corpus writes "St. Augustine", which
 * folds to "st augustine" and matched neither. Fifteen firms lost their
 * anchor to a full stop.
 */
function saintAliases(key: string): string[] {
  if (key.startsWith('saint ')) return [`st ${key.slice(6)}`]
  if (key.startsWith('st ')) return [`saint ${key.slice(3)}`]
  return []
}

/**
 * Folded name to place, largest first.
 *
 * Florida reuses place names across counties — there is a Greenville in
 * Madison and an Oakland in Orange, and a sliver of Fort Myers in
 * Charlotte as well as the real one in Lee. A bare name means the
 * biggest one; `lookupPlace` takes a county hint for the rest.
 */
const BY_KEY = new Map<string, Place[]>()
for (const place of FL_PLACES) {
  for (const key of [place.key, ...saintAliases(place.key)]) {
    const list = BY_KEY.get(key)
    if (list) list.push(place)
    else BY_KEY.set(key, [place])
  }
}
// forEach rather than for-of over values(): the project compiles at the
// default ES5 target, where iterating a Map needs downlevelIteration.
BY_KEY.forEach((list) => list.sort((a, b) => b.points - a.points))

/** Counties, as the average of their places. Derived, never stored. */
export const FL_COUNTY_CENTROIDS: ReadonlyMap<string, { lat: number; lng: number }> =
  (() => {
    const sums = new Map<string, { lat: number; lng: number; n: number }>()
    for (const place of FL_PLACES) {
      const key = fold(place.county)
      const acc = sums.get(key)
      if (acc) {
        acc.lat += place.lat
        acc.lng += place.lng
        acc.n += 1
      } else {
        sums.set(key, { lat: place.lat, lng: place.lng, n: 1 })
      }
    }
    const out = new Map<string, { lat: number; lng: number }>()
    sums.forEach((acc, key) => {
      out.set(key, { lat: acc.lat / acc.n, lng: acc.lng / acc.n })
    })
    return out
  })()

/** The county's stored spelling, from its folded form. */
const COUNTY_NAMES = new Map<string, string>()
for (const place of FL_PLACES) COUNTY_NAMES.set(fold(place.county), place.county)

export function countyName(folded: string): string | null {
  return COUNTY_NAMES.get(folded) ?? null
}

/**
 * Resolves a folded place name.
 *
 * `county` disambiguates a repeated name; without it the first listed
 * wins, which the builder orders by address count.
 */
export function lookupPlace(folded: string, county?: string | null): Place | null {
  const matches = BY_KEY.get(folded)
  if (!matches || matches.length === 0) return null
  if (county) {
    const hinted = matches.find((p) => fold(p.county) === fold(county))
    if (hinted) return hinted
  }
  return matches[0]
}

/** Every place in a county, for "nothing here, try nearby". */
export function placesInCounty(county: string): Place[] {
  const folded = fold(county)
  return FL_PLACES.filter((p) => fold(p.county) === folded)
}

export interface PlaceMatch extends Place {
  /** 0..1, from the same ladder the scorer uses. */
  score: number
  /** The row is a county, not a city in one. */
  isCounty: boolean
}

/** Counties as pseudo-places, so the dropdown can offer them too. */
const COUNTY_PLACES: readonly Place[] = (() => {
  const out: Place[] = []
  FL_COUNTY_CENTROIDS.forEach((centre, key) => {
    const name = COUNTY_NAMES.get(key)
    if (!name) return
    out.push({
      name,
      county: name,
      lat: centre.lat,
      lng: centre.lng,
      key,
      // Counties sort below cities of the same name on purpose: a bare
      // "Orange" means the city far more often than the county.
      points: 0,
    })
  })
  return out
})()

/**
 * Fuzzy place matches for the suggestion dropdown.
 *
 * Reuses `tokenSimilarity` rather than reimplementing one, so a
 * half-typed city behaves the same here as it does in the results
 * underneath — the dropdown agreeing with the ranking is the whole
 * reason `splitOnMatch` highlights by prefix too.
 */
export function matchFloridaPlaces(query: string, limit = 4): PlaceMatch[] {
  const folded = fold(query)
  if (folded.length < 2) return []

  // "manatee county" must find the county, so the trailing qualifier
  // comes off before matching — same word the scorer gives reduced
  // weight, for the same reason.
  const bare = folded.replace(/\s+county$/, '')

  const score = (place: Place, target: string): number => {
    const keys = [place.key, ...saintAliases(place.key)]
    if (keys.includes(target)) return 1
    if (keys.some((k) => k.startsWith(target))) return 0.9
    // Multi-word names have to be reachable by their distinctive word:
    // "Anna Maria" from "maria", "Lake Worth" from "worth".
    let best = 0
    for (const word of place.key.split(' ')) {
      const value = tokenSimilarity(target, word)
      if (value > best) best = value
    }
    return best
  }

  const out: PlaceMatch[] = []
  for (const place of FL_PLACES) {
    const value = score(place, folded)
    if (value >= 0.72) out.push({ ...place, score: value, isCounty: false })
  }
  for (const place of COUNTY_PLACES) {
    const value = score(place, bare)
    if (value >= 0.72) out.push({ ...place, score: value, isCounty: true })
  }

  return out
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.points - a.points ||
        Number(a.isCounty) - Number(b.isCounty) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit)
}

/**
 * The nearest places in an index to a point, with how many docs each has.
 *
 * Takes an anchor rather than a `Place`, so it has no dependency on the
 * gazetteer and the portal's map can reuse it unchanged.
 */
export function nearestCities<T extends { city: string | null; lat: number; lng: number }>(
  docs: readonly T[],
  anchor: readonly [number, number],
  limit = 3
): { city: string; miles: number; count: number }[] {
  const byCity = new Map<string, { lat: number; lng: number; count: number }>()
  for (const doc of docs) {
    if (!doc.city) continue
    const acc = byCity.get(doc.city)
    if (acc) {
      acc.count += 1
    } else {
      byCity.set(doc.city, { lat: doc.lat, lng: doc.lng, count: 1 })
    }
  }

  return Array.from(byCity.entries())
    .map(([city, v]) => ({
      city,
      count: v.count,
      miles: haversineDistance(anchor[0], anchor[1], v.lat, v.lng),
    }))
    .filter((c) => Number.isFinite(c.miles))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit)
}
