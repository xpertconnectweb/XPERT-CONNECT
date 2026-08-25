'use client'

import { useCallback, useRef, useState } from 'react'
import type { GeocodeResult } from '@/types/geocode'

/**
 * "What is at these coordinates?", for the draggable home pin.
 *
 * Imperative rather than reactive: this runs in response to a drop, not to a
 * value changing, and a `useEffect` keyed on the position would also fire on
 * every programmatic move — a search, a geolocate, a shared link — spending an
 * upstream call to re-derive a label we already had.
 *
 * Requests are sequenced by a token rather than aborted. Nominatim is paced at
 * one call a second server-side, so two quick drags queue behind each other and
 * the first can resolve after the second; without the token the stale answer
 * wins and the card names the wrong building.
 */
export interface ReverseGeocodeState {
  loading: boolean
  error: boolean
}

export function useReverseGeocode() {
  const [state, setState] = useState<ReverseGeocodeState>({ loading: false, error: false })
  const tokenRef = useRef(0)

  const lookup = useCallback(
    async (lat: number, lng: number): Promise<GeocodeResult | null> => {
      const token = ++tokenRef.current
      setState({ loading: true, error: false })
      try {
        const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`)
        if (!res.ok) throw new Error(`Reverse lookup failed: ${res.status}`)
        const results: GeocodeResult[] = await res.json()
        // A later drag has already started; its answer is the current one.
        if (token !== tokenRef.current) return null
        setState({ loading: false, error: false })
        return results[0] ?? null
      } catch {
        if (token !== tokenRef.current) return null
        // Not fatal. The pin is where the user put it either way; only the
        // label is unknown, and the caller says so rather than lying.
        setState({ loading: false, error: true })
        return null
      }
    },
    []
  )

  return { ...state, lookup }
}
