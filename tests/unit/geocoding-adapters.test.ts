import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { googleProvider } from '@/lib/geocoding/google'
import { mapboxProvider } from '@/lib/geocoding/mapbox'
import { nominatimProvider } from '@/lib/geocoding/nominatim'

/**
 * The test that makes swapping providers a configuration change rather than a
 * leap of faith.
 *
 * All three adapters are driven with payloads shaped like the real ones and
 * asserted to produce the SAME `GeocodeResult` for the same place. If that
 * holds, everything downstream — the map, the location chip, the admin form,
 * the backfill — cannot tell which provider answered, which is exactly the
 * property the adapter layer was built to have.
 *
 * The address throughout is the one the client reported. Nominatim returns
 * nothing for it, verified by hand against the live service: the raw query,
 * the USPS-expanded query, the street alone and the query with the ZIP
 * appended all come back empty, because "62nd Street Circle East" is not in
 * OpenStreetMap. That is not a parsing bug and no normalisation fixes it. The
 * Google and Mapbox cases below are what the fix looks like when a key exists.
 */

const ADDRESS = '862 62nd St Cir E, Bradenton, FL'
const LAT = 27.49896
const LNG = -82.51702

const fetchMock = vi.fn()

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/* ── Nominatim ─────────────────────────────────────────────────────────── */

describe('nominatim adapter', () => {
  it('needs no key, and answers with coordinates already attached', () => {
    expect(nominatimProvider.configured()).toBe(true)
    expect(nominatimProvider.needsDetails).toBe(false)
  })

  it('is the only provider whose empty answer is worth second-guessing', () => {
    // An empty result from OSM says nothing about whether the address exists.
    // From a paid provider it is an answer, and asking OSM afterwards would
    // only add a second of latency to confirm it.
    expect(nominatimProvider.fallbackOnEmpty).toBe(true)
    expect(mapboxProvider.fallbackOnEmpty).toBe(false)
    expect(googleProvider.fallbackOnEmpty).toBe(false)
  })

  it('returns nothing for the address the client reported', async () => {
    // Every candidate in the chain comes back empty, which is what the live
    // service does. This is the regression test for the diagnosis itself.
    fetchMock.mockResolvedValue(ok([]))
    const result = await nominatimProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([])
  })

  it('maps a hit onto the shared shape', async () => {
    fetchMock.mockResolvedValue(
      ok([
        {
          place_id: 555,
          lat: String(LAT),
          lon: String(LNG),
          display_name: '862, 62nd Street Circle East, Bradenton, Manatee County, Florida, 34208, United States',
          boundingbox: ['27.498', '27.499', '-82.518', '-82.516'],
          class: 'place',
          type: 'house',
          address: {
            house_number: '862',
            road: '62nd Street Circle East',
            city: 'Bradenton',
            county: 'Manatee County',
            state: 'Florida',
            'ISO3166-2-lvl4': 'US-FL',
            postcode: '34208',
          },
        },
      ])
    )

    const result = await nominatimProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [first] = result.value
    expect(first).toMatchObject({
      lat: LAT,
      lng: LNG,
      kind: 'address',
      precision: 'rooftop',
      providerId: 'nominatim',
      placeId: '555',
      needsResolve: false,
      county: 'Manatee County',
    })
    expect(first.address).toEqual({
      street: '862 62nd Street Circle East',
      city: 'Bradenton',
      state: 'FL',
      postcode: '34208',
    })
    // `[south, north, west, east]`, in that order and no other.
    expect(first.bbox).toEqual([27.498, 27.499, -82.518, -82.516])
  })

  it('biases by viewbox without bounding, so an out-of-state client stays findable', async () => {
    fetchMock.mockResolvedValue(ok([]))
    await nominatimProvider.autocomplete(ADDRESS, { limit: 5, state: 'FL' })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('viewbox=')
    // `bounded=1` would make it a hard filter, and a client who moved one state
    // over would become unfindable.
    expect(url).toContain('bounded=0')
  })

  it('sends no viewbox at all when there is nothing to bias with', async () => {
    fetchMock.mockResolvedValue(ok([]))
    await nominatimProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('viewbox=')
  })

  it('reports an upstream failure rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = await nominatimProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result).toEqual({ ok: false, kind: 'upstream' })
  })
})

/* ── Mapbox ────────────────────────────────────────────────────────────── */

const MAPBOX_SUGGESTION = {
  mapbox_id: 'dXJuOm1ieGFkcjp0ZXN0',
  name: '862 62nd Street Circle East',
  address: '862 62nd Street Circle East',
  full_address: '862 62nd Street Circle East, Bradenton, Florida 34208, United States',
  place_formatted: 'Bradenton, Florida 34208, United States',
  feature_type: 'address',
  context: {
    address: { name: '862 62nd Street Circle East', address_number: '862', street_name: '62nd Street Circle East' },
    postcode: { name: '34208' },
    place: { name: 'Bradenton' },
    district: { name: 'Manatee County' },
    region: { name: 'Florida', region_code: 'FL' },
  },
}

