'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useDebounce } from './useDebounce'
import { MIN_GEOCODE_QUERY, SESSION_MAX_IDLE_MS } from '@/lib/geocoding/constants'
import { formatProximity, quantizeProximity } from '@/lib/geocoding/bias'
import type { GeocodeResult, GeocodeSuggestion } from '@/types/geocode'

/**
 * Address lookup for the search box, via `/api/geocode`.
 *
 * Improvements over the version that lived inline in `MapView`:
 *
 *  - A real `AbortController`. The old code set a `cancelled` flag, which
 *    stopped the result being *used* but let up to three sequential requests
 *    run to completion after the user had already moved on.
 *  - A module-level result cache, so backspacing through a query is instant
 *    and free. Empty results are cached too — without that, every keystroke of
 *    a known-unresolvable prefix re-ran the whole thing.
 *  - The candidate fallback chain lives on the server, so a lookup costs one
 *    round trip instead of up to three.
 *
 * Two things arrived with the provider adapter layer:
 *
 *  - A `status` beyond loading/error. "No results" and "not enough characters"
 *    used to be indistinguishable from "working", which is how the dropdown
 *    ended up silently rendering nothing and leaving users to retype a
 *    perfectly good address.
 *  - A session id. Google and Mapbox bill autocomplete per SESSION, not per
 *    keystroke, and the token is what groups them. Without it every character
 *    typed is its own billable session.
 */

export type GeocodeStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'error' | 'rate_limited'

export interface ProximityHint {
  lat: number
  lng: number
  zoom: number
}

const CACHE_MAX = 100
const cache = new Map<string, GeocodeSuggestion[]>()

function cacheGet(key: string): GeocodeSuggestion[] | undefined {
  const hit = cache.get(key)
  if (hit === undefined) return undefined
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

function cacheSet(key: string, value: GeocodeSuggestion[]): void {
  cache.set(key, value)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/** Exposed for tests; there is no other reason to clear it. */
export function __clearGeocodeCache(): void {
  cache.clear()
}

function proximityParam(hint: ProximityHint | null | undefined): string | null {
  if (!hint) return null
  if (!Number.isFinite(hint.lat) || !Number.isFinite(hint.lng) || !Number.isFinite(hint.zoom)) {
    return null
  }
  return formatProximity(quantizeProximity(hint.lat, hint.lng, hint.zoom))
}

function buildUrl(
  query: string,
  limit: number,
  prox: string | null,
  sid: string | null,
  state: string | null
): string {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  if (prox) params.set('prox', prox)
  if (sid) params.set('sid', sid)
  if (state) params.set('state', state)
  return `/api/geocode?${params}`
}

/**
 * Resolves one suggestion to coordinates.
 *
 * A no-op round trip for Nominatim, which hands back geometry with every row —
 * hence the `needsResolve` short circuit. For Google and Mapbox it is the one
 * billable call in the session, which is also why the session id is sent here:
 * it closes the session and makes the preceding keystrokes free.
 */
export async function resolveSuggestion(
  suggestion: GeocodeSuggestion,
  sid?: string | null
): Promise<GeocodeResult | null> {
  if (!suggestion.needsResolve && suggestion.lat !== null && suggestion.lng !== null) {
    return suggestion as GeocodeResult
  }

  const params = new URLSearchParams({ id: suggestion.id, provider: suggestion.providerId })
  if (sid) params.set('sid', sid)

  try {
    const res = await fetch(`/api/geocode?${params}`)
    if (!res.ok) return null
    const results: GeocodeSuggestion[] = await res.json()
    const first = Array.isArray(results) ? results[0] : null
    if (!first || first.lat === null || first.lng === null) return null
    return first as GeocodeResult
  } catch {
    return null
  }
}

/**
 * One-shot lookup with no React, no debounce and no hook rules.
 *
 * Exists for the `?near=<address>` deep link, which needs a single answer at
 * mount rather than a live subscription. It replaced a SECOND `useGeocoder`
 * instance in `MapView` that existed only to serve that one case and sat idle
 * for the rest of the session, along with the `autoSelectRef` dance that
 * fished the first result out of it.
 *
 * The `?near=` contract has links in circulation and two E2E specs; this
 * preserves it exactly.
 */
export async function resolveOnce(
  query: string,
  options: { limit?: number; proximity?: ProximityHint | null; state?: string | null } = {}
): Promise<GeocodeResult | null> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_GEOCODE_QUERY) return null

  const limit = options.limit ?? 1
  const prox = proximityParam(options.proximity)

  try {
    const res = await fetch(buildUrl(trimmed, limit, prox, null, options.state ?? null))
    if (!res.ok) return null
    const results: GeocodeSuggestion[] = await res.json()
    const first = Array.isArray(results) ? results[0] : null
    if (!first) return null
    return resolveSuggestion(first, null)
  } catch {
    return null
  }
}

