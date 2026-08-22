import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { extractZip } from '@/lib/search/text'
import { stripUnit } from '@/lib/address'
import type { GeocodeResult } from '@/types/geocode'

/**
 * Server-side proxy for Nominatim address lookup.
 *
 * The map used to call nominatim.openstreetmap.org straight from the browser.
 * Proxying instead buys three things:
 *
 *  1. A real `User-Agent`. Nominatim's usage policy requires one, and browsers
 *     silently drop the header — so the old client-side call identified us as
 *     nobody, which is exactly what gets an IP blocked.
 *  2. A shared cache. Coordinates for an address do not change, so a hit here
 *     serves every user instantly and never touches the upstream.
 *  3. Privacy. This is a personal-injury referral tool: the addresses being
 *     geocoded are clients' home addresses, and they were being sent to a
 *     third party from the user's own browser.
 */

export const dynamic = 'force-dynamic'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'XpertConnect/1.0 (https://www.844xpert.com)'
const MIN_QUERY = 3
const MAX_QUERY = 200
const DEFAULT_LIMIT = 8
const MAX_LIMIT = 10
const UPSTREAM_TIMEOUT_MS = 8000

/** Nominatim asks for no more than one request per second. */
const MIN_UPSTREAM_INTERVAL_MS = 1000
/** Coordinates are stable; a day is conservative. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX_ENTRIES = 500

interface CacheEntry {
  at: number
  results: GeocodeResult[]
}

// Per-instance, which is all a serverless function can offer. Worst case is a
// cold instance paying one upstream call.
const cache = new Map<string, CacheEntry>()
let lastUpstreamAt = 0

function cacheGet(key: string): GeocodeResult[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  // Refresh recency so the eviction below is LRU rather than insertion-order.
  cache.delete(key)
  cache.set(key, entry)
  return entry.results
}

function cacheSet(key: string, results: GeocodeResult[]): void {
  cache.set(key, { at: Date.now(), results })
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

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
 * Labels a result so the UI can pick an icon and a sensible zoom level.
 * A ZIP deserves a wider view than a street address.
 */
function classify(place: NominatimPlace): GeocodeResult['kind'] {
  const address = place.address ?? {}
  if (place.type === 'postcode') return 'zip'
  if (address.house_number || address.road) return 'address'
  if (place.class === 'amenity' || place.class === 'shop' || place.class === 'office') return 'poi'
  if (address.city || address.town || address.village || address.hamlet) return 'city'
  return 'region'
}

function toResult(place: NominatimPlace, index: number): GeocodeResult | null {
  const lat = Number(place.lat)
  const lng = Number(place.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const full = place.display_name ?? ''
  const bbox = place.boundingbox
  return {
    id: String(place.place_id ?? `${lat},${lng},${index}`),
    label: full.split(',').slice(0, 3).join(',').trim() || full,
    fullLabel: full,
    lat,
    lng,
    kind: classify(place),
    bbox:
      Array.isArray(bbox) && bbox.length === 4 && bbox.every((v) => Number.isFinite(Number(v)))
        ? [Number(bbox[0]), Number(bbox[1]), Number(bbox[2]), Number(bbox[3])]
        : null,
  }
}

async function askNominatim(query: string, limit: number): Promise<NominatimPlace[]> {
  // Space out upstream calls rather than burst them, per Nominatim's policy.
  const since = Date.now() - lastUpstreamAt
  if (since < MIN_UPSTREAM_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_UPSTREAM_INTERVAL_MS - since))
  }
  lastUpstreamAt = Date.now()

  const url =
    `${NOMINATIM}?format=json&addressdetails=1&countrycodes=us` +
    `&limit=${limit}&q=${encodeURIComponent(query)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const raw = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (raw.length < MIN_QUERY || raw.length > MAX_QUERY) {
    return NextResponse.json(
      { error: `Query must be between ${MIN_QUERY} and ${MAX_QUERY} characters` },
      { status: 400 }
    )
  }

  const limitParam = Number(new URL(request.url).searchParams.get('limit'))
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const key = `${raw.toLowerCase()}|${limit}`
  const cached = cacheGet(key)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, max-age=3600', 'X-Geocode-Cache': 'hit' },
    })
  }

  // Nominatim returns an EMPTY array when the query contains an apartment or
  // unit designator ("Apt 4B", "#1402", "Suite 200") — verified against the
  // live service, and the original cause of "only the bare ZIP works". So the
  // unit-stripped form goes first; it also tends to be more precise, because a
  // full "...Apt 200..." string often matches a coarse city centroid instead
  // of the street. The bare ZIP is a last resort so a search is never empty.
  const zip = extractZip(raw)
  const candidates = Array.from(
    new Set([stripUnit(raw), raw, zip].filter((c): c is string => !!c && c.length >= MIN_QUERY))
  )

  try {
    let places: NominatimPlace[] = []
    for (const candidate of candidates) {
      places = await askNominatim(candidate, limit)
      if (places.length > 0) break
    }

    const results = places
      .map(toResult)
      .filter((r): r is GeocodeResult => r !== null)
      .slice(0, limit)

    // Empty results are cached too — otherwise every keystroke of a
    // known-unresolvable prefix re-runs the whole candidate chain.
    cacheSet(key, results)

    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'private, max-age=3600', 'X-Geocode-Cache': 'miss' },
    })
  } catch (err) {
    console.error('Geocode proxy error:', err)
    return NextResponse.json({ error: 'Geocoding service unavailable' }, { status: 502 })
  }
}
