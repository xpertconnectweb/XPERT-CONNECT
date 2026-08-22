import { useEffect, useState } from 'react'

/**
 * Trailing debounce.
 *
 * Extracted from the copy that lived inside `MapView`; it now has several call
 * sites with genuinely different clocks (geocoder vs map viewport).
 *
 * Note for tests: `tests/setup.ts` replaces the global `setTimeout` with a 0 ms
 * version, so anything asserting debounce timing must call `vi.useFakeTimers()`
 * explicitly rather than relying on real delays.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
