'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGeocoder, type ProximityHint } from './useGeocoder'
import { addRecent, readRecents, removeRecent } from '@/lib/search/recents'
import { suggestEntities, type SearchIndex } from '@/lib/search'
import type { SearchDoc } from '@/lib/search/types'
import { tokenSimilarity } from '@/lib/search/fuzzy'
import { fold } from '@/lib/search/text'
import { ATTRIBUTION, MIN_GEOCODE_QUERY } from '@/lib/geocoding/constants'
import { isExactPrecision } from '@/lib/geocoding/precision'
import type { Facets } from '@/lib/search'
import type {
  Suggestion,
  SuggestionGroup,
  SuggestionGroupStatus,
} from '@/components/search/types'
import type { GeocodeResult, GeocodeSuggestion } from '@/types/geocode'

/**
 * Assembles the suggestion groups for `SmartSearchBox`.
 *
 * Kept out of the component so the assembly rules — which sources appear, in
 * what order, and how many of each — are testable on their own.
 *
 * Group order is fixed and deliberate: local sources first, geocoded places
 * last. Local matches are instant and always correct; the geocoder takes
 * 200-600 ms and is often wrong for business names. Putting places last means
 * the list never reflows under the user's cursor when the network resolves —
 * which is precisely what the old map did, since its dropdown was 100%
 * geocoder and appeared only after a round trip.
 */

const MIN_QUERY = 2
const MAX_RECENTS = 4
const MAX_CATEGORIES = 3
const MAX_ENTITIES = 5
const MAX_PLACES = 4
/** How close a query token must be to a tag before we offer it as a filter. */
const CATEGORY_MATCH_FLOOR = 0.6

/**
 * The name as it should be READ, not as it is matched.
 *
 * `doc.text.name` is the folded form the scorer works on: lowercased and
 * stripped of punctuation. Rendering it put
 * "st cloud orthopedics physical therapy" in the dropdown directly above
 * "St. Cloud Orthopedics Physical Therapy" in the results panel, three
 * centimetres apart on the same screen. That reads as a bug because it is one.
 *
 * `doc.source` carries the original record back out precisely so that
 * rendering never has to reconstruct anything -- the comment on `SearchDoc`
 * says so. It is typed as the caller's `T`, so the name is read defensively
 * rather than by widening the constraint on every call site of this hook.
 */
function displayName<T>(doc: SearchDoc<T>): string {
  const source = doc.source as { name?: unknown } | null | undefined
  if (typeof source?.name === 'string' && source.name.trim()) return source.name
  return doc.text.name ?? doc.id
}

export interface UseSmartSearchOptions<T> {
  index: SearchIndex<T>
  facets: Facets
  query: string
  anchor?: readonly [number, number] | null
  /** Labels the entity group; the directory says "Firms", the map "Providers". */
  entityHeading?: string
  categoryHeading?: string
  /** Disable geocoding where a map is not involved (directory, specialists). */
  places?: boolean
  /**
   * True once a location is already anchored. Only changes the group heading:
   * with an anchor set, picking a place REPLACES where you are searching rather
   * than narrowing it, and "Places" reads like the latter.
   */
  hasAnchor?: boolean
  /** The map's current view, so the provider ranks nearby answers first. */
  proximity?: ProximityHint | null
  /**
   * Offer "place the pin yourself" when the geocoder finds nothing.
   *
   * Only where there is a map to point at. Without it, an address the provider
   * has never heard of is a dead end — which is exactly the case that prompted
   * this work, and the one no provider switch can fully eliminate.
   */
  allowManualPin?: boolean
  /**
   * Offer "Use my location" in the idle dropdown.
   *
   * Only where there is a map to move. In an address field it would resolve
   * the browsing user's own position into a form about someone else, which
   * is a different and much worse thing than it sounds like.
   */
  allowGeolocate?: boolean
}

export interface UseSmartSearchResult {
  groups: SuggestionGroup[]
  /**
   * The geocoder failed, as opposed to finding nothing.
   *
   * `useGeocoder` has always returned this and nobody consumed it, so a 502
   * from `/api/geocode` looked exactly like "no such address" — the user
   * retyped a perfectly good address instead of retrying.
   */
  placesError: boolean
  /** Records a committed search. Call from onSubmit and onSelect. */
  remember: (query: string, near?: { lat: number; lng: number; label: string }) => void
  /** Drops one entry from the history. */
  forget: (query: string) => void
  /**
   * Turns a chosen row into coordinates.
   *
   * Google and Mapbox withhold geometry from autocomplete — that split is how
   * they bill a session rather than a keystroke — so a suggestion is not a
   * location until this has run. For Nominatim it returns immediately.
   */
  resolvePlace: (suggestion: GeocodeSuggestion) => Promise<GeocodeResult | null>
  /** Starts a new billing session. Call when the box is cleared. */
  resetSession: () => void
}

