import type { GeocodeSuggestion } from '@/types/geocode'
import { MEMORY_CACHE_MAX_ENTRIES, MEMORY_CACHE_TTL_MS } from './constants'

/**
 * Level 1 of the cache: per-instance, in memory, no network.
 *
 * Kept in its own module — deliberately separate from the Supabase-backed
 * `shared-cache` — because the two have to be mockable independently.
 * `tests/api/geocode.test.ts` stubs the global `fetch`, and `supabase-js` uses
 * that same global, so a shared-cache read inside the route would consume
 * `fetchMock.mock.calls[0]` and break every assertion that indexes into it.
 * The tests mock the shared cache and leave this one real, which is also what
 * keeps the existing `describe('caching')` cases meaningful.
 *
 * This is what makes backspacing through a query free, and it is why empty
 * results are cached too: without that, every keystroke of a known-unresolvable
 * prefix re-runs the whole provider chain.
 */

interface Entry {
  at: number
  value: GeocodeSuggestion[]
}

const cache = new Map<string, Entry>()

export function memoryGet(key: string): GeocodeSuggestion[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > MEMORY_CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  // Refresh recency so the eviction below is LRU rather than insertion-order.
  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

export function memorySet(key: string, value: GeocodeSuggestion[]): void {
  cache.set(key, { at: Date.now(), value })
  while (cache.size > MEMORY_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/** Exposed for tests; there is no other reason to clear it. */
export function __clearMemoryCache(): void {
  cache.clear()
}