describe('mapbox adapter', () => {
  beforeEach(() => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'pk.test-token')
  })

  it('fails closed when the key is absent', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', '')
    expect(mapboxProvider.configured()).toBe(false)
    const result = await mapboxProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result).toEqual({ ok: false, kind: 'config' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns suggestions with no coordinates, which is the billing model', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [MAPBOX_SUGGESTION] }))
    const result = await mapboxProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [first] = result.value
    // N cheap suggestions, then ONE chargeable resolve. `needsResolve` is what
    // tells the UI a row is not yet a location.
    expect(first.needsResolve).toBe(true)
    expect(first.lat).toBeNull()
    expect(first.lng).toBeNull()
    expect(first.providerId).toBe('mapbox')
    expect(first.address).toEqual({
      street: '862 62nd Street Circle East',
      city: 'Bradenton',
      state: 'FL',
      postcode: '34208',
    })
    expect(first.county).toBe('Manatee County')
  })

  it('biases with proximity and never with bbox, which is a hard filter', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }))
    await mapboxProvider.autocomplete(ADDRESS, {
      limit: 5,
      proximity: { lat: 27.5, lng: -82.5, zoom: 12 },
    })
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]))
    expect(url).toContain('proximity=-82.5,27.5')
    expect(url).not.toContain('bbox=')
  })

  it('resolves to the same shape the other providers produce', async () => {
    fetchMock.mockResolvedValue(
      ok({
        features: [
          {
            geometry: { coordinates: [LNG, LAT] },
            properties: {
              ...MAPBOX_SUGGESTION,
              coordinates: { longitude: LNG, latitude: LAT, accuracy: 'rooftop' },
              bbox: [-82.518, 27.498, -82.516, 27.499],
            },
          },
        ],
      })
    )

    const result = await mapboxProvider.details(MAPBOX_SUGGESTION.mapbox_id, { limit: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok || !result.value) throw new Error('expected a result')

    expect(result.value).toMatchObject({
      lat: LAT,
      lng: LNG,
      kind: 'address',
      precision: 'rooftop',
      providerId: 'mapbox',
      needsResolve: false,
      county: 'Manatee County',
    })
    // Mapbox gives `[west, south, east, north]`; ours is
    // `[south, north, west, east]`. Reversing them is silent and lands you in
    // the wrong hemisphere.
    expect(result.value.bbox).toEqual([27.498, 27.499, -82.518, -82.516])
  })

  it('reads coordinates lat-first from properties, not from the GeoJSON pair', async () => {
    // Every coordinate in this codebase is lat-first; Mapbox's geometry is not.
    // `properties.coordinates` is named, so it cannot be transposed by accident.
    fetchMock.mockResolvedValue(
      ok({
        features: [
          {
            geometry: { coordinates: [999, 999] },
            properties: {
              ...MAPBOX_SUGGESTION,
              coordinates: { longitude: LNG, latitude: LAT, accuracy: 'rooftop' },
            },
          },
        ],
      })
    )
    const result = await mapboxProvider.details('x', { limit: 1 })
    if (!result.ok || !result.value) throw new Error('expected a result')
    expect(result.value.lat).toBe(LAT)
    expect(result.value.lng).toBe(LNG)
  })

  it('surfaces a 429 as rate limited rather than a generic outage', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    const result = await mapboxProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result).toEqual({ ok: false, kind: 'rate_limited' })
  })
})

/* ── Google ────────────────────────────────────────────────────────────── */

