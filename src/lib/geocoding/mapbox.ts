import { formatGeocodeLabel } from '@/lib/address'
import type {
  GeocodeAddress,
  GeocodeKind,
  GeocodeResult,
  GeocodeSuggestion,
} from '@/types/geocode'
import { mapboxProximity } from './bias'
import { UPSTREAM_TIMEOUT_MS } from './constants'
import { mapboxPrecision } from './precision'
import type { GeocodeContext, GeocodeProvider, ProviderResult } from './types'

/**
 * Mapbox Search Box, plus Geocoding v6 for the permanent-storage path.
 *
 * Dormant until `MAPBOX_ACCESS_TOKEN` is set; `configured()` returns false and
 * the chain in `index.ts` falls back to Nominatim, so shipping this costs
 * nothing until someone decides to switch it on.
 *
 * Two things about this provider are easy to get wrong and silent when you do:
 *
 *  1. Coordinates are `[longitude, latitude]`. Every other coordinate pair in
 *     this codebase is lat-first. Reversing them puts Florida in Somalia
 *     without raising anything — the same class of trap that
 *     `toLatLngBounds` in `src/lib/map/geo.ts` exists to document.
 *  2. `bbox` is `[west, south, east, north]`, while `GeocodeResult.bbox` is
 *     `[south, north, west, east]`. Neither is Leaflet's order either.
 *
 * Both conversions happen in exactly one place below.
 */

const SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest'
const RETRIEVE_URL = 'https://api.mapbox.com/search/searchbox/v1/retrieve'
const REVERSE_URL = 'https://api.mapbox.com/search/searchbox/v1/reverse'
/** Geocoding v6. The only endpoint whose results may be stored. */
const PERMANENT_URL = 'https://api.mapbox.com/search/geocode/v6/forward'

function token(): string | null {
  const value = process.env.MAPBOX_ACCESS_TOKEN
  return value && value.trim().length > 0 ? value.trim() : null
}

interface MapboxContext {
  address?: { name?: string; address_number?: string; street_name?: string }
  street?: { name?: string }
  neighborhood?: { name?: string }
  postcode?: { name?: string }
  place?: { name?: string }
  locality?: { name?: string }
  district?: { name?: string }
  region?: { name?: string; region_code?: string }
  country?: { name?: string; country_code?: string }
}

interface MapboxSuggestion {
  mapbox_id?: string
  name?: string
  name_preferred?: string
  address?: string
  full_address?: string
  place_formatted?: string
  feature_type?: string
  context?: MapboxContext
}

interface MapboxFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: MapboxSuggestion & {
    bbox?: [number, number, number, number]
    coordinates?: { latitude?: number; longitude?: number; accuracy?: string }
  }
}

const KIND_FOR_FEATURE_TYPE: Record<string, GeocodeKind> = {
  address: 'address',
  street: 'address',
  postcode: 'zip',
  place: 'city',
  locality: 'city',
  neighborhood: 'city',
  poi: 'poi',
  district: 'region',
  region: 'region',
  country: 'region',
}

function classify(featureType: string | undefined): GeocodeKind {
  return (featureType && KIND_FOR_FEATURE_TYPE[featureType]) || 'region'
}

/**
 * Mapbox splits the address across `context.address` and the top-level
 * `address` string depending on which endpoint answered, so both are consulted.
 * The state code comes from `region_code`, never from truncating `region.name`.
 */
function toAddress(s: MapboxSuggestion | undefined): GeocodeAddress | null {
  if (!s) return null
  const c = s.context ?? {}

  const numbered =
    c.address?.address_number && c.address?.street_name
      ? `${c.address.address_number} ${c.address.street_name}`
      : null
  const street = numbered ?? s.address ?? c.address?.name ?? c.street?.name ?? null
  const city = c.place?.name ?? c.locality?.name ?? c.neighborhood?.name ?? null
  const state = c.region?.region_code ?? c.region?.name ?? null
  const postcode = c.postcode?.name ?? null

  if (!street && !city && !state && !postcode) return null
  return { street, city, state, postcode }
}

/** `[west, south, east, north]` to `[south, north, west, east]`. */
function toBbox(
  bbox: [number, number, number, number] | undefined
): [number, number, number, number] | null {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => Number.isFinite(v))) {
    return null
  }
  const [west, south, east, north] = bbox
  return [south, north, west, east]
}

function labelFor(s: MapboxSuggestion, address: GeocodeAddress | null): string {
  const fallback = s.full_address ?? s.name ?? s.place_formatted ?? ''
  return formatGeocodeLabel(address, fallback)
}

/**
 * A suggestion row. Deliberately has no coordinates: Search Box withholds
 * geometry until `/retrieve`, which is the one billable call in the session.
 */
function toSuggestion(s: MapboxSuggestion): GeocodeSuggestion | null {
  if (!s.mapbox_id) return null
  const address = toAddress(s)
  return {
    id: s.mapbox_id,
    label: labelFor(s, address),
    fullLabel: s.full_address ?? s.place_formatted ?? s.name ?? '',
    address,
    county: s.context?.district?.name ?? null,
    kind: classify(s.feature_type),
    precision: mapboxPrecision(undefined, s.feature_type),
    providerId: 'mapbox',
    placeId: s.mapbox_id,
    lat: null,
    lng: null,
    bbox: null,
    needsResolve: true,
  }
}

