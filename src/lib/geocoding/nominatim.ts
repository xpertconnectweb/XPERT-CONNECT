import { formatGeocodeLabel, stripUnit } from '@/lib/address'
import { extractZip } from '@/lib/search/text'
import type {
  GeocodeAddress,
  GeocodeKind,
  GeocodeResult,
  GeocodeSuggestion,
} from '@/types/geocode'
import { nominatimViewbox } from './bias'
import { MIN_GEOCODE_QUERY, MIN_UPSTREAM_INTERVAL_MS, UPSTREAM_TIMEOUT_MS } from './constants'
import { nominatimPrecision } from './precision'
import type { GeocodeContext, GeocodeProvider, ProviderResult } from './types'

/**
 * OpenStreetMap via Nominatim. The default, and the only provider that needs no
 * API key.
 *
 * This is the code that used to be `src/app/api/geocode/route.ts` in its
 * entirety, moved behind the provider interface unchanged. Everything here that
 * looks odd is load-bearing and was learned the hard way — see the notes on the
 * candidate chain and the pacing below.
 *
 * Its limitation is not fixable from inside this file, and is the reason the
 * other two adapters exist: OSM's US address coverage is patchy. The address
 * "862 62nd St Cir E, Bradenton, FL" returns an empty array for the raw query,
 * for the USPS-expanded query, for the street alone, AND for the query with the
 * ZIP appended — because the street is not in the dataset at all. No parser
 * invents missing data.
 */

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'XpertConnect/1.0 (https://www.844xpert.com)'

interface NominatimPlace {
  place_id?: number | string
  lat?: string
  lon?: string
  display_name?: string
  boundingbox?: string[]
  class?: string
  type?: string
  address?: Record<string, string | undefined>
}

/**
 * Module-level, which is all a serverless function can offer. It does not
 * coordinate across warm lambdas, so on its own it under-protects — the shared
 * cache is what actually keeps upstream volume down, and this is the belt to
 * that pair of braces.
 */
let lastUpstreamAt = 0

async function pace(): Promise<void> {
  // Space out upstream calls rather than burst them, per Nominatim's policy.
  const since = Date.now() - lastUpstreamAt
  if (since < MIN_UPSTREAM_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_UPSTREAM_INTERVAL_MS - since))
  }
  lastUpstreamAt = Date.now()
}

async function askJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Labels a result so the UI can pick an icon and a sensible zoom level.
 * A ZIP deserves a wider view than a street address.
 */
function classify(place: NominatimPlace): GeocodeKind {
  const address = place.address ?? {}
  if (place.type === 'postcode') return 'zip'
  if (address.house_number || address.road) return 'address'
  if (place.class === 'amenity' || place.class === 'shop' || place.class === 'office') return 'poi'
  if (address.city || address.town || address.village || address.hamlet) return 'city'
  return 'region'
}

/**
 * Pulls the recognisable parts out of Nominatim's `address` object.
 *
 * `addressdetails=1` is already requested, so this costs nothing — the
 * components were being parsed for `classify()` and then discarded.
 *
 * The state code comes from `ISO3166-2-lvl4` ("US-FL"), not from truncating
 * the state name: "Michigan" and "Minnesota" both start "Mi".
 */
function toAddress(place: NominatimPlace): GeocodeAddress | null {
  const a = place.address
  if (!a) return null

  const street = [a.house_number, a.road].filter(Boolean).join(' ').trim() || null
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? null
  const iso = a['ISO3166-2-lvl4']
  const state = iso?.startsWith('US-') ? iso.slice(3) : (a.state ?? null)
  const postcode = a.postcode ?? null

  if (!street && !city && !state && !postcode) return null
  return { street, city, state, postcode }
}

