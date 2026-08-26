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
 * How far apart the two bracketing doors may be before an interpolated answer
 * stops being worth the word.
 *
 * Measured, not chosen. `scripts/geo/gate-interpolation.ts` takes a door the
 * county recorded, re-encodes the street without it, asks the shipped
 * `findNumber` to put it back, and compares against the register -- 171,000
 * trials across six counties picked to span dense city grid and rural county
 * road. Share landing within the 50 m this project already calls "the right
 * building":
 *
 *                        <= 100 m apart     100-200 m apart
 *   Manatee, FL              98.2-99.8%          77.4%
 *   Miami-Dade, FL           97.1-99.6%          88.3%
 *   Orange, FL               95.9-99.1%          76.6%
 *   Hennepin, MN             98.2-99.5%          83.6%
 *   Wakulla, FL              98.1-100%           97.7%
 *   Aitkin, MN               97.9-100%           97.2%
 *
 * 100 m is the widest band that clears 95% in EVERY county rather than on
 * average -- a bar set on Miami would be a lie in Aitkin. Past it the median
 * error triples and the tail runs to hundreds of metres, which is a street-level
 * answer wearing a house number.
 *
 * Raising this needs a fresh run of that gate, not an argument.
 */
export const INTERPOLATION_MAX_SPAN_M = 100

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
 *   3 — an address the register says is not there no longer falls through to a
 *       provider that will invent one.
 *   4 — reverse geocoding answers again. An empty self-hosted answer now
 *       reaches the fallback instead of being cached as "nowhere".
 *   5 — the search knows where the caller is. A clinic or firm user is biased
 *       toward its own address, and the state a referrer picked finally reaches
 *       the engine instead of both states being searched at once.
 *   6 — an interpolated address is bracketed by the two doors on ITS OWN side
 *       of the street, instead of by the numeric neighbours across the road,
 *       and a bracket too wide to be placing a door now says so.
 *   7 — reverse geocoding is answered here rather than by Geoapify. Every
 *       stored reverse answer came from a different engine with a different
 *       idea of what `rooftop` means, and a coordinate whose cached answer
 *       still says `rooftop` on a 60 m guess would keep the drag-the-pin
 *       prompt suppressed for another thirty days.
 *
 * Note the direction of travel: to undo a change, bump this AGAIN rather than
 * putting it back. Reverting the number resurrects exactly the answers the
 * revert was meant to retire.
 */
export const GEOCODE_CACHE_REVISION = 7

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

/**
 * The side of one cell in the reverse-geocoding index, in degrees.
 *
 * 0.01 degrees is about 1.1 km of latitude and 0.9 km of longitude in Florida.
 *
 * The number appears in three places -- `geo_rebuild_cells`, `geo_street_nearby`
 * and the TypeScript that works out which cell a query falls in -- and the three
 * MUST agree or the lookup silently reads the wrong neighbourhood and answers
 * with whatever street happens to be there. That is the same hazard that put
 * `SCOPED_TRIGRAM_THRESHOLD` in this file, so it lives here too, with a test
 * pinning the value: changing it is a deliberate act with a migration attached,
 * not an edit.
 *
 * Sized against a measurement, not a guess. A street row is a BOX, not a point,
 * and the widest one percent of them are 8-11 km across -- the streets whose
 * source published neither city nor postcode. Indexing each street by every
 * cell its box touches, and reading the 3x3 neighbourhood of the query, found
 * the truly nearest street in 60 of 60 sampled cases against a brute-force scan
 * of all 567,767 rows. Indexing by the box's CENTROID instead, which is cheaper
 * and was the obvious first design, found it in 46 of 60.
 */
export const REVERSE_CELL_DEGREES = 0.01

/**
 * What a reverse geocode may claim, by how far the nearest recorded door is.
 *
 * All three are measured by `scripts/geo/gate-reverse.ts`, which takes a door
 * the county recorded, moves it N metres, asks the engine what is there, and
 * checks the answer against where it started. 8,000 probes, 13 displacements,
 * 104,000 lookups, stratified into terciles by how many doors lie within 100 m
 * -- because density, not the county line, is what drives the answer: a bar
 * that holds on a Minneapolis block where doors are 10 m apart is a fantasy on
 * a county road where they are 400 m apart, and both exist inside one county.
 *
 * How far the named door strays from the true one, p95:
 *
 *   from      sparse   middling    dense
 *    5 m        1 m       1 m       5 m
 *   10 m        1 m      11 m      17 m
 *   25 m       36 m      44 m      44 m
 *   40 m       64 m      66 m      61 m
 */

/**
 * Within this, the pin is on the building the register names, and the answer
 * may claim `rooftop`.
 *
 * The criterion is NOT "names the exact door". That looked right and broke on
 * the data: even a two-metre displacement recovers the exact door only 97% of
 * the time, because the registers publish co-located records -- the two halves
 * of a duplex, a parcel exported twice -- a metre or so apart. Losing that coin
 * toss is not an error a user could observe, and scoring it as one would set
 * this threshold to zero. The bar is that the named door is within 10 m of the
 * true one: the right building, or the one next to it.
 */
export const REVERSE_ROOFTOP_M = 5

/**
 * Past this the house number comes off the label and only the street is
 * claimed.
 *
 * 25 m is the widest displacement whose named door still lands inside the 50 m
 * this project already calls "the right building" -- in every stratum, not on
 * average.
 *
 * The rule this enforces is that the LABEL AND THE PRECISION MUST AGREE.
 * Answering "you are at 862" when the nearest recorded door is 120 m away is
 * exactly the confident, wrong answer this engine exists to stop producing --
 * and it is what the measurement says happens: past 25 m the p95 stray is 60 m
 * and climbing.
 */
export const REVERSE_NUMBER_M = 25

/**
 * Past this, the index has no register here and the answer is `null` -- which
 * sends the question down the chain to Geoapify rather than guessing.
 *
 * Not a precision threshold but a coverage one. Measured from points a
 * kilometre off a known address, the nearest recorded door is 72 m away at the
 * median and 971 m at the 99th percentile. So a kilometre answers essentially
 * every drag near a real address, and declines in the places where the register
 * genuinely holds nothing -- open water, farmland, and the counties that
 * publish no register at all.
 */
export const REVERSE_COVERAGE_M = 1000

/**
 * How far the reverse cell lookup reaches, in degrees of latitude.
 *
 * Three cells. `REVERSE_COVERAGE_M` decides whether the answer is kept; this
 * decides how much ground is read to find one, and it has to be the wider of
 * the two or the coverage rule would never get the chance to fire.
 */
export const REVERSE_SEARCH_RADIUS_DEG = REVERSE_CELL_DEGREES * 3

/**
 * How many streets the reverse lookup pulls before picking.
 *
 * Twelve, and `gate-reverse.ts` measured with the same number -- a threshold
 * measured against a different candidate set is a threshold measured against
 * nothing. Their blobs come back in ONE request, which is why `payloads` is
 * plural: against the live database, eight blobs in one round trip took 226 ms
 * and one took 218.
 */
export const REVERSE_CANDIDATES = 12
