import type { GeocodeProviderId } from '@/types/geocode'

/**
 * Every tunable the geocoding stack has, in one place.
 *
 * The point of the file is `MIN_GEOCODE_QUERY`. It used to be written three
 * times — `useSmartSearch` activated at 2 characters, `useGeocoder` defaulted to
 * 3, and the route rejected below 3 — so typing two characters produced a
 * "Places" group that could never contain anything, and the user got a silent
 * gap with no explanation. One constant, imported by all three.
 */

/** Below this the providers return noise, and Google/Mapbox charge for it. */
export const MIN_GEOCODE_QUERY = 3
export const MAX_GEOCODE_QUERY = 200

export const DEFAULT_LIMIT = 8
export const MAX_LIMIT = 10

export const UPSTREAM_TIMEOUT_MS = 8000

/** Nominatim asks for no more than one request per second. */
export const MIN_UPSTREAM_INTERVAL_MS = 1000

/** Coordinates are stable; a day is conservative. */
export const MEMORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const MEMORY_CACHE_MAX_ENTRIES = 500

/**
 * The longest a provider's payload may be retained. This is a LICENCE clause
 * expressed as a number, not a performance knob — do not raise it to make the
 * cache hit rate look better.
 *
 *  - Google: place ids may be stored indefinitely, but any other content
 *    (coordinates included) must be deleted within 30 days.
 *  - Mapbox: temporary geocoding results are cache-only; storing them beyond
 *    that requires the `permanent=true` endpoint, which is billed separately.
 *  - Nominatim: ODbL, storage permitted with attribution.
 *  - Geoapify: built on OpenAddresses and OSM, both of which permit storage
 *    with attribution, so caching is unrestricted. The 30 days here is not a
 *    licence ceiling but a freshness one — addresses change, and a cache older
 *    than a month stops being an optimisation and starts being stale data.
 */
export const MAX_SHARED_CACHE_TTL_MS: Record<GeocodeProviderId, number> = {
  nominatim: 30 * 24 * 60 * 60 * 1000,
  geoapify: 30 * 24 * 60 * 60 * 1000,
  mapbox: 30 * 24 * 60 * 60 * 1000,
  google: 30 * 24 * 60 * 60 * 1000,
  // No licence to cap it. The data is the county registers themselves and
  // this cache sits in front of our own database, so the only thing that
  // expires an entry is a quarterly re-ingest.
  selfhosted: 365 * 24 * 60 * 60 * 1000,
}

/**
 * Per-user quotas, counted ONLY on a provider miss.
 *
 * A cache hit costs nothing, so charging quota for one would let a popular
 * query lock a user out for no reason. See `rate-limit.ts`.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 300
export const RATE_LIMITS = {
  autocomplete: 60,
  details: 20,
  reverse: 60,
} as const

/** A session that has been idle this long is a new search, and a new token. */
export const SESSION_MAX_IDLE_MS = 3 * 60 * 1000

/**
 * Credit that a provider's licence requires to be VISIBLE next to its results.
 *
 * A licence term, not a nicety. Geoapify's free plan permits commercial use on
 * the explicit condition that the attribution is shown, and OSM's ODbL requires
 * the same — so removing one of these lines is a licence breach that nothing
 * will ever flag at runtime.
 *
 * It lives in this file rather than beside the provider registry because the
 * search box needs it, and `lib/geocoding/index.ts` pulls in every adapter and
 * their `process.env` reads. Importing that from a client component would ship
 * server code to the browser. Everything here is a plain constant.
 *
 * Google and Mapbox are absent on purpose: their paid terms require a logo
 * treatment rather than a text line, and neither is switched on.
 */
export const ATTRIBUTION: Partial<Record<GeocodeProviderId, string>> = {
  geoapify: 'Powered by Geoapify',
  nominatim: '© OpenStreetMap contributors',
  // Self-hosting the registers does not remove the licence term that came
  // with them: Manatee County publishes under CC BY 4.0 and it is not alone.
  // Attribution is the one obligation that survives dropping the provider.
  selfhosted: 'Datos de los registros oficiales de direcciones de los condados (OpenAddresses)',
}
