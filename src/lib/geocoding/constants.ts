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
/**
 * How similar a stored street name must be to the query for the trigram index
 * to offer it as a candidate.
 *
 * pg_trgm's own default, and deliberately not lowered. Overriding it means
 * either `set_limit()`, which changes the setting for the whole session and
 * would leak across a connection pooler, or a `SET` clause on the search
 * function -- which Supabase refuses outright:
 *
 *   ERROR: 42501: permission denied to set parameter
 *          "pg_trgm.similarity_threshold"
 *
 * So the generosity that a lower threshold would buy is bought a different
 * way, in `geo_street_search`: a query carrying a postcode also matches
 * anything in that postcode down to a far lower bar, because a postcode holds
 * a few hundred streets and can be scanned outright.
 *
 * Declared here so the in-memory index the benchmarks run against uses the
 * same number as the database. A benchmark measuring a different threshold
 * than production measures nothing.
 */
export const TRIGRAM_THRESHOLD = 0.3

/**
 * The same bar, for candidates inside the postcode or city the query named.
 *
 * Far lower, and affordable because it is scoped: a postcode holds a few
 * hundred streets and even a large city holds a few thousand, so the btree on
 * (state, zip) narrows the set before similarity is computed at all. Outside
 * that anchor the same generosity would mean scanning 567,000 rows.
 *
 * This is what buys back what the fixed 0.3 threshold costs. Measured on the
 * platform's own 876 addresses, dropping from 0.24 to 0.3 lost four of them;
 * the scoped branch recovers them, and it is a better rule anyway -- a query
 * that tells you where to look has earned a closer look.
 */
export const SCOPED_TRIGRAM_THRESHOLD = 0.12

/**
 * Bumped whenever a change alters what a given query should answer.
 *
 * Part of every cache key, so bumping it makes every stored answer unreachable
 * at once and they age out on their own. Without it a fix reaches nobody who had
 * already searched that address until the entry expires.
 *
 * That is not hypothetical. Two parser defects were fixed and deployed —
 * "62nd St Cir E" was resolving to a different road, "Bradenton, FL" to a street
 * four postcodes away — and production kept answering with the old results,
 * because the self-hosted cache held them and its TTL was a year. The fix was
 * live and invisible.
 *
 * Bump this for a change in the parser, the ranker, the precision rules, or the
 * shape of a suggestion. Not for a change to the data: a quarterly re-ingest is
 * covered by the TTL below.
 *
 *   2 — ordinals are no longer eaten as house numbers, and a query that names
 *       only a city is no longer answered with a street.
 */
export const GEOCODE_CACHE_REVISION = 2

export const MAX_SHARED_CACHE_TTL_MS: Record<GeocodeProviderId, number> = {
  nominatim: 30 * 24 * 60 * 60 * 1000,
  geoapify: 30 * 24 * 60 * 60 * 1000,
  mapbox: 30 * 24 * 60 * 60 * 1000,
  google: 30 * 24 * 60 * 60 * 1000,
  // Thirty days, like the rest, and NOT the year an earlier version set here.
  // That year was argued from the licence — nobody caps how long our own data
  // may be held — which answered the wrong question. What a cache entry holds
  // also depends on the code that produced it and on an index re-ingested every
  // quarter, and a year of staleness outlives both. GEOCODE_CACHE_REVISION
  // handles a code change at once; this bounds how long a data change can go
  // unnoticed.
  selfhosted: 30 * 24 * 60 * 60 * 1000,
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