function toResult(feature: MapboxFeature): GeocodeResult | null {
  const props = feature.properties
  if (!props) return null

  // `properties.coordinates` is authoritative and lat/lng-named; the GeoJSON
  // geometry is the [lng, lat] fallback for endpoints that omit it.
  const lat = props.coordinates?.latitude ?? feature.geometry?.coordinates?.[1]
  const lng = props.coordinates?.longitude ?? feature.geometry?.coordinates?.[0]
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const address = toAddress(props)
  return {
    id: props.mapbox_id ?? `${lat},${lng}`,
    label: labelFor(props, address),
    fullLabel: props.full_address ?? props.place_formatted ?? props.name ?? '',
    address,
    county: props.context?.district?.name ?? null,
    lat: lat as number,
    lng: lng as number,
    kind: classify(props.feature_type),
    precision: mapboxPrecision(props.coordinates?.accuracy, props.feature_type),
    providerId: 'mapbox',
    placeId: props.mapbox_id ?? null,
    needsResolve: false,
    bbox: toBbox(props.bbox),
  }
}

async function askJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (!res.ok) throw Object.assign(new Error(`Mapbox responded ${res.status}`), { status: res.status })
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
  console.error(`Mapbox ${where} error:`, err)
  return { ok: false, kind: 'upstream', status }
}

function featuresOf(data: unknown): MapboxFeature[] {
  const features = (data as { features?: unknown })?.features
  return Array.isArray(features) ? (features as MapboxFeature[]) : []
}

export const mapboxProvider: GeocodeProvider = {
  id: 'mapbox',
  needsDetails: true,
  // A paid provider saying "no such address" is authoritative. Asking OSM after
  // it would add a second of latency to confirm an answer we already trust.
  fallbackOnEmpty: false,
  configured: () => token() !== null,

  async autocomplete(query, ctx): Promise<ProviderResult<GeocodeSuggestion[]>> {
    const key = token()
    if (!key) return { ok: false, kind: 'config' }

    /**
     * `proximity` and never `bbox`. In Mapbox, `bbox` is a HARD filter: it would
     * hide a legitimate address that happens to sit just outside the current
     * viewport, which is precisely the case a personal-injury referral hits
     * when a client lives one county over.
     */
    const proximity = mapboxProximity(ctx)
    const params = new URLSearchParams({
      q: query,
      access_token: key,
      country: 'us',
      language: 'en',
      limit: String(ctx.limit),
      types: 'address,street,postcode,place,locality,neighborhood,poi',
    })
    if (ctx.sessionToken) params.set('session_token', ctx.sessionToken)
    if (proximity) params.set('proximity', proximity)

    try {
      const data = await askJson(`${SUGGEST_URL}?${params}`, ctx.signal)
      const raw = (data as { suggestions?: unknown })?.suggestions
      const suggestions = Array.isArray(raw) ? (raw as MapboxSuggestion[]) : []
      return {
        ok: true,
        value: suggestions
          .map(toSuggestion)
          .filter((s): s is GeocodeSuggestion => s !== null)
          .slice(0, ctx.limit),
      }
    } catch (err) {
      return failureFor(err, 'autocomplete')
    }
  },

  async details(id, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    const key = token()
    if (!key) return { ok: false, kind: 'config' }
    if (!id) return { ok: false, kind: 'bad_id' }

    const params = new URLSearchParams({ access_token: key })
    if (ctx.sessionToken) params.set('session_token', ctx.sessionToken)

    try {
      const data = await askJson(`${RETRIEVE_URL}/${encodeURIComponent(id)}?${params}`, ctx.signal)
      const [feature] = featuresOf(data)
      return { ok: true, value: feature ? toResult(feature) : null }
    } catch (err) {
      return failureFor(err, 'details')
    }
  },

  async reverse(lat, lng, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    const key = token()
    if (!key) return { ok: false, kind: 'config' }

    const params = new URLSearchParams({
      longitude: String(lng),
      latitude: String(lat),
      access_token: key,
      types: 'address',
    })

    try {
      const data = await askJson(`${REVERSE_URL}?${params}`, ctx.signal)
      const [feature] = featuresOf(data)
      return { ok: true, value: feature ? toResult(feature) : null }
    } catch (err) {
      return failureFor(err, 'reverse')
    }
  },
}

/**
 * The storable path: Geocoding v6 with `permanent=true`.
 *
 * Kept separate from `autocomplete()` on purpose. Temporary Search Box results
 * are cache-only under Mapbox's terms, so writing one to `clinics.lat` would be
 * a licence breach rather than a bug. Anything that persists a coordinate — the
 * backfill, the admin save path — goes through here and pays the permanent
 * rate. `ctx.permanent` is the flag that routes callers correctly.
 *
 * It also returns geometry directly, with no session and no second round trip,
 * which is what makes it the right shape for a batch job.
 */
export async function mapboxPermanentForward(
  query: string,
  ctx: GeocodeContext
): Promise<ProviderResult<GeocodeResult | null>> {
  const key = token()
  if (!key) return { ok: false, kind: 'config' }

  const params = new URLSearchParams({
    q: query,
    access_token: key,
    country: 'us',
    permanent: 'true',
    limit: '1',
  })

  try {
    const data = await askJson(`${PERMANENT_URL}?${params}`, ctx.signal)
    const [feature] = featuresOf(data)
    return { ok: true, value: feature ? toResult(feature) : null }
  } catch (err) {
    return failureFor(err, 'permanent forward')
  }
}

/** Exposed for the adapter-parity tests; not part of the provider interface. */
export const __mapboxInternals = { classify, toAddress, toBbox, toResult, toSuggestion }
