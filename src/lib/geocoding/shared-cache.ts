import { supabaseAdmin } from '@/lib/supabase'
import type { GeocodeProviderId, GeocodeSuggestion } from '@/types/geocode'
import { MAX_SHARED_CACHE_TTL_MS, MEMORY_CACHE_TTL_MS } from './constants'

/**
 * Level 2 of the cache: a Supabase table, shared across serverless instances
 * and across users.
 *
 * The in-memory cache is per-lambda, so on Vercel it is cold far more often
 * than it looks: a popular address gets re-fetched once per instance, every
 * deploy, forever. This table is what turns "a query someone already ran" into
 * a 20-40 ms lookup instead of a paid upstream call.
 *
 * Two rules, both non-negotiable:
 *
 *  1. **Never throw.** Every entry point swallows its errors and returns
 *     null/void. A cache is an optimisation, and taking the address search down
 *     because a cache table is unreachable would turn a minor outage into a
 *     total one.
 *  2. **Respect the provider's retention limit.** `expires_at` is a LICENCE
 *     term, not a tuning knob — Google forbids retaining anything but a place
 *     id beyond 30 days, and Mapbox requires the permanent endpoint for
 *     storage. `ttlFor()` is the only place that decision is made, and
 *     `tests/unit/geocoding-cache.test.ts` asserts a Google payload can never
 *     be handed a longer expiry.
 */

export type CacheMode = 'autocomplete' | 'details' | 'reverse'

/** Never longer than the provider permits, never longer than we need. */
export function ttlFor(provider: GeocodeProviderId): number {
  return Math.min(MEMORY_CACHE_TTL_MS, MAX_SHARED_CACHE_TTL_MS[provider])
}

export async function sharedGet(key: string): Promise<GeocodeSuggestion[] | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('geocode_cache')
      .select('payload, expires_at')
      .eq('cache_key', key)
      .maybeSingle()

    if (error || !data) return null
    if (new Date(data.expires_at).getTime() <= Date.now()) return null
    return Array.isArray(data.payload) ? (data.payload as GeocodeSuggestion[]) : null
  } catch {
    return null
  }
}

export async function sharedSet(
  key: string,
  provider: GeocodeProviderId,
  mode: CacheMode,
  payload: GeocodeSuggestion[]
): Promise<void> {
  try {
    await supabaseAdmin.from('geocode_cache').upsert(
      {
        cache_key: key,
        provider,
        mode,
        payload,
        expires_at: new Date(Date.now() + ttlFor(provider)).toISOString(),
      },
      { onConflict: 'cache_key' }
    )
  } catch {
    // Deliberately silent. See rule 1 above.
  }
}

/**
 * Drops expired rows. Called from the existing keep-alive cron rather than
 * getting a schedule of its own — the table is small and the cron already runs.
 */
export async function purgeExpired(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('geocode_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('cache_key')

    if (error) return 0
    return data?.length ?? 0
  } catch {
    return 0
  }
}
