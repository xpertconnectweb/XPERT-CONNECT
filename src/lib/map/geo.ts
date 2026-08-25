export const US_DEFAULT_CENTER: [number, number] = [39.8, -89.5]
export const US_DEFAULT_ZOOM = 5

export const STATE_MAP_CONFIG: Record<string, { center: [number, number]; zoom: number }> = {
  FL: { center: [27.8, -83.5], zoom: 7 },
  MN: { center: [46.0, -94.5], zoom: 7 },
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Converts a geocoder bounding box to Leaflet's corner form.
 *
 * The two disagree in a way that is easy to get wrong and silent when you do:
 * `GeocodeResult.bbox` is `[south, north, west, east]` — two latitudes then two
 * longitudes — while Leaflet wants `[[south, west], [north, east]]`, two
 * corners. Feeding one to the other lands you in the Atlantic without an error.
 */
export function toLatLngBounds(
  bbox: readonly [number, number, number, number]
): [[number, number], [number, number]] {
  const [south, north, west, east] = bbox
  return [
    [south, west],
    [north, east],
  ]
}

/**
 * The corners of a circle of `radiusMiles` around a point.
 *
 * Used to frame the map on the radius the user just chose. A degree of latitude
 * is ~69 miles everywhere; a degree of longitude shrinks with the cosine of the
 * latitude, which at Minnesota's 47°N is already a 32% difference — ignoring it
 * would leave the circle visibly clipped east and west.
 */
export function radiusBounds(
  center: readonly [number, number],
  radiusMiles: number
): [[number, number], [number, number]] {
  const [lat, lng] = center
  const latSpan = radiusMiles / 69
  const lngSpan = radiusMiles / (69 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)))
  return [
    [lat - latSpan, lng - lngSpan],
    [lat + latSpan, lng + lngSpan],
  ]
}

/** Whether the viewer asked for less motion. Safe to call during render. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}