describe('google adapter', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'AIza-test-key')
  })

  it('fails closed when the key is absent', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', '')
    expect(googleProvider.configured()).toBe(false)
    expect(await googleProvider.autocomplete(ADDRESS, { limit: 5 })).toEqual({
      ok: false,
      kind: 'config',
    })
  })

  it('asks for Essentials fields only, because Pro costs three times as much', async () => {
    fetchMock.mockResolvedValue(ok({}))
    await googleProvider.details('ChIJtest', { limit: 1 })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const mask = (init.headers as Record<string, string>)['X-Goog-FieldMask']
    expect(mask).toContain('addressComponents')
    expect(mask).toContain('location')
    // `displayName` would silently promote the call to the Pro SKU.
    expect(mask).not.toContain('displayName')
    expect(mask).not.toContain('rating')
  })

  it('biases rather than restricts, so a nearby-but-outside address survives', async () => {
    fetchMock.mockResolvedValue(ok({ suggestions: [] }))
    await googleProvider.autocomplete(ADDRESS, {
      limit: 5,
      proximity: { lat: 27.5, lng: -82.5, zoom: 12 },
    })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.locationBias).toBeDefined()
    // `locationRestriction` is the hard version and would hide results.
    expect(body.locationRestriction).toBeUndefined()
    expect(body.includedRegionCodes).toEqual(['us'])
  })

  it('resolves the reported address to the same shape as the others', async () => {
    fetchMock.mockResolvedValue(
      ok({
        id: 'ChIJtest',
        formattedAddress: '862 62nd St Cir E, Bradenton, FL 34208, USA',
        location: { latitude: LAT, longitude: LNG },
        types: ['street_address'],
        viewport: {
          low: { latitude: 27.498, longitude: -82.518 },
          high: { latitude: 27.499, longitude: -82.516 },
        },
        addressComponents: [
          { longText: '862', shortText: '862', types: ['street_number'] },
          { longText: '62nd Street Circle East', shortText: '62nd St Cir E', types: ['route'] },
          { longText: 'Bradenton', shortText: 'Bradenton', types: ['locality', 'political'] },
          {
            longText: 'Manatee County',
            shortText: 'Manatee County',
            types: ['administrative_area_level_2', 'political'],
          },
          { longText: 'Florida', shortText: 'FL', types: ['administrative_area_level_1'] },
          { longText: '34208', shortText: '34208', types: ['postal_code'] },
        ],
      })
    )

    const result = await googleProvider.details('ChIJtest', { limit: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok || !result.value) throw new Error('expected a result')

    expect(result.value).toMatchObject({
      lat: LAT,
      lng: LNG,
      kind: 'address',
      precision: 'rooftop',
      providerId: 'google',
      placeId: 'ChIJtest',
      needsResolve: false,
      county: 'Manatee County',
    })
    // The state code is Google's own `shortText`, never a truncation of
    // "Florida" — "Michigan" and "Minnesota" both start "Mi".
    expect(result.value.address).toEqual({
      street: '862 62nd Street Circle East',
      city: 'Bradenton',
      state: 'FL',
      postcode: '34208',
    })
    expect(result.value.bbox).toEqual([27.498, 27.499, -82.518, -82.516])
  })

  it('treats open water as an empty answer, not an error', async () => {
    fetchMock.mockResolvedValue(ok({ status: 'ZERO_RESULTS', results: [] }))
    const result = await googleProvider.reverse(25.1, -79.9, { limit: 1 })
    expect(result).toEqual({ ok: true, value: null })
  })

  it('uses the Geocoding endpoint for reverse, where precision is stated', async () => {
    fetchMock.mockResolvedValue(
      ok({
        status: 'OK',
        results: [
          {
            place_id: 'ChIJreverse',
            formatted_address: '862 62nd St Cir E, Bradenton, FL 34208, USA',
            types: ['street_address'],
            address_components: [
              { long_name: 'Bradenton', short_name: 'Bradenton', types: ['locality'] },
              { long_name: 'Florida', short_name: 'FL', types: ['administrative_area_level_1'] },
            ],
            geometry: { location: { lat: LAT, lng: LNG }, location_type: 'RANGE_INTERPOLATED' },
          },
        ],
      })
    )

    const result = await googleProvider.reverse(LAT, LNG, { limit: 1 })
    expect(String(fetchMock.mock.calls[0][0])).toContain('maps.googleapis.com')
    if (!result.ok || !result.value) throw new Error('expected a result')
    // Declared, not inferred. Places Details cannot tell us this.
    expect(result.value.precision).toBe('interpolated')
  })
})

/* ── Parity ────────────────────────────────────────────────────────────── */

describe('parity across providers', () => {
  it('agrees on the address components for the same place', async () => {
    const expected = {
      street: '862 62nd Street Circle East',
      city: 'Bradenton',
      state: 'FL',
      postcode: '34208',
    }

    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'pk.test-token')
    fetchMock.mockResolvedValue(
      ok({
        features: [
          {
            geometry: { coordinates: [LNG, LAT] },
            properties: {
              ...MAPBOX_SUGGESTION,
              coordinates: { longitude: LNG, latitude: LAT, accuracy: 'rooftop' },
            },
          },
        ],
      })
    )
    const mapbox = await mapboxProvider.details('x', { limit: 1 })

    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'AIza-test-key')
    fetchMock.mockResolvedValue(
      ok({
        id: 'ChIJtest',
        formattedAddress: '862 62nd St Cir E, Bradenton, FL 34208, USA',
        location: { latitude: LAT, longitude: LNG },
        types: ['street_address'],
        addressComponents: [
          { longText: '862', types: ['street_number'] },
          { longText: '62nd Street Circle East', types: ['route'] },
          { longText: 'Bradenton', types: ['locality'] },
          { longText: 'Florida', shortText: 'FL', types: ['administrative_area_level_1'] },
          { longText: '34208', types: ['postal_code'] },
        ],
      })
    )
    const google = await googleProvider.details('ChIJtest', { limit: 1 })

    if (!mapbox.ok || !mapbox.value) throw new Error('mapbox failed')
    if (!google.ok || !google.value) throw new Error('google failed')

    expect(mapbox.value.address).toEqual(expected)
    expect(google.value.address).toEqual(expected)
    expect(mapbox.value.precision).toBe(google.value.precision)
    expect(mapbox.value.kind).toBe(google.value.kind)
  })
})
