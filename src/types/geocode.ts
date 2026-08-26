/**
 * Shape returned by `/api/geocode`.
 *
 * A deliberately narrow view of whichever geocoding provider is configured. It
 * replaced a `GeocodeSuggestion` type that carried only
 * `{ display_name, lat, lon }`, which was too thin to group or label
 * suggestions, or to pick a sensible zoom level for a result.
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
 *
 * DO NOT add fields here. `tests/api/geocode.test.ts` asserts this object with
 * `toEqual`, so a new key fails that test — deliberately. This is the shape the
 * wire contract promises, and widening it silently would let provider-specific
 * extras leak into a response three routes already treat as sanitised. County
 * and provider metadata live on `ResolvedAddress` in the component layer.
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

export type GeocodeProviderId = 'nominatim' | 'geoapify' | 'mapbox' | 'google' | 'selfhosted'

/**
 * How sure we are that the point is the building the user meant.
 *
 * This is the field that lets the UI stop pretending. A ZIP centroid and a
 * rooftop hit used to be rendered identically, so a user searching a client's
 * home could be handed the middle of a postcode and have no way to tell — which
 * is exactly how "the nearest clinic" ends up being the wrong clinic.
 *
 * Ordered loosely best to worst; `precisionRank()` in `lib/geocoding/precision`
 * is the only place that ordering is encoded.
 */
export type GeocodePrecision =
  | 'rooftop'
  | 'parcel'
  | 'interpolated'
  | 'street'
  | 'city'
  | 'zip'
  | 'region'
  | 'unknown'

/**
 * One row of the address dropdown.
 *
 * `lat`/`lng` are nullable because Google and Mapbox deliberately withhold
 * geometry from autocomplete: their billing model is N cheap suggestions plus
 * ONE chargeable resolution when the user actually picks something. Nominatim
 * has no such split and fills them in straight away, which is why
 * `needsResolve` exists rather than a blanket "always call details".
 *
 * They stay at the TOP LEVEL rather than nested under a `position` object
 * because that is the wire shape `tests/api/geocode.test.ts:82-88` pins, and
 * there are deployed clients reading it.
 */
export interface GeocodeSuggestion {
  /**
   * The provider's own id for this suggestion, unprefixed.
   *
   * Paired with `providerId` rather than carrying a `provider:` prefix, because
   * this value is the wire contract `tests/api/geocode.test.ts:83` pins and
   * there are deployed clients reading it. The resolve round trip sends both,
   * and the route rejects a mismatch — so a suggestion issued by one provider
   * can never be resolved against another after a provider switch.
   */
  id: string
  /** Short display form. Built from `address` when the upstream gave one. */
  label: string
  /** The full upstream label, for a tooltip or secondary line. */
  fullLabel: string
  /** Structured components, when the upstream provided them. */
  address: GeocodeAddress | null
  /**
   * County, when the provider names one.
   *
   * Lives here rather than inside `GeocodeAddress` because that object is
   * pinned with `toEqual` by `tests/api/geocode.test.ts:90`, and because a
   * county is not part of a postal address — the app uses it for the county
   * facet, which is a filter, not something anyone writes on an envelope.
   */
  county: string | null
  /** Drives the icon and the zoom level a selection lands on. */
  kind: GeocodeKind
  /** Drives whether the UI tells the user to drag the pin. */
  precision: GeocodePrecision
  providerId: GeocodeProviderId
  /** The provider's own id, unprefixed — what gets stored on a record. */
  placeId: string | null
  /** null until resolved; see `needsResolve`. */
  lat: number | null
  lng: number | null
  /** `[south, north, west, east]`, when the upstream provided one. */
  bbox: [number, number, number, number] | null
  /** True when `lat`/`lng` still need a `details()` round trip. */
  needsResolve: boolean
}

/**
 * A suggestion that has coordinates.
 *
 * Everything downstream of selection — `applyPlace`, the draggable pin, reverse
 * lookup, anything written to the database — takes this, so the "did we resolve
 * it yet" question is answered by the type system once instead of by a
 * non-null assertion at each call site.
 */
export interface GeocodeResult extends GeocodeSuggestion {
  lat: number
  lng: number
  needsResolve: false
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

/** Narrows a suggestion once its coordinates are known. */
export function isResolved(s: GeocodeSuggestion): s is GeocodeResult {
  return typeof s.lat === 'number' && typeof s.lng === 'number' && !s.needsResolve
}

/**
 * What a form hands to the server once someone has chosen an address.
 *
 * Flat rather than nested, because it maps one-to-one onto the columns
 * `2026-08-structured-addresses.sql` adds — and the point of that migration is
 * that the app stops re-deriving city, state and ZIP with a regex on every
 * single read.
 *
 * `provider` travels with `placeId` for the same reason the database keeps
 * `place_provider` beside `place_id`: an id is meaningless to a provider that
 * did not issue it, and the failure mode is silence rather than an error.
 */
export interface ResolvedAddress {
  /** The one-line form, written to `clinics.address` / `client_address`. */
  formatted: string
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  county: string | null
  lat: number
  lng: number
  placeId: string | null
  provider: GeocodeProviderId
  precision: GeocodePrecision
}

/** Flattens a resolved suggestion into the form the database stores. */
export function toResolvedAddress(result: GeocodeResult): ResolvedAddress {
  return {
    formatted: result.fullLabel || result.label,
    street: result.address?.street ?? null,
    city: result.address?.city ?? null,
    state: result.address?.state ?? null,
    zip: result.address?.postcode ?? null,
    county: result.county,
    lat: result.lat,
    lng: result.lng,
    placeId: result.placeId,
    provider: result.providerId,
    precision: result.precision,
  }
}
