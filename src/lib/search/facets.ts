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
  // Same rule as the engine: an empty list means "none", not "unset". Kept in
  // step deliberately, or the chip counts would describe a different result
  // set from the one on screen.
  if (exclude !== 'types' && filters.types && !filters.types.includes(doc.type)) return false
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

/**
 * Decides which specialty chips are worth the room the rail has.
 *
 * Order: whatever is already selected, then the featured ones, then the
 * rest by count. Pure, and separate from the component, because the rule it
 * encodes is a product decision that deserves to be readable and tested —
 * not six lines of array arithmetic inside a two-thousand-line view.
 *
 * Featured tags jump the queue only where `count > 0`. A chip pinned into
 * view over an empty result set is a promise the list cannot keep, and the
 * Chip component renders a zero-count chip disabled, so it would arrive
 * greyed out and inert — which reads as a rendering fault, not as a filter.
 */
export function orderFilterChips(
  tags: readonly FacetValue[],
  selectedValues: readonly string[],
  featuredValues: readonly string[],
  maxVisible: number,
  showAll: boolean
): FacetValue[] {
  const selected = tags.filter((t) => selectedValues.includes(t.value))

  const featured: FacetValue[] = []
  for (const value of featuredValues) {
    const tag = tags.find(
      (t) => t.value === value && t.count > 0 && !selectedValues.includes(value)
    )
    if (tag) featured.push(tag)
  }
  const featuredSet = new Set(featured.map((t) => t.value))

  const rest = tags.filter(
    (t) => !selectedValues.includes(t.value) && !featuredSet.has(t.value)
  )

  const pool = [...featured, ...rest]
  const room = Math.max(0, maxVisible - selected.length)
  return [...selected, ...(showAll ? pool : pool.slice(0, room))]
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