export function useSmartSearch<T>({
  index,
  facets,
  query,
  anchor = null,
  entityHeading = 'Providers',
  categoryHeading = 'Specialties',
  places = true,
  hasAnchor = false,
  proximity = null,
  allowManualPin = false,
  allowGeolocate = false,
}: UseSmartSearchOptions<T>): UseSmartSearchResult {
  const trimmed = query.trim()
  const active = trimmed.length >= MIN_QUERY

  const geocode = useGeocoder(trimmed, {
    enabled: places && active,
    limit: MAX_PLACES,
    proximity,
  })

  // Read once on mount — localStorage is not reactive, and re-reading on every
  // render would be wasted work.
  const [recents, setRecents] = useState<ReturnType<typeof readRecents>>([])
  useEffect(() => {
    setRecents(readRecents())
  }, [])

  const remember = useCallback(
    (value: string, near?: { lat: number; lng: number; label: string }) => {
      const text = value.trim()
      if (!text) return
      setRecents(addRecent({ query: text, near, at: Date.now() }))
    },
    []
  )

  const forget = useCallback((value: string) => {
    setRecents(removeRecent(value))
  }, [])

  const categoryItems = useMemo<Suggestion[]>(() => {
    if (!active) return []
    const folded = fold(trimmed)
    if (!folded) return []
    const tokens = folded.split(' ').filter(Boolean)

    return facets.tags
      .map((tag) => {
        const tagTokens = fold(tag.value).split(' ').filter(Boolean)
        // Best similarity of any query token against any word of the tag, so
        // "ortho" surfaces "Orthopedic Rehabilitation".
        let best = 0
        for (const q of tokens) {
          for (const t of tagTokens) {
            const score = tokenSimilarity(q, t)
            if (score > best) best = score
          }
        }
        return { tag, best }
      })
      .filter(({ best }) => best >= CATEGORY_MATCH_FLOOR)
      .sort((a, b) => b.best - a.best || b.tag.count - a.tag.count)
      .slice(0, MAX_CATEGORIES)
      .map(({ tag }) => ({
        id: `cat-${tag.value}`,
        kind: 'category' as const,
        label: tag.value,
        meta: `${tag.count}`,
        payload: { kind: 'category' as const, tag: tag.value },
      }))
  }, [active, trimmed, facets.tags])

  const entityItems = useMemo<Suggestion[]>(() => {
    if (!active) return []
    return suggestEntities(index, trimmed, MAX_ENTITIES, anchor).map((hit) => {
      const name = displayName(hit.doc)
      return {
        id: `ent-${hit.doc.id}`,
        kind: 'entity' as const,
        label: name,
        sublabel: hit.doc.type === 'lawyer' ? 'Attorney' : 'Clinic',
        meta: Number.isFinite(hit.distance) ? `${hit.distance.toFixed(1)} mi` : undefined,
        // Coordinates travel with the suggestion so choosing it never depends
        // on the chooser being able to find the record again. See the comment
        // on the entity payload in components/search/types.ts.
        payload: {
          kind: 'entity' as const,
          id: hit.doc.id,
          lat: hit.doc.lat,
          lng: hit.doc.lng,
          name,
        },
      }
    })
  }, [active, index, trimmed, anchor])

  const placeItems = useMemo<Suggestion[]>(() => {
    const rows: Suggestion[] = geocode.results.map((result) => ({
      id: `plc-${result.id}`,
      kind: 'place' as const,
      label: result.label,
      sublabel: result.fullLabel === result.label ? undefined : result.fullLabel,
      // Says so up front when the point is not the building. A ZIP centroid and
      // a rooftop hit used to render identically, so someone searching a
      // client's home could be handed the middle of a postcode with no way to
      // tell — and then measure "the nearest clinic" from it.
      meta: isExactPrecision(result.precision) ? undefined : 'Approximate',
      metaTone: 'warning' as const,
      payload: { kind: 'place' as const, suggestion: result },
    }))

    // A selectable row, not a dead line of text. When the provider has never
    // heard of an address the user is looking at, pointing at it on the map is
    // the only way forward, and it has to be reachable by keyboard like
    // anything else in the list.
    if (allowManualPin && geocode.status === 'empty') {
      rows.push({
        id: 'plc-manual',
        kind: 'manual' as const,
        label: 'Place the pin yourself',
        sublabel: 'Click the map to set an exact spot',
        payload: { kind: 'manual' as const, query: trimmed },
      })
    }

    return rows
  }, [geocode.results, geocode.status, allowManualPin, trimmed])

  /**
   * `MIN_QUERY` is 2 so local sources answer early, but the geocoder needs 3.
   * That one-character gap used to render as nothing at all — the "Places"
   * group simply vanished, with no way for the user to know whether it was
   * broken, slow, or waiting. `idle` is the state that says so.
   */
  const placesStatus: SuggestionGroupStatus =
    trimmed.length < MIN_GEOCODE_QUERY ? 'idle' : geocode.status

  const groups = useMemo<SuggestionGroup[]>(() => {
    // With an empty box, offer history rather than an empty dropdown.
    if (!active) {
      /**
       * "Use my location", as a row.
       *
       * It exists as a 40x40 icon button pinned to the opposite corner of the
       * map from the search box — reachable, and nowhere near the place people
       * look when the question in their head is "where do I start". The
       * manual-pin row already proved that an action belongs in this list when
       * it answers the same question the list is for.
       *
       * Only with an empty box. It is an idle-state affordance rather than a
       * search result, and mixing it into live results would put a
       * non-matching row among matching ones.
       *
       * The button stays where it is. It is the only way to re-locate without
       * opening the dropdown, and taking an affordance away buys nothing.
       */
      const idle: SuggestionGroup[] = []
      if (allowGeolocate && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        idle.push({
          key: 'geolocate',
          heading: 'Start from',
          items: [
            {
              id: 'geo-self',
              kind: 'manual' as const,
              label: 'Use my location',
              sublabel: 'Find providers near where you are now',
              payload: { kind: 'geolocate' as const },
            },
          ],
        })
      }

      if (recents.length === 0) return idle
      return [
        ...idle,
        {
          key: 'recent',
          heading: 'Recent searches',
          // Keyed on the query, not the index: removing one entry must not
          // make React reuse the deleted row's id for its neighbour.
          items: recents.slice(0, MAX_RECENTS).map((entry) => ({
            id: `rec-${entry.query.toLowerCase().replace(/\s+/g, '-')}`,
            kind: 'recent' as const,
            label: entry.query,
            sublabel: entry.near?.label,
            removable: true,
            payload: { kind: 'recent' as const, query: entry.query, near: entry.near },
          })),
        },
      ]
    }

    return [
      { key: 'category', heading: categoryHeading, items: categoryItems },
      { key: 'entity', heading: entityHeading, items: entityItems },
      ...(places
        ? [
            {
              key: 'place',
              heading: hasAnchor ? 'Change location' : 'Places',
              items: placeItems,
              status: placesStatus,
              // Names the address that failed, so the user can see whether it
              // is the one they meant. When a manual pin is on offer the row
              // below says so; repeating it here would just be noise.
              emptyHint: `No match for "${trimmed}". Check the spelling, or try the ZIP.`,
              // Read off the results rather than the configured provider, so it
              // credits whoever actually answered — which after a fallback is
              // not always the one in the environment variable.
              attribution: geocode.results[0]
                ? ATTRIBUTION[geocode.results[0].providerId]
                : undefined,
              // Derived, and kept only so callers and component tests written
              // against the booleans survive this release.
              loading: placesStatus === 'loading',
              error: placesStatus === 'error' || placesStatus === 'rate_limited',
            },
          ]
        : []),
    ]
  }, [
    allowGeolocate,
    active,
    recents,
    // `allowManualPin` is NOT here: it stopped being read in this memo when the
    // empty hint stopped mentioning it. The row it controls is built in
    // `placeItems`, which has its own dependency on it.
    categoryHeading,
    categoryItems,
    entityHeading,
    entityItems,
    hasAnchor,
    places,
    placeItems,
    placesStatus,
    trimmed,
    // Read directly for the attribution, so it has to be a dependency in its
    // own right — `placeItems` covers the rows but not which provider answered.
    geocode.results,
  ])

  return {
    groups,
    placesError: places && geocode.error,
    remember,
    forget,
    resolvePlace: geocode.resolve,
    resetSession: geocode.resetSession,
  }
}
