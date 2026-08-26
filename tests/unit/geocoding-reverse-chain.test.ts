import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reverseChain } from '@/lib/geocoding'

/**
 * The chain that did not exist, and the bug that proved it was needed.
 *
 * `autocompleteChain` has always had a fallback. Reverse did not: the route
 * called `provider.reverse()` directly. So the day `GEOCODER_PROVIDER` became
 * `selfhosted` — whose reverse is a deliberate stub until the spatial lookup
 * lands — every pin drag on the map answered nothing, the chip fell back to
 * "Custom location" with no address, and the empty answer was cached for a day
 * per coordinate.
 *
 * A comment in `selfhosted.ts` asserted the chain covered it. Nothing had
 * tested that assertion. These are the tests that would have caught it.
 */

const LAT = 27.491257
const LNG = -82.481824

const fetchMock = vi.fn()
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

/** One Geoapify reverse hit, shaped as their API returns it. */
const GEOAPIFY_HIT = {
  results: [
    {
      place_id: '51a3f1c9d2e4b8c0',
      formatted: '862 62nd Street Circle East, Bradenton, FL 34208, United States',
      address_line1: '862 62nd Street Circle East',
      address_line2: 'Bradenton, FL 34208, United States',
      housenumber: '862',
      street: '62nd Street Circle East',
      city: 'Bradenton',
      county: 'Manatee County',
      state_code: 'FL',
      postcode: '34208',
      country_code: 'us',
      lon: LNG,
      lat: LAT,
      result_type: 'building',
      rank: { confidence: 1, match_type: 'full_match' },
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('GEOAPIFY_API_KEY', 'test-geoapify-key')
  // The production shape: our own engine in front, Geoapify behind it.
  vi.stubEnv('GEOCODER_PROVIDER', 'selfhosted')
  vi.stubEnv('GEOCODER_FALLBACK', 'geoapify')
  // The self-hosted provider only checks these to report itself configured; its
  // reverse never reaches a store, so no database is involved.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('reverseChain', () => {
  it('hands an empty self-hosted answer to the fallback', async () => {
    fetchMock.mockResolvedValue(ok(GEOAPIFY_HIT))

    const outcome = await reverseChain(LAT, LNG, { limit: 1 })

    expect(outcome.failure).toBeNull()
    expect(outcome.provider).toBe('geoapify')
    expect(outcome.result?.lat).toBeCloseTo(LAT, 5)
    expect(outcome.result?.address?.city).toBe('Bradenton')
  })

  /**
   * Deliberately unlike autocomplete. There, an empty answer can BE an answer:
   * we hold the county register and it says no such address exists. A
   * coordinate is different — every point on earth is somewhere, so "nothing
   * here" only ever means "I do not know", and that is never worth keeping from
   * a provider that might.
   */
  it('never treats an empty reverse answer as authoritative', async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }))

    const outcome = await reverseChain(LAT, LNG, { limit: 1 })

    // Asked anyway, and came back honestly empty rather than pretending.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(outcome.result).toBeNull()
    expect(outcome.failure).toBeNull()
  })

  it('reports the fallback as the answering provider, so the TTL is its own', async () => {
    fetchMock.mockResolvedValue(ok(GEOAPIFY_HIT))

    // The route passes this to `sharedSet`, which picks a cache TTL from it.
    // How long an answer may be stored is a licence term of whoever produced it.
    expect((await reverseChain(LAT, LNG, { limit: 1 })).provider).toBe('geoapify')
  })

  it('reports a failure when the fallback is the one that breaks', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })

    const outcome = await reverseChain(LAT, LNG, { limit: 1 })

    expect(outcome.result).toBeNull()
    expect(outcome.failure?.kind).toBe('upstream')
  })

  it('answers from the primary alone when it has something to say', async () => {
    vi.stubEnv('GEOCODER_PROVIDER', 'geoapify')
    fetchMock.mockResolvedValue(ok(GEOAPIFY_HIT))

    const outcome = await reverseChain(LAT, LNG, { limit: 1 })

    expect(outcome.provider).toBe('geoapify')
    // One call: the primary answered, so nothing else was asked.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the primary’s own empty answer when no fallback is configured', async () => {
    vi.stubEnv('GEOCODER_FALLBACK', 'selfhosted')

    const outcome = await reverseChain(LAT, LNG, { limit: 1 })

    expect(outcome.provider).toBe('selfhosted')
    expect(outcome.result).toBeNull()
    expect(outcome.failure).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