function toResult(place: NominatimPlace, index: number): GeocodeResult | null {
  const lat = Number(place.lat)
  const lng = Number(place.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const full = place.display_name ?? ''
  const bbox = place.boundingbox
  const address = toAddress(place)

  return {
    id: String(place.place_id ?? `${lat},${lng},${index}`),
    // Built from the components when we have them. The old first-three-commas
    // rule turned "3200 SW 34th St, Gainesville, FL 32608" into
    // "3200, Southwest 34th Street, Daysville" — dropping the city and ZIP the
    // user typed in favour of a neighbourhood they had never heard of.
    label: formatGeocodeLabel(address, full.split(',').slice(0, 3).join(',').trim() || full),
    fullLabel: full,
    address,
    county: place.address?.county ?? null,
    lat,
    lng,
    kind: classify(place),
    precision: nominatimPrecision(place.type, place.class, place.address),
    providerId: 'nominatim',
    placeId: place.place_id === undefined ? null : String(place.place_id),
    needsResolve: false,
    bbox:
      Array.isArray(bbox) && bbox.length === 4 && bbox.every((v) => Number.isFinite(Number(v)))
        ? [Number(bbox[0]), Number(bbox[1]), Number(bbox[2]), Number(bbox[3])]
        : null,
  }
}

async function search(query: string, ctx: GeocodeContext): Promise<NominatimPlace[]> {
  await pace()

  // `bounded=0` is what keeps the viewbox a preference rather than a filter.
  // With `bounded=1`, a client who moved out of state becomes unfindable.
  const viewbox = nominatimViewbox(ctx)
  const bias = viewbox ? `&viewbox=${viewbox}&bounded=0` : ''

  const url =
    `${SEARCH_URL}?format=json&addressdetails=1&countrycodes=us` +
    `&limit=${ctx.limit}${bias}&q=${encodeURIComponent(query)}`

  const data = await askJson(url, ctx.signal)
  return Array.isArray(data) ? (data as NominatimPlace[]) : []
}

function failureFor(err: unknown, where: string): ProviderResult<never> {
  if (err instanceof Error && err.name === 'AbortError') return { ok: false, kind: 'timeout' }
  console.error(`Nominatim ${where} error:`, err)
  return { ok: false, kind: 'upstream' }
}

export const nominatimProvider: GeocodeProvider = {
  id: 'nominatim',
  needsDetails: false,
  // An empty answer from OSM says nothing about whether the address exists, so
  // it is worth asking someone else. This is the only provider where that holds.
  fallbackOnEmpty: true,
  configured: () => true,

  async autocomplete(query, ctx): Promise<ProviderResult<GeocodeSuggestion[]>> {
    // Nominatim returns an EMPTY array when the query contains an apartment or
    // unit designator ("Apt 4B", "#1402", "Suite 200") — verified against the
    // live service, and the original cause of "only the bare ZIP works". So the
    // unit-stripped form goes first; it also tends to be more precise, because a
    // full "...Apt 200..." string often matches a coarse city centroid instead
    // of the street. The bare ZIP is a last resort so a search is never empty.
    //
    // The chain lives in THIS adapter rather than in the route because it is a
    // workaround for this provider. Google and Mapbox parse unit designators
    // correctly, and running three sequential paced calls against them would
    // spend money to make the answer worse.
    const zip = extractZip(query)
    const candidates = Array.from(
      new Set(
        [stripUnit(query), query, zip].filter(
          (c): c is string => !!c && c.length >= MIN_GEOCODE_QUERY
        )
      )
    )

    try {
      let places: NominatimPlace[] = []
      for (const candidate of candidates) {
        places = await search(candidate, ctx)
        if (places.length > 0) break
      }

      return {
        ok: true,
        value: places
          .map(toResult)
          .filter((r): r is GeocodeResult => r !== null)
          .slice(0, ctx.limit),
      }
    } catch (err) {
      return failureFor(err, 'autocomplete')
    }
  },

  /**
   * Nominatim hands back geometry with every suggestion, so there is normally
   * nothing to resolve — `needsDetails` is false and the route short-circuits.
   * This exists so the interface is total, and for the case where a client holds
   * an id from an earlier session.
   */
  async details(id, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    await pace()
    try {
      const url = `${SEARCH_URL}?format=json&addressdetails=1&place_id=${encodeURIComponent(id)}`
      const data = await askJson(url, ctx.signal)
      const places = Array.isArray(data) ? (data as NominatimPlace[]) : []
      return { ok: true, value: places.length ? toResult(places[0], 0) : null }
    } catch (err) {
      return failureFor(err, 'details')
    }
  },

  /**
   * What is at these coordinates?
   *
   * Needed because the home pin is draggable: once someone nudges it onto the
   * right driveway, the address on screen has to follow, or the card goes on
   * naming a building the pin is no longer on.
   */
  async reverse(lat, lng, ctx): Promise<ProviderResult<GeocodeResult | null>> {
    await pace()
    // zoom=18 is building level. Lower and a nudge across a street would report
    // the same place, which would make the drag look broken.
    const url = `${REVERSE_URL}?format=json&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`
    try {
      const data = await askJson(url, ctx.signal)
      const place =
        data && typeof data === 'object' && !(data as { error?: unknown }).error
          ? (data as NominatimPlace)
          : null
      return { ok: true, value: place ? toResult(place, 0) : null }
    } catch (err) {
      return failureFor(err, 'reverse')
    }
  },
}

/** Exposed for the adapter-parity tests; not part of the provider interface. */
export const __nominatimInternals = { classify, toAddress, toResult }
