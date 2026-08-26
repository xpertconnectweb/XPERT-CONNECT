import type { GeocodeProviderId, GeocodeResult, GeocodeSuggestion } from '@/types/geocode'
import { geoapifyProvider } from './geoapify'
import { googleProvider } from './google'
import { mapboxProvider } from './mapbox'
import { nominatimProvider } from './nominatim'
import type {
  GeocodeContext,
  GeocodeProvider,
  ProviderFailure,
  ProviderResult,
} from './types'

/**
 * Which provider answers, and what happens when it cannot.
 *
 * The whole point of the adapter layer lives in this file: switching from
 * OpenStreetMap to a provider that actually has US residential address
 * coverage should be one environment variable, reviewed in one line, and
 * reversible in the time it takes to redeploy.
 */

const PROVIDERS: Record<GeocodeProviderId, GeocodeProvider> = {
  nominatim: nominatimProvider,
  geoapify: geoapifyProvider,
  mapbox: mapboxProvider,
  google: googleProvider,
}

function isProviderId(value: string | undefined): value is GeocodeProviderId {
  return value !== undefined && Object.prototype.hasOwnProperty.call(PROVIDERS, value)
}

/** So a misconfigured deploy logs once, not once per keystroke. */
const warned = new Set<string>()
function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`[geocoding] ${message}`)
}

/**
 * Resolves `GEOCODER_PROVIDER`.
 *
 * An absent or unrecognised value falls back to Nominatim with a warning, and
 * never throws. A typo in an environment variable must not take address search
 * down — and it is also what lets the existing test suite run untouched, since
 * `tests/setup.ts` sets no geocoding variables at all.
 */
export function getProvider(): GeocodeProvider {
  const configured = process.env.GEOCODER_PROVIDER?.trim().toLowerCase()

  if (!configured) return PROVIDERS.nominatim
  if (!isProviderId(configured)) {
    warnOnce(`Unknown GEOCODER_PROVIDER "${configured}"; falling back to nominatim.`)
    return PROVIDERS.nominatim
  }

  const provider = PROVIDERS[configured]
  if (!provider.configured()) {
    warnOnce(`GEOCODER_PROVIDER is "${configured}" but its API key is missing; using nominatim.`)
    return PROVIDERS.nominatim
  }
  return provider
}

export function getFallbackProvider(primary: GeocodeProvider): GeocodeProvider | null {
  const configured = process.env.GEOCODER_FALLBACK?.trim().toLowerCase() ?? 'nominatim'
  if (!isProviderId(configured)) return null
  const fallback = PROVIDERS[configured]
  if (fallback.id === primary.id) return null
  return fallback.configured() ? fallback : null
}

export function getProviderById(id: GeocodeProviderId): GeocodeProvider {
  return PROVIDERS[id]
}

/** A failure the fallback provider might be able to answer instead. */
function isRecoverable(result: ProviderResult<unknown>): boolean {
  return !result.ok && (result.kind === 'config' || result.kind === 'upstream')
}

export interface ChainOutcome {
  suggestions: GeocodeSuggestion[]
  provider: GeocodeProviderId
  /**
   * Set when both providers failed, so the route can pick a status code.
   *
   * `ProviderFailure`, not `ProviderResult<never>`: the latter still carries the
   * `{ ok: true }` arm, so reading `.kind` off it does not compile — which is
   * the right complaint. A failure that might be a success is not a failure.
   */
  failure: ProviderFailure | null
}

/**
 * Asks the configured provider, and the fallback only when that is useful.
 *
 * The "only when useful" is the interesting half. An empty result from a paid
 * provider is an ANSWER — Google saying it has never heard of an address means
 * OpenStreetMap has not either, and asking it anyway adds a second of latency
 * to confirm something already known. Nominatim is the exception, because its
 * silence genuinely carries no information, and that asymmetry is what
 * `fallbackOnEmpty` encodes.
 */
export async function autocompleteChain(
  query: string,
  ctx: GeocodeContext
): Promise<ChainOutcome> {
  const primary = getProvider()
  const first = await primary.autocomplete(query, ctx)

  if (first.ok && (first.value.length > 0 || !primary.fallbackOnEmpty)) {
    return { suggestions: first.value, provider: primary.id, failure: null }
  }

  const fallback = getFallbackProvider(primary)
  if (!fallback) {
    return first.ok
      ? { suggestions: first.value, provider: primary.id, failure: null }
      : { suggestions: [], provider: primary.id, failure: first }
  }

  if (!first.ok && !isRecoverable(first)) {
    return { suggestions: [], provider: primary.id, failure: first }
  }

  const second = await fallback.autocomplete(query, ctx)
  if (second.ok) {
    return { suggestions: second.value, provider: fallback.id, failure: null }
  }

  // Both failed. Report the primary's failure: it is the one an operator can
  // act on, and the fallback failing is usually a symptom of the same outage.
  return {
    suggestions: [],
    provider: primary.id,
    failure: first.ok ? second : first,
  }
}

export type { GeocodeContext, GeocodeProvider, ProviderResult }
export type { GeocodeResult, GeocodeSuggestion }
