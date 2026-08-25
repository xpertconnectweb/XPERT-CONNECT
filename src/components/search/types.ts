import type { GeocodeKind } from '@/types/geocode'

/**
 * Suggestion model for the unified search box.
 *
 * Deliberately independent of Leaflet and of the clinic/lawyer domain types so
 * `SmartSearchBox` can be used by the map, the attorney directory and the
 * specialists list without any of them pulling in the map chunk.
 */

export type SuggestionKind = 'recent' | 'place' | 'entity' | 'category'

export type SuggestionPayload =
  | {
      kind: 'place'
      lat: number
      lng: number
      label: string
      placeKind: GeocodeKind
      bbox: [number, number, number, number] | null
    }
  | { kind: 'entity'; id: string }
  | { kind: 'category'; tag: string }
  | { kind: 'recent'; query: string }

export interface Suggestion {
  /** Stable within a render; used as the `aria-activedescendant` target. */
  id: string
  kind: SuggestionKind
  label: string
  sublabel?: string
  /** Trailing text, e.g. a distance or a result count. */
  meta?: string
  /** Offers a dismiss affordance. Used by search history. */
  removable?: boolean
  payload: SuggestionPayload
}

export interface SuggestionGroup {
  key: string
  heading: string
  items: Suggestion[]
  /** Render placeholder rows instead of items while a source is in flight. */
  loading?: boolean
  /**
   * The source failed, as distinct from returning nothing. Without this, a
   * geocoder outage renders identically to "no such address" and the user
   * retypes a perfectly good one.
   */
  error?: boolean
}

/** Flattens groups to the visible, selectable order used by keyboard nav. */
export function flattenSuggestions(groups: readonly SuggestionGroup[]): Suggestion[] {
  const out: Suggestion[] = []
  for (const group of groups) {
    for (const item of group.items) out.push(item)
  }
  return out
}
