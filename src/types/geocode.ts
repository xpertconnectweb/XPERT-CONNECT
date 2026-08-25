/**
 * Shape returned by `/api/geocode`.
 *
 * A deliberately narrow view of Nominatim's response. It replaced a
 * `GeocodeSuggestion` type that carried only `{ display_name, lat, lon }`,
 * which was too thin to group or label suggestions, or to pick a sensible
 * zoom level for a result.
 */
/**
 * The parts of an address a person recognises, kept separate so the UI can
 * render them with different weight instead of showing one long string.
 *
 * This exists because the label used to be the first three comma-separated
 * parts of Nominatim's `display_name`, which for "3200 SW 34th St,
 * Gainesville, FL 32608" produces "3200, Southwest 34th Street, Daysville" —
 * a neighbourhood the user never typed, with the city and ZIP they DID type
 * dropped. The upstream returns all of this structured; it was being thrown
 * away.
 */
export interface GeocodeAddress {
  /** House number and road, e.g. "3200 Southwest 34th Street". */
  street: string | null
  /** City, town, village or hamlet — whichever the upstream used. */
  city: string | null
  /** Two-letter code when derivable, otherwise the full state name. */
  state: string | null
  postcode: string | null
}

export interface GeocodeResult {
  id: string
  /** Short display form. Built from `address` when the upstream gave one. */
  label: string
  /** The full `display_name`, for a tooltip or secondary line. */
  fullLabel: string
  /** Structured components, when the upstream provided them. */
  address: GeocodeAddress | null
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
