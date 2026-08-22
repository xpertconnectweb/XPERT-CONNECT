/**
 * Shape returned by `/api/geocode`.
 *
 * A deliberately narrow view of Nominatim's response — the old
 * `GeocodeSuggestion` in `src/lib/map/types.ts` carried only
 * `{ display_name, lat, lon }`, which was too thin to group or label
 * suggestions, or to pick a sensible zoom level for a result.
 */
export interface GeocodeResult {
  id: string
  /** Short display form, the first few comma-separated parts. */
  label: string
  /** The full `display_name`, for a tooltip or secondary line. */
  fullLabel: string
  lat: number
  lng: number
  /** Drives the icon and the zoom level a selection lands on. */
  kind: GeocodeKind
  /** `[south, north, west, east]`, when the upstream provided one. */
  bbox: [number, number, number, number] | null
}

export type GeocodeKind = 'address' | 'city' | 'zip' | 'poi' | 'region'

/**
 * How far to zoom when a result of each kind is chosen. A ZIP covers far more
 * ground than a street address, and landing at street zoom on a ZIP search
 * hides most of what the user asked for.
 */
export const ZOOM_FOR_KIND: Record<GeocodeKind, number> = {
  address: 15,
  poi: 15,
  zip: 13,
  city: 11,
  region: 9,
}
