import { formatGeocodeLabel } from '@/lib/address'
import type {
  GeocodeAddress,
  GeocodeKind,
  GeocodeResult,
  GeocodeSuggestion,
} from '@/types/geocode'
import { googleLocationBias } from './bias'
import { UPSTREAM_TIMEOUT_MS } from './constants'
import { googleGeocodingPrecision, googlePlacesPrecision } from './precision'
import type { GeocodeContext, GeocodeProvider, ProviderResult } from './types'

/**
 * Google Places API (New) for search, Geocoding API for reverse.
 *
 * Dormant until `GOOGLE_MAPS_SERVER_KEY` is set. Two constraints shape this
 * adapter and both are contractual rather than technical:
 *
 *  1. Coordinates from Google may be retained for at most 30 consecutive days;
 *     only the place id may be stored indefinitely. `MAX_SHARED_CACHE_TTL_MS`
 *     enforces the cache side, and anything writing a Google coordinate to a
 *     `clinics` row inherits a recurring obligation to refresh it. That is the
 *     single strongest argument for using Mapbox `permanent=true` on the write
 *     path even if Google wins the search box.
 *  2. Google's terms forbid displaying its results on a non-Google map. This
 *     adapter is therefore inert until the map layer migrates; enabling it over
 *     the current Leaflet/OSM basemap would be a licence breach, not a
 *     preference.
 *
 * A documented fidelity gap: Places Details does NOT return `location_type`, so
 * `precision` has to be inferred from `types[]`. Reverse deliberately uses the
 * Geocoding endpoint, where precision is stated outright.
 */

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete'
const DETAILS_URL = 'https://places.googleapis.com/v1/places'
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

/**
 * Essentials only. Every field here is in the cheapest SKU; adding
 * `displayName` or anything else would silently promote the call to Pro and
 * roughly triple its cost per resolution.
 */
const DETAILS_FIELD_MASK = 'id,location,formattedAddress,addressComponents,viewport,types'

function apiKey(): string | null {
  const value = process.env.GOOGLE_MAPS_SERVER_KEY
  return value && value.trim().length > 0 ? value.trim() : null
}

interface GoogleComponent {
  longText?: string
  shortText?: string
  types?: string[]
  /** Geocoding API uses snake_case for the same idea. */
  long_name?: string
  short_name?: string
}

interface GoogleViewport {
  low?: { latitude?: number; longitude?: number }
  high?: { latitude?: number; longitude?: number }
}

interface GooglePlaceDetails {
  id?: string
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  addressComponents?: GoogleComponent[]
  viewport?: GoogleViewport
  types?: string[]
}

interface GooglePrediction {
  placePrediction?: {
    placeId?: string
    text?: { text?: string }
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
    types?: string[]
  }
}

const KIND_RULES: [string, GeocodeKind][] = [
  ['street_address', 'address'],
  ['premise', 'address'],
  ['subpremise', 'address'],
  ['route', 'address'],
  ['postal_code', 'zip'],
  ['locality', 'city'],
  ['sublocality', 'city'],
  ['neighborhood', 'city'],
  ['point_of_interest', 'poi'],
  ['establishment', 'poi'],
]

function classify(types: readonly string[] | undefined): GeocodeKind {
  const set = new Set(types ?? [])
  for (const [type, kind] of KIND_RULES) if (set.has(type)) return kind
  return 'region'
}

function pick(components: GoogleComponent[], type: string, short = false): string | null {
  const hit = components.find((c) => (c.types ?? []).includes(type))
  if (!hit) return null
  return (short ? (hit.shortText ?? hit.short_name) : (hit.longText ?? hit.long_name)) ?? null
}

/**
 * The state code comes from `administrative_area_level_1.shortText` ("FL"),
 * which Google states directly — no truncation of the long name, for the same
 * "Michigan"/"Minnesota" reason the Nominatim adapter takes the ISO field.
 */
function toAddress(components: GoogleComponent[] | undefined): {
  address: GeocodeAddress | null
  county: string | null
} {
  if (!components || components.length === 0) return { address: null, county: null }

  const number = pick(components, 'street_number')
  const route = pick(components, 'route')
  const street = [number, route].filter(Boolean).join(' ').trim() || null
  const city =
    pick(components, 'locality') ??
    pick(components, 'postal_town') ??
    pick(components, 'sublocality') ??
    null
  const state = pick(components, 'administrative_area_level_1', true)
  const postcode = pick(components, 'postal_code')
  const county = pick(components, 'administrative_area_level_2')

  if (!street && !city && !state && !postcode) return { address: null, county }
  return { address: { street, city, state, postcode }, county }
}

/** Google's viewport corners to `[south, north, west, east]`. */
function toBbox(viewport: GoogleViewport | undefined): [number, number, number, number] | null {
  const south = viewport?.low?.latitude
  const north = viewport?.high?.latitude
  const west = viewport?.low?.longitude
  const east = viewport?.high?.longitude
  if (![south, north, west, east].every((v) => Number.isFinite(v))) return null
  return [south as number, north as number, west as number, east as number]
}

async function askJson(
  url: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      throw Object.assign(new Error(`Google responded ${res.status}`), { status: res.status })
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
  if (status === 429) return { ok: false, kind: 'rate_limited' }
  if (status === 404) return { ok: false, kind: 'bad_id' }
  console.error(`Google ${where} error:`, err)
  return { ok: false, kind: 'upstream', status }
}