export interface UseGeocoderOptions {
  minLength?: number
  delayMs?: number
  limit?: number
  /** Set false to stop lookups entirely, e.g. once a location is chosen. */
  enabled?: boolean
  /** The map's current view, so the provider ranks nearby answers first. */
  proximity?: ProximityHint | null
  /**
   * Which state this search is FOR, when the page knows and the session does not.
   *
   * The referral form is the case. A referrer belongs to no clinic and no firm,
   * and picks Florida or Minnesota from two cards before typing anything. That
   * choice never reached the geocoder, so the self-hosted engine — where the
   * state is a hard filter — searched both, and a Bradenton address could come
   * back as a street in Minnesota.
   *
   * The server validates it and lets the session win wherever there is one, so
   * this can only narrow a search the caller could already make over public
   * register data.
   */
  state?: string | null
}

export interface UseGeocoderState {
  results: GeocodeSuggestion[]
  loading: boolean
  error: boolean
  status: GeocodeStatus
}

export interface UseGeocoderApi extends UseGeocoderState {
  /** Turns a chosen row into coordinates, closing the billing session. */
  resolve: (suggestion: GeocodeSuggestion) => Promise<GeocodeResult | null>
  /** Starts a new billing session. Call when the box is cleared. */
  resetSession: () => void
}

export function useGeocoder(
  query: string,
  {
    minLength = MIN_GEOCODE_QUERY,
    delayMs = 350,
    limit = 6,
    enabled = true,
    proximity = null,
    // Renamed on the way in: `state` is already this hook's own React state,
    // and shadowing it compiles into a URL containing "[object Object]".
    state: searchState = null,
  }: UseGeocoderOptions = {}
): UseGeocoderApi {
  const debounced = useDebounce(query, delayMs)
  const [state, setState] = useState<UseGeocoderState>({
    results: [],
    loading: false,
    error: false,
    status: 'idle',
  })
  const abortRef = useRef<AbortController | null>(null)

  /**
   * The session lives in a ref, not in state, and that is load-bearing: state
   * would put it in the effect's dependency array, so every rotation would
   * re-trigger the lookup, and every keystroke would re-render for a value
   * nothing renders.
   */
  const sessionRef = useRef<{ id: string; startedAt: number } | null>(null)

  const sessionId = useCallback((): string => {
    const now = Date.now()
    const current = sessionRef.current
    if (!current || now - current.startedAt > SESSION_MAX_IDLE_MS) {
      sessionRef.current = { id: uuidv4(), startedAt: now }
      return sessionRef.current.id
    }
    current.startedAt = now
    return current.id
  }, [])

  const resetSession = useCallback(() => {
    sessionRef.current = null
  }, [])

  const resolve = useCallback(
    async (suggestion: GeocodeSuggestion): Promise<GeocodeResult | null> => {
      const sid = sessionRef.current?.id ?? null
      const result = await resolveSuggestion(suggestion, sid)
      // A resolution ends the session whether or not it succeeded; the next
      // keystroke starts a new one.
      sessionRef.current = null
      return result
    },
    []
  )

  const prox = proximityParam(proximity)

  useEffect(() => {
    const trimmed = debounced.trim()

    if (!enabled) {
      abortRef.current?.abort()
      setState({ results: [], loading: false, error: false, status: 'idle' })
      return
    }

    if (trimmed.length < minLength) {
      abortRef.current?.abort()
      // 'idle' rather than 'empty': the user has not asked a question yet, and
      // saying "no match" for two characters is a lie that makes people retype.
      setState({ results: [], loading: false, error: false, status: 'idle' })
      return
    }

    // The bias changes the answer, so it has to change the key too.
    // The bias changes the answer, so it has to change the key. So does the
    // state, which is a hard filter in the self-hosted engine.
    const key = `${trimmed.toLowerCase()}|${limit}|${prox ?? '-'}|${searchState ?? '-'}`
    const cached = cacheGet(key)
    if (cached) {
      setState({
        results: cached,
        loading: false,
        error: false,
        status: cached.length > 0 ? 'ok' : 'empty',
      })
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState((prev) => ({ ...prev, loading: true, error: false, status: 'loading' }))

    fetch(buildUrl(trimmed, limit, prox, sessionId(), searchState), { signal: controller.signal })
      .then((res) => {
        if (res.ok) return res.json()
        return Promise.reject(Object.assign(new Error(String(res.status)), { status: res.status }))
      })
      .then((results: GeocodeSuggestion[]) => {
        const safe = Array.isArray(results) ? results : []
        cacheSet(key, safe)
        setState({
          results: safe,
          loading: false,
          error: false,
          status: safe.length > 0 ? 'ok' : 'empty',
        })
      })
      .catch((err: unknown) => {
        // An abort is the expected outcome of typing another character.
        if (err instanceof DOMException && err.name === 'AbortError') return
        const status = (err as { status?: number })?.status
        setState({
          results: [],
          loading: false,
          error: true,
          status: status === 429 ? 'rate_limited' : 'error',
        })
      })

    return () => controller.abort()
  }, [debounced, enabled, minLength, limit, prox, searchState, sessionId])

  return { ...state, resolve, resetSession }
}
