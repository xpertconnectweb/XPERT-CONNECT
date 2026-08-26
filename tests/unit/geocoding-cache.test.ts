import { beforeEach, describe, expect, it } from 'vitest'
import { ttlFor } from '@/lib/geocoding/shared-cache'
import { __clearMemoryCache, memoryGet, memorySet } from '@/lib/geocoding/memory-cache'
import { MAX_SHARED_CACHE_TTL_MS } from '@/lib/geocoding/constants'
import type { GeocodeSuggestion } from '@/types/geocode'

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

const suggestion = (id: string): GeocodeSuggestion => ({
  id,
  label: 'Bradenton, FL',
  fullLabel: 'Bradenton, Manatee County, Florida, United States',
  address: null,
  county: null,
  kind: 'city',
  precision: 'city',
  providerId: 'nominatim',
  placeId: id,
  lat: 27.4989,
  lng: -82.5748,
  bbox: null,
  needsResolve: false,
})

/**
 * Retention here is a LICENCE term, not a performance knob.
 *
 * Google permits storing a place id indefinitely but requires any other
 * content — coordinates included — to be deleted within 30 days. Mapbox treats
 * temporary results as cache-only. Nominatim's ODbL permits storage with
 * attribution. Raising any of these to make the hit rate look better is a
 * contract breach that would never surface as a bug, which is exactly why it
 * needs a test rather than a comment.
 */
describe('retention ceilings', () => {
  it('never hands any provider more than thirty days', () => {
    for (const provider of ['nominatim', 'mapbox', 'google'] as const) {
      expect(MAX_SHARED_CACHE_TTL_MS[provider]).toBeLessThanOrEqual(THIRTY_DAYS)
      expect(ttlFor(provider)).toBeLessThanOrEqual(THIRTY_DAYS)
    }
  })

  it('never exceeds the provider ceiling even if the default TTL is raised', () => {
    for (const provider of ['nominatim', 'mapbox', 'google'] as const) {
      expect(ttlFor(provider)).toBeLessThanOrEqual(MAX_SHARED_CACHE_TTL_MS[provider])
    }
  })
})

describe('the in-memory layer', () => {
  beforeEach(() => {
    __clearMemoryCache()
  })

  it('serves what it was given', () => {
    memorySet('k', [suggestion('a')])
    expect(memoryGet('k')).toHaveLength(1)
  })

  it('stores an empty result too', () => {
    // Without this, every keystroke of a known-unresolvable prefix re-runs the
    // whole provider chain — three paced calls, for an answer already known.
    memorySet('dead', [])
    expect(memoryGet('dead')).toEqual([])
    expect(memoryGet('dead')).not.toBeNull()
  })

  it('misses cleanly on an unknown key', () => {
    expect(memoryGet('never-set')).toBeNull()
  })

  it('is keyed exactly, so a different bias cannot serve the wrong answer', () => {
    memorySet('nominatim|ac|bradenton|8|sFL', [suggestion('fl')])
    expect(memoryGet('nominatim|ac|bradenton|8|sMN')).toBeNull()
  })
})
