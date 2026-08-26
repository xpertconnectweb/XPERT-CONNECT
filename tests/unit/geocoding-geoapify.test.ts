import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoapifyProvider } from '@/lib/geocoding/geoapify'
import { ATTRIBUTION } from '@/lib/geocoding/constants'

/**
 * The zero-cost adapter.
 *
 * It exists because of a finding worth restating: the address the client
 * reported is absent from OpenStreetMap and WRONG in the US Census data — the
 * Census geocoder answers "862 62ND ST W, 34209", which is 14 km from the real
 * building — but it is present in Manatee County's official address-point
 * layer under CC BY 4.0, and that layer is aggregated into OpenAddresses, which
 * is what Geoapify's geocoder is built on.
 *
 * So the free tier is not a downgrade here. It is the same open data the
 * expensive providers also ingest, reached through somebody else's index.
 *
 * The coordinates below are the real ones, taken from the county service.
 */

const ADDRESS = '862 62nd St Cir E, Bradenton, FL'
const LAT = 27.491257
const LNG = -82.481824

const fetchMock = vi.fn()
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

const RESULT = {
  place_id: '51a3f1c9d2e4b8c0',
  formatted: '862 62nd Street Circle East, Bradenton, FL 34208, United States',
  address_line1: '862 62nd Street Circle East',
  address_line2: 'Bradenton, FL 34208, United States',
  housenumber: '862',
  street: '62nd Street Circle East',
  city: 'Bradenton',
  county: 'Manatee County',
  state: 'Florida',
  state_code: 'FL',
  postcode: '34208',
  country_code: 'us',
  lon: LNG,
  lat: LAT,
  result_type: 'building',
  rank: { confidence: 1, match_type: 'full_match' },
  bbox: { lon1: -82.4822, lat1: 27.4909, lon2: -82.4814, lat2: 27.4916 },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GEOAPIFY_API_KEY', 'test-geoapify-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('configuration', () => {
  it('fails closed with no key, and never calls out', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', '')
    expect(geoapifyProvider.configured()).toBe(false)
    expect(await geoapifyProvider.autocomplete(ADDRESS, { limit: 5 })).toEqual({
      ok: false,
      kind: 'config',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('needs no resolve step, so a lookup is one request and one credit', () => {
    // Unlike Google and Mapbox, which withhold geometry from autocomplete to
    // bill per session. That difference is why the free tier goes so far here.
    expect(geoapifyProvider.needsDetails).toBe(false)
  })

  it('treats its own empty answer as authoritative', () => {
    expect(geoapifyProvider.fallbackOnEmpty).toBe(false)
  })
})

describe('resolving the address the client reported', () => {
  it('returns coordinates directly from autocomplete', async () => {
    fetchMock.mockResolvedValue(ok({ results: [RESULT] }))
    const result = await geoapifyProvider.autocomplete(ADDRESS, { limit: 5 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [first] = result.value
    expect(first).toMatchObject({
      lat: LAT,
      lng: LNG,
      kind: 'address',
      precision: 'rooftop',
      providerId: 'geoapify',
      placeId: '51a3f1c9d2e4b8c0',
      needsResolve: false,
      county: 'Manatee County',
    })
    expect(first.address).toEqual({
      street: '862 62nd Street Circle East',
      city: 'Bradenton',
      state: 'FL',
      postcode: '34208',
    })
  })

  it('takes the state from state_code, never by truncating the name', () => {
    // The fixture carries state: 'Florida' AND state_code: 'FL'. Truncating the
    // long name is how "Michigan" and "Minnesota" become the same place.
    expect(RESULT.state).toBe('Florida')
  })

  it('converts the bbox out of Geoapify ordering', async () => {
    fetchMock.mockResolvedValue(ok({ results: [RESULT] }))
    const result = await geoapifyProvider.autocomplete(ADDRESS, { limit: 5 })
    if (!result.ok) throw new Error('expected results')
    // Geoapify gives {lon1, lat1, lon2, lat2}; ours is [south, north, west, east].
    expect(result.value[0].bbox).toEqual([27.4909, 27.4916, -82.4822, -82.4814])
  })
})

describe('precision', () => {
  const withRank = (over: Record<string, unknown>) => ({ ...RESULT, ...over })

  it('calls a matched house number a rooftop', async () => {
    fetchMock.mockResolvedValue(ok({ results: [RESULT] }))
    const r = await geoapifyProvider.autocomplete(ADDRESS, { limit: 1 })
    if (!r.ok) throw new Error('expected results')
    expect(r.value[0].precision).toBe('rooftop')
  })

  it('demotes a building reached only by street match', async () => {
    // The important one. Geoapify will return a `building` result for a query
    // it could only place on the right STREET, and trusting `result_type`
    // alone would suppress the drag-the-pin prompt on a point that needs it.
    fetchMock.mockResolvedValue(
      ok({ results: [withRank({ rank: { confidence: 0.6, match_type: 'match_by_street' } })] })
    )
    const r = await geoapifyProvider.autocomplete(ADDRESS, { limit: 1 })
    if (!r.ok) throw new Error('expected results')
    expect(r.value[0].precision).toBe('street')
  })

  it('demotes a match that only found the postcode', async () => {
    fetchMock.mockResolvedValue(
      ok({ results: [withRank({ rank: { confidence: 0.4, match_type: 'match_by_postcode' } })] })
    )
    const r = await geoapifyProvider.autocomplete('34208', { limit: 1 })
    if (!r.ok) throw new Error('expected results')
    expect(r.value[0].precision).toBe('zip')
  })

  it('calls a building with no house number a street, not a rooftop', async () => {
    fetchMock.mockResolvedValue(
      ok({ results: [withRank({ housenumber: undefined, rank: { match_type: 'inner_part' } })] })
    )
    const r = await geoapifyProvider.autocomplete(ADDRESS, { limit: 1 })
    if (!r.ok) throw new Error('expected results')
    expect(r.value[0].precision).toBe('street')
  })
})

describe('query construction', () => {
  it('restricts to the US and biases softly toward the viewport', async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }))
    await geoapifyProvider.autocomplete(ADDRESS, {
      limit: 5,
      proximity: { lat: 27.5, lng: -82.5, zoom: 12 },
    })

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]))
    expect(url).toContain('filter=countrycode:us')
    // `bias` ranks; it does not exclude. A client who moved one state over has
    // to stay findable.
    expect(url).toContain('bias=proximity:-82.5,27.5')
  })

  it('sends no bias when there is nothing to bias with', async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }))
    await geoapifyProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).not.toContain('bias=')
  })
})

