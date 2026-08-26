import type { GeocodeContext } from './types'

/**
 * Telling the provider where to look first.
 *
 * Before this, the only geographic hint the proxy sent was `countrycodes=us` —
 * so "main st" was ranked against every Main Street in the United States, and
 * `session.user.state` sat unused even though `/api/professionals/clinics`
 * had been filtering on it for months. This is the cheapest relevance win in
 * the stack.
 *
 * Two sources, in precedence order:
 *
 *  1. The map viewport, when the user is looking at something. Sent by the
 *     client, and NOT a privacy regression: it goes to our own origin, and it
 *     describes where the user is looking rather than where anyone lives.
 *  2. The session's state, read server-side. The client sends nothing.
 *
 * Every one of these is a SOFT bias. None of them may become a hard filter:
 * a lawyer in Florida referring a client who moved to Georgia must still be
 * able to find the address. That is why Mapbox gets `proximity` and never
 * `bbox`, and Google gets `locationBias` and never `locationRestriction` —
 * in both providers the other option silently hides legitimate results.
 */

/**
 * `[south, north, west, east]`, matching `GeocodeResult.bbox`.
 *
 * Only the states in `VALID_STATES` (src/lib/validation.ts) are listed, because
 * only those can appear on a session. Add a row when a state is onboarded; an
 * unknown code simply means no bias, never an error.
 */
const STATE_BBOX: Record<string, [number, number, number, number]> = {
  FL: [24.4, 31.1, -87.7, -79.9],
  MN: [43.4, 49.4, -97.3, -89.4],
}

/**
 * Coarse on purpose.
 *
 * The bias is part of the cache key, so full-precision coordinates would give
 * every pixel of pan its own cache entry and the shared cache would never hit.
 * One decimal place is ~11 km and two zoom levels is one visual step — far
 * finer than the bias actually needs to be useful.
 */
export function quantizeProximity(
  lat: number,
  lng: number,
  zoom: number
): { lat: number; lng: number; zoom: number } {
  return {
    lat: Math.round(lat * 10) / 10,
    lng: Math.round(lng * 10) / 10,
    zoom: Math.round(zoom / 2) * 2,
  }
}

/** Serialises for the `prox` query parameter. */
export function formatProximity(p: { lat: number; lng: number; zoom: number }): string {
  return `${p.lat},${p.lng},${p.zoom}`
}

/**
 * Parses `prox=lat,lng,zoom` from the client.
 *
 * Anything malformed returns null rather than a 400: the bias is an
 * optimisation, and refusing the whole search because a hint was garbled would
 * turn a cosmetic bug into an outage.
 */
export function parseProximity(raw: string | null): { lat: number; lng: number; zoom: number } | null {
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length !== 3) return null
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  const zoom = Number(parts[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (zoom < 0 || zoom > 22) return null
  return quantizeProximity(lat, lng, zoom)
}

/** The bias component of a cache key. Low cardinality by construction. */
export function biasKey(ctx: GeocodeContext): string {
  if (ctx.proximity) return `p${formatProximity(ctx.proximity)}`
  if (ctx.state && STATE_BBOX[ctx.state]) return `s${ctx.state}`
  return '-'
}

/**
 * Roughly how much ground the viewport covers, as a circle radius in metres.
 *
 * Google caps `locationBias.circle.radius` at 50 km, so this is clamped there;
 * a wider view just falls back to the state box.
 */
function radiusForZoom(zoom: number): number {
  // Web Mercator: each zoom level halves the ground covered. z12 ≈ 10 km across
  // on a typical viewport, which is the scale a city search wants.
  const metres = 40_000_000 / Math.pow(2, zoom)
  return Math.min(50_000, Math.max(1_000, Math.round(metres)))
}

/* ── Nominatim ─────────────────────────────────────────────────────────── */

/**
 * `viewbox=west,north,east,south` — and note the ordering, which is neither
 * the bbox order used elsewhere in this codebase nor Leaflet's.
 *
 * Always paired with `bounded=0` by the caller, which is what keeps it a
 * preference rather than a filter.
 */
export function nominatimViewbox(ctx: GeocodeContext): string | null {
  if (ctx.proximity) {
    const { lat, lng, zoom } = ctx.proximity
    const span = radiusForZoom(zoom) / 111_000
    const lngSpan = span / Math.max(0.01, Math.cos((lat * Math.PI) / 180))
    return `${lng - lngSpan},${lat + span},${lng + lngSpan},${lat - span}`
  }
  const box = ctx.state ? STATE_BBOX[ctx.state] : undefined
  if (!box) return null
  const [south, north, west, east] = box
  return `${west},${north},${east},${south}`
}

/* ── Mapbox ────────────────────────────────────────────────────────────── */

/** `proximity=lng,lat`. Longitude first, as everywhere in Mapbox. */
export function mapboxProximity(ctx: GeocodeContext): string | null {
  if (ctx.proximity) return `${ctx.proximity.lng},${ctx.proximity.lat}`
  const box = ctx.state ? STATE_BBOX[ctx.state] : undefined
  if (!box) return null
  const [south, north, west, east] = box
  return `${(west + east) / 2},${(south + north) / 2}`
}

/* ── Google ────────────────────────────────────────────────────────────── */

export type GoogleLocationBias =
  | { circle: { center: { latitude: number; longitude: number }; radius: number } }
  | {
      rectangle: {
        low: { latitude: number; longitude: number }
        high: { latitude: number; longitude: number }
      }
    }

export function googleLocationBias(ctx: GeocodeContext): GoogleLocationBias | null {
  if (ctx.proximity) {
    return {
      circle: {
        center: { latitude: ctx.proximity.lat, longitude: ctx.proximity.lng },
        radius: radiusForZoom(ctx.proximity.zoom),
      },
    }
  }
  const box = ctx.state ? STATE_BBOX[ctx.state] : undefined
  if (!box) return null
  const [south, north, west, east] = box
  return {
    rectangle: {
      low: { latitude: south, longitude: west },
      high: { latitude: north, longitude: east },
    },
  }
}
