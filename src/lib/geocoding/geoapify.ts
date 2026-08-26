import { formatGeocodeLabel } from '@/lib/address'
import type {
  GeocodeAddress,
  GeocodeKind,
  GeocodePrecision,
  GeocodeResult,
  GeocodeSuggestion,
} from '@/types/geocode'
import { UPSTREAM_TIMEOUT_MS } from './constants'
import type { GeocodeContext, GeocodeProvider, ProviderResult } from './types'

/**
 * Geoapify — the zero-cost route to real US address coverage.
 *
 * This adapter exists because of a specific finding. The address the client
 * reported, "862 62nd St Cir E, Bradenton, FL", is absent from OpenStreetMap
 * and wrong in the US Census TIGER data — the Census geocoder answers with
 * "862 62ND ST W, 34209", which is 14 km from the real building. But it IS in
 * Manatee County's official address-point layer, at 27.491257, -82.481824, and
 * that layer is published under CC BY 4.0 and aggregated into OpenAddresses:
 *
 *   sources/us/fl/manatee.json  ->  ADDRESS_POINTS/FeatureServer/2
 *
 * OpenAddresses carries 72 Florida sources and 70 Minnesota sources — the two
 * states this product serves — and Geoapify builds its geocoder on
 * OpenAddresses plus OSM. So the data that fixes the reported bug is free, and
 * somebody has already done the hard part of turning 14 million address points
 * into a fast, typo-tolerant search index.
 *
 * The free plan is 3,000 credits/day (~90,000 a month) with no credit card,
 * and Geoapify's own FAQ states commercial use is not restricted provided the
 * attribution is shown. This product needs roughly 1,000-3,500 lookups a month,
 * which is under 4% of that.
 *
 * TWO OBLIGATIONS COME WITH IT, and neither is optional:
 *
 *  1. Attribution. "Powered by Geoapify" has to be visible wherever results
 *     are shown. `GEOAPIFY_ATTRIBUTION` below is the exact string, and the
 *     search box renders it.
 *  2. The daily cap is a real ceiling, not a soft limit. The per-user quota in
 *     `rate-limit.ts` and the shared cache are what keep normal use two orders
 *     of magnitude beneath it — do not remove them on the grounds that the
 *     provider is free.
 *
 * Unlike Google and Mapbox, autocomplete returns coordinates directly, so
 * `needsDetails` is false: one request per lookup, one credit, no resolve step.
 */

const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete'
const REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse'

/** Required by the free plan. Rendered by the search box, not optional. */
export const GEOAPIFY_ATTRIBUTION = 'Powered by Geoapify'

function apiKey(): string | null {
  const value = process.env.GEOAPIFY_API_KEY
  return value && value.trim().length > 0 ? value.trim() : null
}

interface GeoapifyResult {
  place_id?: string
  formatted?: string
  address_line1?: string
  address_line2?: string
  housenumber?: string
  street?: string
  city?: string
  county?: string
  state_code?: string
  state?: string
  postcode?: string
  country_code?: string
  lon?: number
  lat?: number
  result_type?: string
  category?: string
  rank?: { confidence?: number; match_type?: string }
  bbox?: { lon1?: number; lat1?: number; lon2?: number; lat2?: number }
}

const KIND_FOR_RESULT_TYPE: Record<string, GeocodeKind> = {
  building: 'address',
  street: 'address',
  postcode: 'zip',
  city: 'city',
  district: 'city',
  suburb: 'city',
  amenity: 'poi',
  county: 'region',
  state: 'region',
  country: 'region',
}

function classify(resultType: string | undefined): GeocodeKind {
  return (resultType && KIND_FOR_RESULT_TYPE[resultType]) || 'region'
}

/**
 * Geoapify reports both WHAT it found (`result_type`) and HOW WELL the query
 * matched it (`rank.match_type`). Both matter: a `building` result reached by
 * `match_by_street` is a street-level guess wearing a building's clothes, and
 * treating it as rooftop would suppress the "drag the pin" prompt on a point
 * that needs it. Erring coarse is the safe direction.
 */
function precisionFor(result: GeoapifyResult): GeocodePrecision {
  const matchType = result.rank?.match_type
  const resultType = result.result_type

  if (matchType === 'match_by_postcode') return 'zip'
  if (matchType === 'match_by_city_or_disrict') return 'city'
  if (matchType === 'match_by_street') return 'street'

  if (resultType === 'building' || resultType === 'amenity') {
    // A house number that survived the match is an address point, not a guess.
    if (result.housenumber) return 'rooftop'
    return 'street'
  }
  if (resultType === 'street') return 'street'
  if (resultType === 'postcode') return 'zip'
  if (resultType === 'city' || resultType === 'district' || resultType === 'suburb') return 'city'
  if (resultType === 'county' || resultType === 'state' || resultType === 'country') return 'region'
  return 'unknown'
}

function toAddress(result: GeoapifyResult): GeocodeAddress | null {
  const street =
    result.housenumber && result.street
      ? `${result.housenumber} ${result.street}`
      : (result.street ?? null)
  const city = result.city ?? null
  // `state_code` is the two-letter form Geoapify states outright. Never
  // truncate `state`: "Michigan" and "Minnesota" both start "Mi".
  const state = result.state_code ?? result.state ?? null
  const postcode = result.postcode ?? null

  if (!street && !city && !state && !postcode) return null
  return { street, city, state, postcode }
}

