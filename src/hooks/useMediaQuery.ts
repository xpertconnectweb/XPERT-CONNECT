'use client'

import { useEffect, useState } from 'react'

/**
 * Subscribes to a CSS media query.
 *
 * Only safe in components that never render on the server, because the first
 * client render would otherwise disagree with the server's guess. The map is
 * loaded via `dynamic({ ssr: false })`, so there is no server render to
 * disagree with.
 *
 * Use CSS for anything that is purely presentational; reach for this only when
 * the two breakpoints need genuinely different markup, which no media query
 * can express.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const list = window.matchMedia(query)
    setMatches(list.matches)

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