function detailsToResult(place: GooglePlaceDetails): GeocodeResult | null {
  const lat = place.location?.latitude
  const lng = place.location?.longitude
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const { address, county } = toAddress(place.addressComponents)
  return {
    id: place.id ?? `${lat},${lng}`,
    label: formatGeocodeLabel(address, place.formattedAddress ?? ''),
    fullLabel: place.formattedAddress ?? '',
    address,
    county,
    lat: lat as number,
    lng: lng as number,
    kind: classify(place.types),
    precision: googlePlacesPrecision(place.types),
    providerId: 'google',
    placeId: place.id ?? null,
    needsResolve: false,
    bbox: toBbox(place.viewport),
  }
}

export const googleProvider: GeocodeProvider = {
  id: 'google',
  needsDetails: true,
  fallbackOnEmpty: false,
  configured: () => apiKey() !== null,

  async autocomplete(query, ctx): Promise<ProviderResult<GeocodeSuggestion[]>> {
    const key = apiKey()
    if (!key) return { ok: false, kind: 'config' }

    /**
     * `locationBias`, never `locationRestriction`. The latter is a hard filter
     * and would make an address just outside the current view unfindable.
     */
    const body: Record<string, unknown> = {
      input: query,
      includedRegionCodes: ['us'],
    }
    if (ctx.sessionToken) body.sessionToken = ctx.sessionToken
    const bias = googleLocationBias(ctx)
    if (bias) body.locationBias = bias

    try {
      const data = await askJson(
        AUTOCOMPLETE_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask':
              'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
          },
          body: JSON.stringify(body),
        },
        ctx.signal
      )

      const raw = (data as { suggestions?: unknown })?.suggestions
      const predictions = Array.isArray(raw) ? (raw as GooglePrediction[]) : []

      const value = predictions
        .map((p): GeocodeSuggestion | null => {
          const pred = p.placePrediction
          if (!pred?.placeId) return null
          // `structuredFormat` splits exactly the way `formatGeocodeLines`
          // wants it: street on top, "city, ST ZIP" underneath.
          const main = pred.structuredFormat?.mainText?.text ?? pred.text?.text ?? ''
          const secondary = pred.structuredFormat?.secondaryText?.text ?? ''
          return {
            id: pred.placeId,
            label: secondary ? `${main}, ${secondary}` : main,
            fullLabel: pred.text?.text ?? [main, secondary].filter(Boolean).join(', '),
            // Autocomplete returns no components; they arrive with details().
            address: null,
            county: null,
            kind: classify(pred.types),
            precision: googlePlacesPrecision(pred.types),
            providerId: 'google',
            placeId: pred.placeId,
            lat: null,
            lng: null,
            bbox: null,
            needsResolve: true,
          }
        })
        .filter((s): s is GeocodeSuggestion => s !== null)
        .slice(0, ctx.limit)

      return { ok: true, value }
    } catch (err) {
      return failureFor(err, 'autocomplete')
    }
  },

  async details(id, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    const key = apiKey()
    if (!key) return { ok: false, kind: 'config' }
    if (!id) return { ok: false, kind: 'bad_id' }

    const params = new URLSearchParams()
    // Passing the session token here is what closes the session and makes the
    // preceding autocomplete keystrokes billable as one unit rather than N.
    if (ctx.sessionToken) params.set('sessionToken', ctx.sessionToken)
    const qs = params.toString()

    try {
      const data = await askJson(
        `${DETAILS_URL}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
        {
          headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
        },
        ctx.signal
      )
      return { ok: true, value: detailsToResult(data as GooglePlaceDetails) }
    } catch (err) {
      return failureFor(err, 'details')
    }
  },

  /**
   * Reverse goes through the Geocoding API rather than Places, because only
   * Geocoding states `location_type`. For the draggable pin, "is this the
   * rooftop or the middle of the street" is the entire question.
   */
  async reverse(lat, lng, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    const key = apiKey()
    if (!key) return { ok: false, kind: 'config' }

    const params = new URLSearchParams({ latlng: `${lat},${lng}`, key })

    try {
      const data = (await askJson(`${GEOCODING_URL}?${params}`, {}, ctx.signal)) as {
        status?: string
        results?: Array<{
          place_id?: string
          formatted_address?: string
          types?: string[]
          address_components?: GoogleComponent[]
          geometry?: {
            location?: { lat?: number; lng?: number }
            location_type?: string
            viewport?: { northeast?: { lat?: number; lng?: number }; southwest?: { lat?: number; lng?: number } }
          }
        }>
      }

      // ZERO_RESULTS is not an error: open water, a field, a private lot. The
      // caller still has coordinates and can say "Custom location".
      const first = data?.results?.[0]
      if (!first) return { ok: true, value: null }

      const rlat = first.geometry?.location?.lat
      const rlng = first.geometry?.location?.lng
      if (!Number.isFinite(rlat) || !Number.isFinite(rlng)) return { ok: true, value: null }

      const { address, county } = toAddress(first.address_components)
      const ne = first.geometry?.viewport?.northeast
      const sw = first.geometry?.viewport?.southwest

      return {
        ok: true,
        value: {
          id: first.place_id ?? `${rlat},${rlng}`,
          label: formatGeocodeLabel(address, first.formatted_address ?? ''),
          fullLabel: first.formatted_address ?? '',
          address,
          county,
          lat: rlat as number,
          lng: rlng as number,
          kind: classify(first.types),
          precision: googleGeocodingPrecision(first.geometry?.location_type),
          providerId: 'google',
          placeId: first.place_id ?? null,
          needsResolve: false,
          bbox:
            [sw?.lat, ne?.lat, sw?.lng, ne?.lng].every((v) => Number.isFinite(v))
              ? [sw!.lat as number, ne!.lat as number, sw!.lng as number, ne!.lng as number]
              : null,
        },
      }
    } catch (err) {
      return failureFor(err, 'reverse')
    }
  },
}

/** Exposed for the adapter-parity tests; not part of the provider interface. */
export const __googleInternals = { classify, toAddress, toBbox, detailsToResult }