/** Geoapify gives `{lon1, lat1, lon2, lat2}`; ours is `[south, north, west, east]`. */
function toBbox(bbox: GeoapifyResult['bbox']): [number, number, number, number] | null {
  const { lon1, lat1, lon2, lat2 } = bbox ?? {}
  if (![lon1, lat1, lon2, lat2].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return null
  }
  return [
    Math.min(lat1 as number, lat2 as number),
    Math.max(lat1 as number, lat2 as number),
    Math.min(lon1 as number, lon2 as number),
    Math.max(lon1 as number, lon2 as number),
  ]
}

function toResult(result: GeoapifyResult): GeocodeResult | null {
  const { lat, lon } = result
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const address = toAddress(result)
  const id = result.place_id ?? `${lat},${lon}`

  return {
    id,
    label: formatGeocodeLabel(address, result.formatted ?? result.address_line1 ?? ''),
    fullLabel: result.formatted ?? '',
    address,
    county: result.county ?? null,
    lat,
    lng: lon,
    kind: classify(result.result_type),
    precision: precisionFor(result),
    providerId: 'geoapify',
    placeId: result.place_id ?? null,
    needsResolve: false,
    bbox: toBbox(result.bbox),
  }
}

async function askJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw Object.assign(new Error(`Geoapify responded ${res.status}`), { status: res.status })
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function failureFor(err: unknown, where: string): ProviderResult<never> {
  if (err instanceof Error && err.name === 'AbortError') return { ok: false, kind: 'timeout' }
  const status = (err as { status?: number }).status
  // 429 is the daily credit cap. Surfaced as its own kind so the route can say
  // "busy, try shortly" rather than "this address does not exist".
  if (status === 429) return { ok: false, kind: 'rate_limited' }
  console.error(`Geoapify ${where} error:`, err)
  return { ok: false, kind: 'upstream', status }
}

function resultsOf(data: unknown): GeoapifyResult[] {
  const results = (data as { results?: unknown })?.results
  return Array.isArray(results) ? (results as GeoapifyResult[]) : []
}

export const geoapifyProvider: GeocodeProvider = {
  id: 'geoapify',
  // Coordinates arrive with the suggestion, so there is nothing to resolve and
  // a lookup costs exactly one credit.
  needsDetails: false,
  // A paid-grade dataset saying "no such address" is an answer. Asking OSM
  // afterwards would add a second of latency to confirm what is already known.
  fallbackOnEmpty: false,
  configured: () => apiKey() !== null,

  async autocomplete(query, ctx): Promise<ProviderResult<GeocodeSuggestion[]>> {
    const key = apiKey()
    if (!key) return { ok: false, kind: 'config' }

    const params = new URLSearchParams({
      text: query,
      apiKey: key,
      format: 'json',
      lang: 'en',
      limit: String(ctx.limit),
      // A soft country filter. Geoapify treats `filter` as a hard constraint,
      // which is correct here — this product is US-only — but it is the reason
      // no state-level filter is applied: a client who moved one state over
      // must stay findable.
      filter: 'countrycode:us',
    })

    // `bias` is the soft one. Ranks nearby answers first without hiding others.
    if (ctx.proximity) {
      params.set('bias', `proximity:${ctx.proximity.lng},${ctx.proximity.lat}`)
    }

    try {
      const data = await askJson(`${AUTOCOMPLETE_URL}?${params}`, ctx.signal)
      return {
        ok: true,
        value: resultsOf(data)
          .map(toResult)
          .filter((r): r is GeocodeResult => r !== null)
          .slice(0, ctx.limit),
      }
    } catch (err) {
      return failureFor(err, 'autocomplete')
    }
  },

  /**
   * Never normally called — `needsDetails` is false and the route short
   * circuits. Present so the interface is total, and so a client holding an id
   * from an earlier session gets a real answer rather than a type error.
   */
  async details(id, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    const key = apiKey()
    if (!key) return { ok: false, kind: 'config' }
    if (!id) return { ok: false, kind: 'bad_id' }

    const params = new URLSearchParams({
      text: id,
      apiKey: key,
      format: 'json',
      limit: '1',
      filter: 'countrycode:us',
    })

    try {
      const data = await askJson(`${AUTOCOMPLETE_URL}?${params}`, ctx.signal)
      const [first] = resultsOf(data)
      return { ok: true, value: first ? toResult(first) : null }
    } catch (err) {
      return failureFor(err, 'details')
    }
  },

  async reverse(lat, lng, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    const key = apiKey()
    if (!key) return { ok: false, kind: 'config' }

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      apiKey: key,
      format: 'json',
      lang: 'en',
    })

    try {
      const data = await askJson(`${REVERSE_URL}?${params}`, ctx.signal)
      const [first] = resultsOf(data)
      // No match is not an error: open water, a field, a private lot. The pin
      // is still where the user put it; only the name is unknown.
      return { ok: true, value: first ? toResult(first) : null }
    } catch (err) {
      return failureFor(err, 'reverse')
    }
  },
}

/** Exposed for the adapter-parity tests; not part of the provider interface. */
export const __geoapifyInternals = { classify, precisionFor, toAddress, toBbox, toResult }
