import type {
  GeocodeProviderId,
  GeocodeResult,
  GeocodeSuggestion,
} from '@/types/geocode'

/**
 * The seam that makes the provider a configuration value.
 *
 * Written this way because the fix the client actually needs — an address like
 * "862 62nd St Cir E, Bradenton, FL" resolving at all — is not a code change,
 * it is a data-coverage change. OpenStreetMap does not have that street, and no
 * amount of query normalisation invents it. So the useful thing to build is not
 * a better parser but a switch, plus enough test coverage that throwing it is
 * boring.
 *
 * Follows the shape of `src/lib/sms/base.ts`: config that returns null rather
 * than throwing when the environment is missing, a result union instead of
 * exceptions, and an `AbortController` on every upstream call.
 */

export interface GeocodeContext {
  /**
   * Two-letter state code from the session, read SERVER-SIDE. The client never
   * sends it, so this adds no leak surface.
   */
  state?: string | null
  /**
   * The map's current centre, already quantised by the caller. Coarse on
   * purpose: it is a bias, and it becomes part of the cache key, so full
   * precision here would give every viewport its own cache entry.
   */
  proximity?: { lat: number; lng: number; zoom: number } | null
  /** Derived server-side from the caller's opaque `sid`; never the raw value. */
  sessionToken?: string | null
  /**
   * The result is going to be STORED, not just displayed.
   *
   * A licence clause encoded in the type: Mapbox switches to the `permanent=true`
   * endpoint, and Google flags that only the place id may outlive 30 days.
   * Set by the backfill and by the admin write path, never by the search box.
   */
  permanent?: boolean
  limit: number
  signal?: AbortSignal
}

export type ProviderFailure =
  | { ok: false; kind: 'config' }
  | { ok: false; kind: 'upstream'; status?: number }
  | { ok: false; kind: 'timeout' }
  | { ok: false; kind: 'rate_limited' }
  | { ok: false; kind: 'bad_id' }

export type ProviderResult<T> = { ok: true; value: T } | ProviderFailure

export interface GeocodeProvider {
  readonly id: GeocodeProviderId

  /**
   * True when `autocomplete()` returns rows without coordinates and a
   * `details()` round trip is required before the map can move.
   */
  readonly needsDetails: boolean

  /**
   * True when an empty response is NOT authoritative and the chain should try
   * the fallback provider.
   *
   * Only Nominatim sets this. If Google cannot find an address, Nominatim
   * certainly cannot either, and asking it would just add latency to a result
   * that is already correct: "no such address".
   */
  readonly fallbackOnEmpty: boolean

  /** False when the API key is absent. Fail closed, like `twilioConfig()`. */
  configured(): boolean

  /**
   * Whether THIS empty answer was an answer, overriding `fallbackOnEmpty`.
   *
   * `fallbackOnEmpty` is a property of a provider; this is a property of a
   * query, and the self-hosted engine needs both. It holds the county register
   * for Manatee, so its silence about a Bradenton address means the address does
   * not exist. It holds nothing at all for Houston County, Minnesota, which
   * publishes no register, so its silence there means only that it does not
   * know.
   *
   * Without the distinction, asking for "9999999 Nowhere Rd, Bradenton, FL"
   * fell through to Geoapify, which answered "1014 Baytree Road" and called it
   * rooftop — a confident wrong pin on a different street, which is the exact
   * failure this engine was built to stop producing.
   *
   * Optional: a provider that does not implement it keeps `fallbackOnEmpty`
   * unchanged, and only the self-hosted adapter has anything to say here.
   */
  answersEmptyAuthoritatively?(query: string, ctx: GeocodeContext): Promise<boolean>

  autocomplete(query: string, ctx: GeocodeContext): Promise<ProviderResult<GeocodeSuggestion[]>>
  details(id: string, ctx: GeocodeContext): Promise<ProviderResult<GeocodeResult | null>>
  reverse(lat: number, lng: number, ctx: GeocodeContext): Promise<ProviderResult<GeocodeResult | null>>
}

/**
 * Guards the resolve round trip against a provider switch.
 *
 * A suggestion id is meaningless to a provider that did not issue it, and the
 * failure is silent rather than loud: Google would simply 404 a Mapbox id, but
 * a numeric Nominatim id could plausibly resolve to a real, wrong place. The
 * dropdown returns `providerId` alongside each row and the client sends it
 * back, so a stale tab open across a deployment gets a clean 400 instead.
 */
export function providerMatches(
  requested: string | null,
  active: GeocodeProviderId
): boolean {
  return requested === null || requested === active
}
