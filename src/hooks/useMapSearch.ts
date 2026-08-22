'use client'

import { useMemo } from 'react'
import {
  buildSearchIndex,
  search,
  toSearchDocs,
  type Bounds,
  type Facets,
  type SearchFilters,
  type SearchHit,
  type SearchIndex,
  type SortMode,
} from '@/lib/search'
import type { MapItem } from '@/lib/map/types'
import type { DecoratedClinic, DecoratedLawyer } from '@/types/professionals'

/**
 * The map's search pipeline.
 *
 * Extracted from `MapView` so the ordering, filtering and exclusion rules are
 * in one readable place rather than spread across four chained `useMemo`s.
 *
 * The exclusions that must never be bypassed by a search term are applied when
 * the index is BUILT, not when it is queried:
 *
 *  - records at (0, 0), enforced inside `toSearchDocs`
 *  - the viewer's own clinic, so a clinic cannot refer to itself
 *  - chiropractic-only clinics for clinic viewers, matching SpecialistsList
 *
 * The type toggles are ordinary filters instead, because they are meant to be
 * flipped back and forth.
 */

export interface UseMapSearchOptions {
  clinics: readonly DecoratedClinic[]
  lawyers: readonly DecoratedLawyer[]
  /** Excluded from the index entirely. */
  viewerClinicId?: string
  isClinicViewer: boolean
  query: string
  showClinics: boolean
  showLawyers: boolean
  availableOnly: boolean
  /** Selected specialty / practice-area chips. */
  tags: readonly string[]
  anchor: readonly [number, number] | null
  radiusMiles: number | null
  bounds: Bounds | null
  sort?: SortMode
}

export interface UseMapSearchResult {
  items: MapItem[]
  total: number
  facets: Facets
  didYouMean: string | null
  clinicCount: number
  lawyerCount: number
  /** Look up a full item by id, for panel-to-marker focus. */
  byId: Map<string, MapItem>
  /** Shared so the suggestion box does not build a second copy of the index. */
  index: SearchIndex<DecoratedClinic | DecoratedLawyer>
}

type AnySource = DecoratedClinic | DecoratedLawyer

function isLawyerSource(source: AnySource): source is DecoratedLawyer {
  return 'practiceAreas' in source
}

function toMapItem(hit: SearchHit<AnySource>): MapItem {
  const source = hit.doc.source
  return {
    id: hit.doc.id,
    name: source.name,
    address: source.address,
    lat: hit.doc.lat,
    lng: hit.doc.lng,
    phone: source.phone,
    email: source.email,
    website: source.website,
    region: source.region,
    county: hit.doc.county ?? undefined,
    city: hit.doc.city ?? undefined,
    state: hit.doc.state ?? undefined,
    zipCode: hit.doc.zip ?? undefined,
    available: hit.doc.available,
    distance: Number.isFinite(hit.distance) ? hit.distance : 0,
    type: hit.doc.type,
    specialties: isLawyerSource(source) ? undefined : source.specialties,
    practiceAreas: isLawyerSource(source) ? source.practiceAreas : undefined,
    score: hit.score,
  }
}

export function useMapSearch({
  clinics,
  lawyers,
  viewerClinicId,
  isClinicViewer,
  query,
  showClinics,
  showLawyers,
  availableOnly,
  tags,
  anchor,
  radiusMiles,
  bounds,
  sort,
}: UseMapSearchOptions): UseMapSearchResult {
  const index = useMemo(() => {
    const eligible = clinics.filter((clinic) => {
      if (viewerClinicId && clinic.id === viewerClinicId) return false
      if (
        isClinicViewer &&
        clinic.specialties &&
        clinic.specialties.length > 0 &&
        clinic.specialties.every((s) => /chiroprac/i.test(s))
      ) {
        return false
      }
      return true
    })
    return buildSearchIndex(toSearchDocs(eligible, lawyers))
  }, [clinics, lawyers, viewerClinicId, isClinicViewer])

  const outcome = useMemo(() => {
    const filters: SearchFilters = {}
    if (availableOnly) filters.availableOnly = true
    if (tags.length > 0) filters.tags = [...tags]
    // An empty types list would match nothing, which is exactly right when the
    // user has switched both pin types off.
    filters.types = [
      ...(showClinics ? (['clinic'] as const) : []),
      ...(showLawyers ? (['lawyer'] as const) : []),
    ]

    return search(index, query, { anchor, radiusMiles, bounds, filters, sort })
  }, [index, query, anchor, radiusMiles, bounds, sort, availableOnly, tags, showClinics, showLawyers])

  return useMemo(() => {
    const items: MapItem[] = []
    const byId = new Map<string, MapItem>()
    let clinicCount = 0
    let lawyerCount = 0

    for (const hit of outcome.hits) {
      const item = toMapItem(hit)
      items.push(item)
      byId.set(item.id, item)
      if (item.type === 'clinic') clinicCount += 1
      else lawyerCount += 1
    }

    return {
      items,
      total: outcome.total,
      facets: outcome.facets,
      didYouMean: outcome.didYouMean,
      // Counted from the same array the panel renders, so the chip totals and
      // the panel can no longer disagree — they used to be computed before the
      // radius filter while the panel showed the list after it.
      clinicCount,
      lawyerCount,
      byId,
      index,
    }
  }, [outcome, index])
}
