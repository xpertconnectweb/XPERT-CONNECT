import type { Page, Route } from '@playwright/test'
import type { GeocodePrecision } from '../../src/types/geocode'

/**
 * Intercepts `/api/geocode` so the suite stops calling a third party.
 *
 * Until this existed, `lawyer/map-search.spec.ts` hit the live geocoding
 * provider on every run. Three consequences, all bad:
 *
 *  1. Nine assertions carried `timeout: 30_000` to absorb a network round trip
 *     through a service that paces callers to one request per second.
 *  2. The suite was non-deterministic. An address that resolves today can stop
 *     resolving tomorrow, and the failure looks like a bug in our code.
 *  3. Every CI run spent provider quota — free with Nominatim, real money the
 *     day a paid key is configured, on assertions about our own UI.
 *
 * What is deliberately NOT mocked: one spec tagged `@live` still asks the real
 * provider whether the address the client reported resolves. That is the
 * acceptance test, and it is the only thing that would notice an expired key.
 * It runs on a schedule, not on every pull request.
 */

export interface GeocodeFixture {
  id: string
  label: string
  fullLabel?: string
  lat: number
  lng: number
  kind?: 'address' | 'city' | 'zip' | 'poi' | 'region'
  /**
   * The real union, imported rather than spelled out again.
   *
   * It used to be redeclared inline, so adding or removing a precision level
   * left this file compiling happily against a vocabulary the application no
   * longer used -- a mock that agrees with nothing is worse than no mock.
   */
  precision?: GeocodePrecision
  street?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  bbox?: [number, number, number, number] | null
}

function toResponse(fixture: GeocodeFixture) {
  const address =
    fixture.street || fixture.city || fixture.state || fixture.postcode
      ? {
          street: fixture.street ?? null,
          city: fixture.city ?? null,
          state: fixture.state ?? null,
          postcode: fixture.postcode ?? null,
        }
      : null

  return {
    id: fixture.id,
    label: fixture.label,
    fullLabel: fixture.fullLabel ?? fixture.label,
    address,
    county: null,
    kind: fixture.kind ?? 'address',
    precision: fixture.precision ?? 'rooftop',
    providerId: 'nominatim',
    placeId: fixture.id,
    lat: fixture.lat,
    lng: fixture.lng,
    bbox: fixture.bbox ?? null,
    // Mocked as already-resolved, matching Nominatim. A suite that needs the
    // two-step Google/Mapbox flow should set this and answer the `?id=` call.
    needsResolve: false,
  }
}

export const ORLANDO: GeocodeFixture = {
  id: 'fixture-orlando',
  label: '1000 Legion Pl, Orlando, FL 32801',
  fullLabel: '1000 Legion Pl, Orlando, Orange County, Florida, 32801, United States',
  lat: 28.5383,
  lng: -81.3792,
  street: '1000 Legion Pl',
  city: 'Orlando',
  state: 'FL',
  postcode: '32801',
  bbox: [28.53, 28.54, -81.38, -81.37],
}

export const GAINESVILLE: GeocodeFixture = {
  id: 'fixture-gainesville',
  label: '3200 SW 34th St, Gainesville, FL 32608',
  fullLabel: '3200 Southwest 34th Street, Gainesville, Alachua County, Florida, 32608, United States',
  lat: 29.6216,
  lng: -82.3752,
  street: '3200 Southwest 34th Street',
  city: 'Gainesville',
  state: 'FL',
  postcode: '32608',
}

/**
 * The address the client reported, as the provider actually answers it today:
 * with nothing. Use it to drive the empty state and the manual-pin path.
 */
export const UNRESOLVABLE = '862 62nd St Cir E, Bradenton, FL'

/**
 * Routes every `/api/geocode` call to canned data.
 *
 * `matches` maps a lowercase substring of the query to the fixtures to return.
 * Anything unmatched returns an empty array, which is the honest default —
 * most strings a test types are not addresses.
 */
export async function mockGeocode(
  page: Page,
  matches: Array<{ query: string; results: GeocodeFixture[] }> = [
    { query: 'orlando', results: [ORLANDO] },
    { query: 'gainesville', results: [GAINESVILLE] },
    { query: '32801', results: [ORLANDO] },
  ]
): Promise<void> {
  await page.route('**/api/geocode*', async (route: Route) => {
    const url = new URL(route.request().url())

    // Reverse mode, for the draggable pin.
    if (url.searchParams.has('lat') && url.searchParams.has('lng')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'X-Geocode-Cache': 'miss' },
        body: JSON.stringify([
          toResponse({
            ...ORLANDO,
            id: 'fixture-reverse',
            label: 'Adjusted location',
            lat: Number(url.searchParams.get('lat')),
            lng: Number(url.searchParams.get('lng')),
          }),
        ]),
      })
      return
    }

    const query = (url.searchParams.get('q') ?? '').toLowerCase()
    const hit = matches.find((m) => query.includes(m.query.toLowerCase()))

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Geocode-Cache': 'miss' },
      body: JSON.stringify((hit?.results ?? []).map(toResponse)),
    })
  })
}

/** Makes every address lookup fail, for the outage-warning assertions. */
export async function failGeocode(page: Page): Promise<void> {
  await page.route('**/api/geocode*', async (route: Route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Geocoding service unavailable' }),
    })
  })
}
