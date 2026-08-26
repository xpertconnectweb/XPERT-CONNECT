import type { GeocodePrecision } from '@/types/geocode'

/**
 * One table, three providers, one meaning.
 *
 * Every provider describes confidence in its own vocabulary — Nominatim implies
 * it from the OSM tags, Mapbox states it as `coordinates.accuracy`, Google
 * declares it as `location_type` on Geocoding but only hints at it through
 * `types[]` on Places. Mapping them all here rather than at three call sites is
 * what makes "the answer looks the same whichever provider is switched on" a
 * testable claim instead of a hope.
 *
 * The consumer rule is deliberately singular: anything that is not `rooftop` or
 * `parcel` gets "Approximate — drag the pin to correct it". The drag itself has
 * existed since the pin was made draggable; what was missing was ever telling
 * the user when it mattered.
 */

const RANK: Record<GeocodePrecision, number> = {
  rooftop: 0,
  parcel: 1,
  interpolated: 2,
  street: 3,
  city: 4,
  zip: 5,
  region: 6,
  unknown: 7,
}

export function precisionRank(precision: GeocodePrecision): number {
  return RANK[precision] ?? RANK.unknown
}

/**
 * Is this point the building the user meant, or merely near it?
 *
 * The single predicate behind every "approximate" warning in the UI. Keep it
 * here so the threshold cannot drift between the dropdown, the location chip
 * and the admin form.
 */
export function isExactPrecision(precision: GeocodePrecision): boolean {
  return precision === 'rooftop' || precision === 'parcel'
}

/* ── Nominatim ─────────────────────────────────────────────────────────── */

export function nominatimPrecision(
  type: string | undefined,
  cls: string | undefined,
  address: Record<string, string | undefined> | undefined
): GeocodePrecision {
  const a = address ?? {}
  if (type === 'postcode') return 'zip'
  // OSM records a house number either as an address node or on a building
  // polygon. Both put the point on the property, so both are rooftop.
  if (a.house_number) return 'rooftop'
  if (a.road) return 'street'
  if (a.city || a.town || a.village || a.hamlet) return 'city'
  if (cls === 'amenity' || cls === 'shop' || cls === 'office') return 'rooftop'
  if (a.state || a.county) return 'region'
  return 'unknown'
}

/* ── Mapbox ────────────────────────────────────────────────────────────── */

const MAPBOX_ACCURACY: Record<string, GeocodePrecision> = {
  rooftop: 'rooftop',
  parcel: 'parcel',
  point: 'parcel',
  interpolated: 'interpolated',
  intersection: 'interpolated',
  street: 'street',
  approximate: 'city',
}

const MAPBOX_FEATURE_TYPE: Record<string, GeocodePrecision> = {
  address: 'interpolated',
  street: 'street',
  postcode: 'zip',
  place: 'city',
  locality: 'city',
  neighborhood: 'city',
  district: 'region',
  region: 'region',
  country: 'region',
  poi: 'rooftop',
}

/**
 * `accuracy` is the authoritative field and is present on address features;
 * `feature_type` is the fallback for everything coarser, which never carries
 * one.
 */
export function mapboxPrecision(
  accuracy: string | undefined,
  featureType: string | undefined
): GeocodePrecision {
  if (accuracy && MAPBOX_ACCURACY[accuracy]) return MAPBOX_ACCURACY[accuracy]
  if (featureType && MAPBOX_FEATURE_TYPE[featureType]) return MAPBOX_FEATURE_TYPE[featureType]
  return 'unknown'
}

/* ── Google ────────────────────────────────────────────────────────────── */

const GOOGLE_LOCATION_TYPE: Record<string, GeocodePrecision> = {
  ROOFTOP: 'rooftop',
  RANGE_INTERPOLATED: 'interpolated',
  GEOMETRIC_CENTER: 'street',
  APPROXIMATE: 'city',
}

/**
 * Geocoding API only. `location_type` is a direct statement of precision, which
 * is why `reverse()` uses this endpoint rather than Places.
 */
export function googleGeocodingPrecision(locationType: string | undefined): GeocodePrecision {
  if (!locationType) return 'unknown'
  return GOOGLE_LOCATION_TYPE[locationType] ?? 'unknown'
}

/**
 * Places API (New) Details.
 *
 * A documented fidelity gap: Places does NOT return `location_type`, so
 * precision has to be inferred from `types[]`. It is a weaker signal than the
 * Geocoding endpoint gives, and it is the reason `reverse()` deliberately does
 * not go through Places. Erring coarse is the safe direction — a wrongly
 * confident "rooftop" suppresses the drag-the-pin prompt on a point that
 * needed it.
 */
export function googlePlacesPrecision(types: readonly string[] | undefined): GeocodePrecision {
  const t = new Set(types ?? [])
  if (t.has('premise') || t.has('subpremise') || t.has('street_address')) return 'rooftop'
  if (t.has('point_of_interest') || t.has('establishment')) return 'rooftop'
  if (t.has('route') || t.has('intersection')) return 'street'
  if (t.has('postal_code')) return 'zip'
  if (t.has('locality') || t.has('sublocality') || t.has('neighborhood')) return 'city'
  if (
    t.has('administrative_area_level_1') ||
    t.has('administrative_area_level_2') ||
    t.has('country')
  ) {
    return 'region'
  }
  return 'unknown'
}
