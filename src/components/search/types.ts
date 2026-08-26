import type { GeocodeSuggestion } from '@/types/geocode'

/**
 * Suggestion model for the unified search box.
 *
 * Deliberately independent of Leaflet and of the clinic/lawyer domain types so
 * `SmartSearchBox` can be used by the map, the attorney directory and the
 * specialists list without any of them pulling in the map chunk.
 */

export type SuggestionKind = 'recent' | 'place' | 'entity' | 'category' | 'manual'

export type SuggestionPayload =
  | {
      kind: 'place'
      /**
       * The whole suggestion, not a handful of copied fields.
       *
       * It used to be `{ lat, lng, label, placeKind, bbox }`, and `address` was
       * dropped on the floor in `useSmartSearch`'s map. The consequence showed
       * up two layers away: picking a result from the dropdown called
       * `applyPlace` without `address` or `bbox`, so the map never framed the
       * bounding box it had been handed, and the location chip rendered one
       * line where it was designed to render two. Passing the object through
       * makes that class of omission impossible rather than merely fixed.
       */
      suggestion: GeocodeSuggestion
    }
  /**
   * A provider, carrying enough to navigate to it WITHOUT looking it up again.
   *
   * The id alone was not enough, and the gap was invisible. `suggestEntities`
   * ignores spatial and type filters on purpose -- its own comment says a
   * dropdown should be able to jump you to a firm that is off-screen -- but the
   * map resolved the id against its FILTERED result set. With Attorneys
   * switched off, a radius applied, or 'This area only' set, the lookup missed
   * and the handler returned silently. The row rendered, the click did nothing,
   * and nothing anywhere said why.
   *
   * Carrying the coordinates makes the suggestion self-sufficient, so the jump
   * is always possible and the filter question becomes what it should have been
   * all along: something to TELL the user about, not a reason to do nothing.
   */
  | { kind: 'entity'; id: string; lat: number; lng: number; name: string }
  | { kind: 'category'; tag: string }
  | { kind: 'recent'; query: string }
  /** "None of these — let me point at it on the map." */
  | { kind: 'manual'; query: string }

export interface Suggestion {
  /** Stable within a render; used as the `aria-activedescendant` target. */
  id: string
  kind: SuggestionKind
  label: string
  sublabel?: string
  /** Trailing text, e.g. a distance or a result count. */
  meta?: string
  /**
   * Colours `meta`. Defaults to muted, which is right for a distance or a
   * count; `warning` is for a caveat the user should read BEFORE choosing the
   * row, such as a place the provider could only locate approximately.
   */
  metaTone?: 'muted' | 'warning'
  /** Offers a dismiss affordance. Used by search history. */
  removable?: boolean
  payload: SuggestionPayload
}

/**
 * What a source is currently doing, as distinct from what it returned.
 *
 * Replaces a pair of booleans that could not express the two states users
 * actually hit. `SmartSearchBox` used to drop any group that was not loading,
 * not errored and empty — so "we have never heard of that address" and "you
 * have typed too few characters to ask" both rendered as nothing at all, and
 * the only feedback was a dropdown that quietly shrank. People retyped
 * perfectly good addresses because of it.
 */
export type SuggestionGroupStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'empty'
  | 'error'
  | 'rate_limited'

export interface SuggestionGroup {
  key: string
  heading: string
  items: Suggestion[]
  status?: SuggestionGroupStatus
  /** Shown instead of rows when `status` is `empty`. Should name a way out. */
  emptyHint?: string
  /**
   * Credit the data source requires, rendered under the group's rows.
   *
   * A licence term rather than a courtesy: Geoapify's free plan permits
   * commercial use on the condition that it is displayed, and OSM's ODbL
   * requires the same. The group carries it instead of the box hard-coding one,
   * because which provider answered is a runtime fact.
   */
  attribution?: string
  /**
   * Render placeholder rows instead of items while a source is in flight.
   * Derived from `status`; kept for one release so existing callers and
   * `tests/components/SmartSearchBox.test.tsx` do not break in the same commit.
   */
  loading?: boolean
  /**
   * The source failed, as distinct from returning nothing. Without this, a
   * geocoder outage renders identically to "no such address" and the user
   * retypes a perfectly good one.
   */
  error?: boolean
}

/** The single place `status` and the legacy booleans are reconciled. */
export function groupStatus(group: SuggestionGroup): SuggestionGroupStatus {
  if (group.status) return group.status
  if (group.loading) return 'loading'
  if (group.error) return 'error'
  return group.items.length > 0 ? 'ok' : 'empty'
}

/**
 * Flattens groups to the visible, selectable order used by keyboard nav.
 *
 * Only `items` are included, which is what keeps the status rows — "no match",
 * "keep typing", the outage warning — skippable by the arrow keys. They render
 * as `role="presentation"`, and anything that made them focusable would put a
 * dead stop in the middle of the list.
 */
export function flattenSuggestions(groups: readonly SuggestionGroup[]): Suggestion[] {
  const out: Suggestion[] = []
  for (const group of groups) {
    for (const item of group.items) out.push(item)
  }
  return out
}
