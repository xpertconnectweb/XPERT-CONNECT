import { REVERSE_CELL_DEGREES } from './constants'

/**
 * The grid reverse geocoding looks streets up in.
 *
 * Reverse geocoding asks the opposite question to everything else here: not
 * "where is this address" but "what is at this point". There is no name to
 * match on, so the trigram index is no help at all, and scanning 567,767 rows
 * for the nearest one is not a thing to do per pin drag.
 *
 * -- Why coverage and not centroids ------------------------------------------
 *
 * The obvious design is to store each street's centroid cell and read the 3x3
 * neighbourhood around the query. It is cheaper, it is one generated column,
 * and it is wrong.
 *
 * A row of `geo_street` is a BOX, not a point. Most are a block long, but the
 * widest one percent run 8-11 km across -- the streets whose source published
 * neither a city nor a postcode, so every segment of "County Road 12" in the
 * county got grouped into one row. A box that size has a centroid kilometres
 * from the end of it you are standing on.
 *
 * Measured against a brute-force scan of all 567,767 rows, on 60 sampled
 * coordinates:
 *
 *   scheme      cell     neighbourhood   nearest street found   candidates
 *   centroid    0.01     3x3                     76.7%              125
 *   centroid    0.01     5x5                     90.0%              311
 *   centroid    0.02     5x5                     98.3%            1,113
 *   coverage    0.01     3x3                    100.0%              165
 *
 * A geocoder that names the wrong street on a quarter of drags is not
 * shippable, and widening the neighbourhood costs more candidates than doing it
 * properly does. So a street is indexed in EVERY cell its box touches: 1,941,305
 * (street, cell) pairs, 3.4 per street.
 *
 * -- Where these run ---------------------------------------------------------
 *
 * `cellsCovering` mirrors the `generate_series` in `geo_rebuild_cells`, and
 * `cellRange` mirrors the bounds `geo_street_nearby` reads. The two sides MUST
 * agree: a disagreement does not fail, it quietly reads the wrong
 * neighbourhood and answers with whatever street happens to be there. That is
 * why `REVERSE_CELL_DEGREES` is a pinned constant rather than a literal, and
 * why the in-memory mirror uses this file instead of its own copy.
 */

export interface Cell {
  lat: number
  lng: number
}

/**
 * The cell a coordinate falls in.
 *
 * `Math.floor` and not rounding, so a cell owns the half-open range
 * `[n * size, (n + 1) * size)` and no coordinate belongs to two of them.
 * Postgres `floor()` agrees, including on negatives -- which matters, because
 * every longitude in this index is negative.
 */
export function cellOf(lat: number, lng: number): Cell {
  return {
    lat: Math.floor(lat / REVERSE_CELL_DEGREES),
    lng: Math.floor(lng / REVERSE_CELL_DEGREES),
  }
}

/**
 * Every cell a bounding box touches, which is where its street gets indexed.
 *
 * Inclusive at both ends: a box straddling a cell boundary belongs to the cells
 * on both sides of it, which is the whole point of covering.
 */
export function cellsCovering(
  latMin: number,
  latMax: number,
  lngMin: number,
  lngMax: number
): Cell[] {
  const lo = cellOf(latMin, lngMin)
  const hi = cellOf(latMax, lngMax)

  const cells: Cell[] = []
  for (let lat = lo.lat; lat <= hi.lat; lat++) {
    for (let lng = lo.lng; lng <= hi.lng; lng++) cells.push({ lat, lng })
  }
  return cells
}

/**
 * The cell bounds to read for a query, as inclusive integer ranges.
 *
 * `radiusDeg` is in degrees of LATITUDE and is widened for longitude by
 * `1 / cos(lat)`, because a degree of longitude is shorter than a degree of
 * latitude everywhere but the equator -- 0.73 of one in Minneapolis. Reading a
 * square of cells in raw degrees would search a third less ground east-west
 * than north-south, and the streets missed would be missed silently.
 */
export function cellRange(
  lat: number,
  lng: number,
  radiusDeg: number
): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  // Clamped so a coordinate near a pole cannot divide by nearly zero and ask
  // for every cell on the planet. Nothing in Florida or Minnesota comes close,
  // which is exactly why it would go unnoticed if it ever did.
  const lngRadius = radiusDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180))

  const lo = cellOf(lat - radiusDeg, lng - lngRadius)
  const hi = cellOf(lat + radiusDeg, lng + lngRadius)
  return { latMin: lo.lat, latMax: hi.lat, lngMin: lo.lng, lngMax: hi.lng }
}

/**
 * Squared planar distance from a point to a bounding box, in degrees, with
 * longitude scaled so the two axes are comparable.
 *
 * Zero inside the box. Squared and planar because it only ever orders and cuts
 * a candidate list -- the metres a caller sees are always recomputed with
 * `haversineDistance` on the winning point. This mirrors the ORDER BY in
 * `geo_street_nearby` and exists so the in-memory store cuts the same
 * candidates the database does.
 */
export function boxDistanceSq(
  lat: number,
  lng: number,
  latMin: number,
  latMax: number,
  lngMin: number,
  lngMax: number
): number {
  const dLat = lat < latMin ? latMin - lat : lat > latMax ? lat - latMax : 0
  const dLngRaw = lng < lngMin ? lngMin - lng : lng > lngMax ? lng - lngMax : 0
  const dLng = dLngRaw * Math.cos((lat * Math.PI) / 180)
  return dLat * dLat + dLng * dLng
}
