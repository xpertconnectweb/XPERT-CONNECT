import type { Facets, FacetValue, SearchDocType, SearchFilters, SearchHit } from './types'

/**
 * Counts for the filter chips.
 *
 * The rule that makes chips feel right: each facet's counts are computed with
 * that facet's OWN filter excluded, but every other active filter applied. So
 * selecting "Chiropractic" does not zero out every other specialty chip — you
 * can still see, and switch to, "Physical Therapy".
 *
 * This generalizes the choice already made by hand in AttorneyDirectory, where
 * practice-area counts are scoped by county but deliberately not by the query,
 * so the card grid doesn't collapse while you type.
 */
function countBy<T>(
  hits: readonly SearchHit[],
  filters: SearchFilters | undefined,
  exclude: keyof SearchFilters,
  pick: (hit: SearchHit) => T | T[] | null
): Map<T, number> {
  const counts = new Map<T, number>()
  for (const hit of hits) {
    if (!passesExcept(hit, filters, exclude)) continue
    const value = pick(hit)
    if (value === null) continue
    const values = Array.isArray(value) ? value : [value]
    for (const v of values) {
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }
  return counts
}

/** Applies every active filter except the named one. */
function passesExcept(
  hit: SearchHit,
  filters: SearchFilters | undefined,
  exclude: keyof SearchFilters
): boolean {
  if (!filters) return true
  const doc = hit.doc
  if (exclude !== 'availableOnly' && filters.availableOnly && !doc.available) return false
  if (exclude !== 'types' && filters.types?.length && !filters.types.includes(doc.type)) return false
  if (exclude !== 'states' && filters.states?.length) {
    if (!doc.state || !filters.states.includes(doc.state)) return false
  }
  if (exclude !== 'counties' && filters.counties?.length) {
    if (!doc.county || !filters.counties.includes(doc.county)) return false
  }
  if (exclude !== 'cities' && filters.cities?.length) {
    if (!doc.city || !filters.cities.includes(doc.city)) return false
  }
  if (exclude !== 'regions' && filters.regions?.length) {
    if (!doc.region || !filters.regions.includes(doc.region)) return false
  }
  if (exclude !== 'tags' && filters.tags?.length) {
    if (!doc.tags.some((tag) => filters.tags!.includes(tag))) return false
  }
  return true
}

function toSortedValues(counts: Map<string, number>): FacetValue[] {
  return Array.from(counts, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value)
  )
}

export function computeFacets(
  hits: readonly SearchHit[],
  filters?: SearchFilters
): Facets {
  const tags = countBy<string>(hits, filters, 'tags', (h) => [...h.doc.tags])
  const counties = countBy<string>(hits, filters, 'counties', (h) => h.doc.county)
  const cities = countBy<string>(hits, filters, 'cities', (h) => h.doc.city)
  const states = countBy<string>(hits, filters, 'states', (h) => h.doc.state)
  const regions = countBy<string>(hits, filters, 'regions', (h) => h.doc.region)
  const types = countBy<SearchDocType>(hits, filters, 'types', (h) => h.doc.type)

  let available = 0
  for (const hit of hits) {
    if (passesExcept(hit, filters, 'availableOnly') && hit.doc.available) available++
  }

  return {
    tags: toSortedValues(tags),
    counties: toSortedValues(counties),
    cities: toSortedValues(cities),
    states: toSortedValues(states),
    regions: toSortedValues(regions),
    types: Array.from(types, ([value, count]) => ({ value, count })).sort(
      (a, b) => b.count - a.count
    ),
    available,
  }
}
