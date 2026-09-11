import { describe, expect, it } from 'vitest'
import { buildSearchIndex } from '@/lib/search/engine'
import { toSearchDocs } from '@/lib/search/documents'
import { searchWithFallback } from '@/lib/search/fallback'
import { nearestCities } from '@/lib/places/florida'
import type { LawyerLike } from '@/lib/search/documents'

/**
 * Bradenton and its neighbours, which is where the reported failure
 * lived. Deliberately contains no Personal Injury firm in Bradenton
 * itself: that is the shape of "Personal Injury Bradenton", a query
 * where both halves are real and the intersection is empty.
 */
const FIRMS: LawyerLike[] = [
  {
    id: 'f-1',
    name: 'Wyckoff Law Firm, P.A.',
    address: '4909 Manatee Ave W, Bradenton, FL 34209',
    lat: 27.4959,
    lng: -82.6103,
    practiceAreas: ['Real Estate Law'],
    region: 'Bradenton',
    county: 'Manatee',
    available: true,
  },
  {
    id: 'f-2',
    name: 'Blalock Walters, P.A.',
    address: '802 11th St W, Bradenton, FL 34205',
    lat: 27.4989,
    lng: -82.5748,
    practiceAreas: ['Business Law'],
    region: 'Bradenton',
    county: 'Manatee',
    available: true,
  },
  {
    id: 'f-3',
    name: 'Syprett Meshad, P.A.',
    address: '1900 Ringling Blvd, Sarasota, FL 34236',
    lat: 27.3364,
    lng: -82.5307,
    practiceAreas: ['Personal Injury'],
    region: 'Sarasota',
    county: 'Sarasota',
    available: true,
  },
  {
    id: 'f-4',
    name: 'Pozo Goldstein, LLP',
    address: '1 SE 3rd Ave, Miami, FL 33131',
    lat: 25.7617,
    lng: -80.1918,
    practiceAreas: ['Personal Injury'],
    region: 'Miami',
    county: 'Miami-Dade',
    available: true,
  },
]

const index = buildSearchIndex(toSearchDocs([], FIRMS, { requireCoordinates: false }))
const BRADENTON = [27.4989, -82.5748] as const
const KEY_WEST = [24.5551, -81.78] as const

describe('the ladder does not fire when it is not needed', () => {
  it('leaves a successful search alone', () => {
    const r = searchWithFallback(index, 'Bradenton')
    expect(r.primary.total).toBe(2)
    expect(r.fallback).toBeNull()
  })

  it('leaves an empty query alone', () => {
    expect(searchWithFallback(index, '').fallback).toBeNull()
  })

  it('gives up rather than inventing something for gibberish', () => {
    const r = searchWithFallback(index, 'zzzznotafirmzzzz')
    expect(r.primary.total).toBe(0)
    expect(r.fallback).toBeNull()
  })
})

describe('rung 1 — the filters, not the words', () => {
  it('drops the filter and says which one', () => {
    // A practice-area card plus a city with no firm in that area. By
    // far the most common way to reach an empty page here.
    const r = searchWithFallback(index, 'Bradenton', {
      filters: { tags: ['Personal Injury'] },
    })
    expect(r.primary.total).toBe(0)
    expect(r.fallback?.kind).toBe('filters-relaxed')
    expect(r.fallback?.dropped?.filters).toEqual(['tags'])
    expect(r.fallback?.outcome.hits.map((h) => h.doc.id)).toEqual(['f-1', 'f-2'])
  })
})

describe('rung 2 — some of the words', () => {
  it('offers the closest when the combination has no exact match', () => {
    const r = searchWithFallback(
      index,
      'Personal Injury Bradenton',
      { anchor: BRADENTON },
      { anchor: BRADENTON, placeLabel: 'Bradenton', nearest: nearestCities(index.docs, BRADENTON) }
    )
    expect(r.primary.total).toBe(0)
    expect(r.fallback?.kind).toBe('partial')
  })

  /**
   * The banner over these rows says "closest". Sorting them by
   * relevance put a firm 37 miles away above one 9 miles away, on the
   * strength of having the words in its name.
   */
  it('orders them by distance, because that is what the banner claims', () => {
    const r = searchWithFallback(
      index,
      'Personal Injury Bradenton',
      { anchor: BRADENTON },
      { anchor: BRADENTON, placeLabel: 'Bradenton', nearest: nearestCities(index.docs, BRADENTON) }
    )
    const distances = r.fallback!.outcome.hits.map((h) => h.distance)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
  })
})

describe('rung 3 — the place is real and we do not cover it', () => {
  /**
   * `placeOnly` exists for exactly this. Without it, "Key West" fell
   * through to partial matching and came back with every firm
   * containing the word "west" — an answer that looks like an answer.
   */
  it('names the gap and the nearest alternative', () => {
    const r = searchWithFallback(
      index,
      'Key West',
      { anchor: KEY_WEST },
      {
        anchor: KEY_WEST,
        placeLabel: 'Key West',
        nearest: nearestCities(index.docs, KEY_WEST),
        placeOnly: true,
      }
    )
    expect(r.primary.total).toBe(0)
    expect(r.fallback?.kind).toBe('nearby')
    expect(r.fallback?.near?.place).toBe('Key West')
    expect(r.fallback?.near?.city).toBe('Miami')
    expect(r.fallback?.near?.miles).toBeGreaterThan(100)
  })

  it('still prefers partial matching when the query said more than a place', () => {
    const r = searchWithFallback(
      index,
      'Personal Injury Key West',
      { anchor: KEY_WEST },
      {
        anchor: KEY_WEST,
        placeLabel: 'Key West',
        nearest: nearestCities(index.docs, KEY_WEST),
        placeOnly: false,
      }
    )
    expect(r.fallback?.kind).toBe('partial')
  })
})

describe('what the caller must read from where', () => {
  /**
   * The chips have to describe the results the visitor is looking at.
   * Reading them off a fallback rung would label a page of consolation
   * rows as though they were matches.
   */
  it('keeps the primary outcome authoritative for counts and facets', () => {
    const r = searchWithFallback(index, 'Bradenton', {
      filters: { tags: ['Personal Injury'] },
    })
    expect(r.primary.total).toBe(0)
    expect(r.primary.hits).toEqual([])
    expect(r.fallback!.outcome.total).toBeGreaterThan(0)
  })
})
