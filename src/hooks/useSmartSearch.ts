'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGeocoder } from './useGeocoder'
import { addRecent, readRecents, removeRecent } from '@/lib/search/recents'
import { suggestEntities, type SearchIndex } from '@/lib/search'
import { tokenSimilarity } from '@/lib/search/fuzzy'
import { fold } from '@/lib/search/text'
import type { Facets } from '@/lib/search'
import type { Suggestion, SuggestionGroup } from '@/components/search/types'

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
}

export interface UseSmartSearchResult {
  groups: SuggestionGroup[]
  /** Records a committed search. Call from onSubmit and onSelect. */
  remember: (query: string, near?: { lat: number; lng: number; label: string }) => void
  /** Drops one entry from the history. */
  forget: (query: string) => void
}

export function useSmartSearch<T>({
  index,
  facets,
  query,
  anchor = null,
  entityHeading = 'Providers',
  categoryHeading = 'Specialties',
  places = true,
}: UseSmartSearchOptions<T>): UseSmartSearchResult {
  const trimmed = query.trim()
  const active = trimmed.length >= MIN_QUERY

  const geocode = useGeocoder(trimmed, { enabled: places && active, limit: MAX_PLACES })

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
    return suggestEntities(index, trimmed, MAX_ENTITIES, anchor).map((hit) => ({
      id: `ent-${hit.doc.id}`,
      kind: 'entity' as const,
      label: hit.doc.text.name ?? hit.doc.id,
      sublabel: hit.doc.type === 'lawyer' ? 'Attorney' : 'Clinic',
      meta: Number.isFinite(hit.distance) ? `${hit.distance.toFixed(1)} mi` : undefined,
      payload: { kind: 'entity' as const, id: hit.doc.id },
    }))
  }, [active, index, trimmed, anchor])

  const placeItems = useMemo<Suggestion[]>(
    () =>
      geocode.results.map((result) => ({
        id: `plc-${result.id}`,
        kind: 'place' as const,
        label: result.label,
        sublabel: result.fullLabel === result.label ? undefined : result.fullLabel,
        payload: {
          kind: 'place' as const,
          lat: result.lat,
          lng: result.lng,
          label: result.label,
          placeKind: result.kind,
          bbox: result.bbox,
        },
      })),
    [geocode.results]
  )

  const groups = useMemo<SuggestionGroup[]>(() => {
    // With an empty box, offer history rather than an empty dropdown.
    if (!active) {
      if (recents.length === 0) return []
      return [
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
            payload: { kind: 'recent' as const, query: entry.query },
          })),
        },
      ]
    }

    return [
      { key: 'category', heading: categoryHeading, items: categoryItems },
      { key: 'entity', heading: entityHeading, items: entityItems },
      ...(places
        ? [{ key: 'place', heading: 'Places', items: placeItems, loading: geocode.loading }]
        : []),
    ]
  }, [
    active,
    recents,
    categoryHeading,
    categoryItems,
    entityHeading,
    entityItems,
    places,
    placeItems,
    geocode.loading,
  ])

  return { groups, remember, forget }
}