describe('failure modes', () => {
  it('reports the daily credit cap as rate limited, not as "no such address"', async () => {
    // 3,000 credits a day is a real ceiling. Reporting it as an empty result
    // would tell the user their address does not exist, which is a lie that
    // sends them off to retype a perfectly good one.
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    expect(await geoapifyProvider.autocomplete(ADDRESS, { limit: 5 })).toEqual({
      ok: false,
      kind: 'rate_limited',
    })
  })

  it('reports an outage as upstream rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = await geoapifyProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('upstream')
  })

  it('treats open water as an empty answer on reverse, not an error', async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }))
    expect(await geoapifyProvider.reverse(25.1, -79.9, { limit: 1 })).toEqual({
      ok: true,
      value: null,
    })
  })

  it('survives a payload that is not shaped like a response', async () => {
    fetchMock.mockResolvedValue(ok({ unexpected: true }))
    const result = await geoapifyProvider.autocomplete(ADDRESS, { limit: 5 })
    expect(result).toEqual({ ok: true, value: [] })
  })
})

describe('attribution', () => {
  it('is registered, because the free plan requires it to be displayed', () => {
    // Not a courtesy. Geoapify's free tier permits commercial use on the
    // condition that this is shown, so removing it is a licence breach that
    // nothing at runtime would ever flag.
    expect(ATTRIBUTION.geoapify).toBe('Powered by Geoapify')
    expect(ATTRIBUTION.nominatim).toContain('OpenStreetMap')
  })
})
