import { describe, expect, it } from 'vitest'
import {
  biasKey,
  formatProximity,
  googleLocationBias,
  mapboxProximity,
  nominatimViewbox,
  parseProximity,
  quantizeProximity,
} from '@/lib/geocoding/bias'

/**
 * Telling the provider where to look first.
 *
 * Before this, the only geographic hint sent was `countrycodes=us`, so "main
 * st" was ranked against every Main Street in the country and the state
 * already sitting on the session went unused.
 *
 * Two properties matter and both are load-bearing:
 *
 *  1. Every bias is SOFT. A lawyer in Florida referring a client who moved to
 *     Georgia must still be able to find the address, so none of these may
 *     translate into a hard filter.
 *  2. The bias is QUANTISED before it becomes part of a cache key. Full
 *     precision would give every pixel of pan its own cache entry and the
 *     shared cache would never hit.
 */

describe('quantisation', () => {
  it('rounds to about eleven kilometres and two zoom levels', () => {
    expect(quantizeProximity(27.49896, -82.51702, 13)).toEqual({
      lat: 27.5,
      lng: -82.5,
      zoom: 14,
    })
  })

  it('collapses a small pan onto the same bucket, so the cache still hits', () => {
    // Same zoom on purpose. An earlier version of this varied the zoom too and
    // then asserted the buckets matched, which is not what the sentence above
    // claims and is not what the function does: 12 and 13 round to 12 and 14.
    const a = quantizeProximity(27.481, -82.511, 12)
    const b = quantizeProximity(27.519, -82.539, 12)
    expect(biasKey({ limit: 5, proximity: a })).toBe(biasKey({ limit: 5, proximity: b }))
  })

  it('does NOT collapse a zoom change, because it changes what is nearby', () => {
    const city = quantizeProximity(27.5, -82.5, 12)
    const street = quantizeProximity(27.5, -82.5, 17)
    expect(biasKey({ limit: 5, proximity: city })).not.toBe(
      biasKey({ limit: 5, proximity: street })
    )
  })

  it('round-trips through the query parameter', () => {
    const hint = quantizeProximity(27.5, -82.5, 12)
    expect(parseProximity(formatProximity(hint))).toEqual(hint)
  })
})

describe('parsing the client hint', () => {
  it('ignores anything malformed instead of failing the search', () => {
    // The bias is an optimisation. Rejecting the whole request because a hint
    // was garbled would turn a cosmetic bug into an outage.
    expect(parseProximity(null)).toBeNull()
    expect(parseProximity('')).toBeNull()
    expect(parseProximity('27.5,-82.5')).toBeNull()
    expect(parseProximity('nope,nope,nope')).toBeNull()
    expect(parseProximity('27.5,-82.5,12,extra')).toBeNull()
  })

  it('rejects coordinates that are not on Earth', () => {
    expect(parseProximity('999,-82.5,12')).toBeNull()
    expect(parseProximity('27.5,-999,12')).toBeNull()
    expect(parseProximity('27.5,-82.5,99')).toBeNull()
  })
})

describe('cache keys', () => {
  it('prefers the viewport over the session state', () => {
    // Where the user is LOOKING beats a default derived from their account.
    const key = biasKey({ limit: 5, state: 'FL', proximity: { lat: 27.5, lng: -82.5, zoom: 12 } })
    expect(key).toContain('27.5')
    expect(key).not.toBe('sFL')
  })

  it('falls back to the state, and then to nothing', () => {
    expect(biasKey({ limit: 5, state: 'FL' })).toBe('sFL')
    expect(biasKey({ limit: 5 })).toBe('-')
    // An unknown state is no bias at all rather than an error.
    expect(biasKey({ limit: 5, state: 'ZZ' })).toBe('-')
  })
})

describe('per-provider translation', () => {
  it('gives Nominatim a viewbox in its own peculiar order', () => {
    // `west,north,east,south` — neither the bbox order used elsewhere in this
    // codebase nor Leaflet's.
    const viewbox = nominatimViewbox({ limit: 5, state: 'FL' })
    expect(viewbox).toBe('-87.7,31.1,-79.9,24.4')
  })

  it('gives Mapbox a proximity point, longitude first', () => {
    expect(mapboxProximity({ limit: 5, proximity: { lat: 27.5, lng: -82.5, zoom: 12 } }))
      .toBe('-82.5,27.5')
  })

  it('gives Google a circle for a viewport and a rectangle for a state', () => {
    const circle = googleLocationBias({ limit: 5, proximity: { lat: 27.5, lng: -82.5, zoom: 12 } })
    expect(circle).toHaveProperty('circle')

    const rectangle = googleLocationBias({ limit: 5, state: 'FL' })
    expect(rectangle).toHaveProperty('rectangle')
  })

  it('keeps Google inside its 50 km radius cap', () => {
    // A very wide view would otherwise ask for a radius the API rejects.
    const bias = googleLocationBias({ limit: 5, proximity: { lat: 27.5, lng: -82.5, zoom: 1 } })
    expect(bias && 'circle' in bias && bias.circle.radius).toBeLessThanOrEqual(50_000)
  })

  it('returns nothing at all when there is nothing to bias with', () => {
    expect(nominatimViewbox({ limit: 5 })).toBeNull()
    expect(mapboxProximity({ limit: 5 })).toBeNull()
    expect(googleLocationBias({ limit: 5 })).toBeNull()
  })
})
