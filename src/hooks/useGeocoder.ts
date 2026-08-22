'use client'

import { useEffect, useRef, useState } from 'react'
import { useDebounce } from './useDebounce'
import type { GeocodeResult } from '@/types/geocode'

/**
 * Address lookup for the map search box, via `/api/geocode`.
 *
 * Improvements over the version that lived inline in `MapView`:
 *
 *  - A real `AbortController`. The old code set a `cancelled` flag, which
 *    stopped the result being *used* but let up to three sequential requests
 *    run to completion after the user had already moved on.
 *  - A module-level result cache, so backspacing through a query is instant
 *    and free. Empty results are cached too — without that, every keystroke of
 *    a known-unresolvable prefix re-ran the whole thing.
 *  - The candidate fallback chain now lives on the server, so a lookup costs
 *    one round trip instead of up to three.
 */

const CACHE_MAX = 100
const cache = new Map<string, GeocodeResult[]>()

function cacheGet(key: string): GeocodeResult[] | undefined {
  const hit = cache.get(key)
  if (hit === undefined) return undefined
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

function cacheSet(key: string, value: GeocodeResult[]): void {
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

export interface UseGeocoderOptions {
  minLength?: number
  delayMs?: number
  limit?: number
  /** Set false to stop lookups entirely, e.g. once a location is chosen. */
  enabled?: boolean
}

export interface UseGeocoderState {
  results: GeocodeResult[]
  loading: boolean
  error: boolean
}

export function useGeocoder(
  query: string,
  { minLength = 3, delayMs = 350, limit = 6, enabled = true }: UseGeocoderOptions = {}
): UseGeocoderState {
  const debounced = useDebounce(query, delayMs)
  const [state, setState] = useState<UseGeocoderState>({
    results: [],
    loading: false,
    error: false,
  })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const trimmed = debounced.trim()

    if (!enabled || trimmed.length < minLength) {
      abortRef.current?.abort()
      setState({ results: [], loading: false, error: false })
      return
    }

    const key = `${trimmed.toLowerCase()}|${limit}`
    const cached = cacheGet(key)
    if (cached) {
      setState({ results: cached, loading: false, error: false })
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState((prev) => ({ ...prev, loading: true, error: false }))

    fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}&limit=${limit}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((results: GeocodeResult[]) => {
        const safe = Array.isArray(results) ? results : []
        cacheSet(key, safe)
        setState({ results: safe, loading: false, error: false })
      })
      .catch((err: unknown) => {
        // An abort is the expected outcome of typing another character.
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({ results: [], loading: false, error: true })
      })

    return () => controller.abort()
  }, [debounced, enabled, minLength, limit])

  return state
}
