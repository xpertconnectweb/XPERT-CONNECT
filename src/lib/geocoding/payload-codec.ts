/**
 * Packs a street's address points into one compact blob.
 *
 * The whole storage plan rests on this file. Florida and Minnesota together are
 * roughly twenty million address points; one Postgres row each would run to
 * several gigabytes and Supabase's free plan stops at 500 MB. Grouped by street
 * and packed here they are about five bytes apiece, which is what makes the
 * index fit at all.
 *
 * Server-only, since it uses `Buffer`. Nothing in the browser bundle may import
 * it.
 *
 * -- Layout (version 1) ------------------------------------------------------
 *
 *   u8       version
 *   i32LE    originLat        minimum latitude  x 1e7
 *   i32LE    originLng        minimum longitude x 1e7
 *   varint   count
 *   varint x count            house numbers, delta-coded, ascending
 *   u16LE x count             latitude  offsets from the origin, x 1e5
 *   u16LE x count             longitude offsets from the origin, x 1e5
 *
 * Two choices look arbitrary and neither is:
 *
 * **Columnar, not interleaved.** Each column holds near-identical values, so
 * TOAST compression finds far more to remove than it would in a repeating
 * number/lat/lng record. It also means resolving a house number touches only
 * the first third of the blob.
 *
 * **Offsets from the minimum, unsigned.** Anchoring at the corner instead of
 * the centre makes every offset non-negative, which buys a u16 where an i16
 * would otherwise be needed: the same two bytes covering 0.65535 degrees rather
 * than 0.32768, about 72 km of latitude. At a scale of 1e-5 the quantisation
 * error is at most 1.1 m against a 50 m accuracy target -- two percent of the
 * budget, and finer than the county registers themselves are.
 */
import { haversineDistance } from '../map/geo'

/** Degrees per unit of the offset scale. 1e-5 degrees is about 1.11 m of latitude. */
const OFFSET_SCALE = 1e5
/** Degrees per unit of the origin scale. Finer, because it is stored once per street. */
const ORIGIN_SCALE = 1e7
/** The largest offset a u16 holds: 65535 x 1e-5 = 0.65535 degrees. */
const MAX_OFFSET = 0xffff

export const PAYLOAD_VERSION = 1

export interface StreetPoint {
  /** House number. Any non-numeric suffix is resolved by the caller. */
  number: number
  lat: number
  lng: number
}

/**
 * Thrown when a group of points spans further than a u16 offset reaches.
 *
 * Not a defect to swallow: it means the grouping key put a 72 km stretch of
 * road into one row, and the fix is to split the group rather than widen the
 * field. The indexer catches this and splits.
 */
export class PayloadSpanError extends Error {
  constructor(readonly spanDegrees: number) {
    super(
      `street spans ${spanDegrees.toFixed(4)} degrees, beyond the ` +
        `${(MAX_OFFSET / OFFSET_SCALE).toFixed(5)} a u16 offset reaches`
    )
    this.name = 'PayloadSpanError'
  }
}

function varintSize(value: number): number {
  let size = 1
  let v = value
  while (v >= 0x80) {
    v = Math.floor(v / 0x80)
    size++
  }
  return size
}

function writeVarint(buffer: Buffer, offset: number, value: number): number {
  let v = value
  let at = offset
  while (v >= 0x80) {
    buffer[at++] = (v % 0x80) + 0x80
    v = Math.floor(v / 0x80)
  }
  buffer[at++] = v
  return at
}

/** Returns the value and the offset just past it. */
function readVarint(buffer: Buffer, offset: number): [number, number] {
  let value = 0
  let scale = 1
  let at = offset
  for (;;) {
    const byte = buffer[at++]
    value += (byte & 0x7f) * scale
    if ((byte & 0x80) === 0) return [value, at]
    scale *= 0x80
  }
}

/**
 * Encodes a street's points into a blob.
 *
 * Sorts and de-duplicates by house number. Two points sharing a number are the
 * same building -- a duplex the county recorded as 123A and 123B, or a parcel
 * exported twice -- and they sit metres apart, far inside the accuracy target.
 * The first one wins.
 */
export function encodePoints(points: readonly StreetPoint[]): Buffer {
  if (points.length === 0) throw new Error('encodePoints: nothing to encode')

  const sorted = points.slice().sort((a, b) => a.number - b.number)

  const unique: StreetPoint[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i].number !== sorted[i - 1].number) unique.push(sorted[i])
  }

  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (let i = 0; i < unique.length; i++) {
    const p = unique[i]
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }

  const span = Math.max(maxLat - minLat, maxLng - minLng)
  if (span > MAX_OFFSET / OFFSET_SCALE) throw new PayloadSpanError(span)

  // Rounded down, so that no offset can come out negative afterwards: rounding
  // to nearest can land the origin above the true minimum.
  const originLat = Math.floor(minLat * ORIGIN_SCALE)
  const originLng = Math.floor(minLng * ORIGIN_SCALE)
  const baseLat = originLat / ORIGIN_SCALE
  const baseLng = originLng / ORIGIN_SCALE

  const count = unique.length
  let numbersBytes = 0
  let previous = 0
  for (let i = 0; i < count; i++) {
    numbersBytes += varintSize(unique[i].number - previous)
    previous = unique[i].number
  }

  const buffer = Buffer.allocUnsafe(1 + 4 + 4 + varintSize(count) + numbersBytes + count * 4)

  let at = 0
  buffer[at++] = PAYLOAD_VERSION
  buffer.writeInt32LE(originLat, at)
  at += 4
  buffer.writeInt32LE(originLng, at)
  at += 4
  at = writeVarint(buffer, at, count)

  previous = 0
  for (let i = 0; i < count; i++) {
    at = writeVarint(buffer, at, unique[i].number - previous)
    previous = unique[i].number
  }

  for (let i = 0; i < count; i++) {
    buffer.writeUInt16LE(Math.round((unique[i].lat - baseLat) * OFFSET_SCALE), at)
    at += 2
  }
  for (let i = 0; i < count; i++) {
    buffer.writeUInt16LE(Math.round((unique[i].lng - baseLng) * OFFSET_SCALE), at)
    at += 2
  }

  return buffer
}

interface Header {
  count: number
  baseLat: number
  baseLng: number
  /** Byte offset at which the delta-coded numbers begin. */
  numbersAt: number
}

function readHeader(payload: Buffer): Header {
  const version = payload[0]
  if (version !== PAYLOAD_VERSION) {
    throw new Error(`payload version ${version}, expected ${PAYLOAD_VERSION}`)
  }

  const baseLat = payload.readInt32LE(1) / ORIGIN_SCALE
  const baseLng = payload.readInt32LE(5) / ORIGIN_SCALE
  const [count, numbersAt] = readVarint(payload, 9)
  return { count, baseLat, baseLng, numbersAt }
}

/** How many points a blob holds, without decoding any of them. */
export function countPoints(payload: Buffer): number {
  return readHeader(payload).count
}

export function decodePoints(payload: Buffer): StreetPoint[] {
  const { count, baseLat, baseLng, numbersAt } = readHeader(payload)

  const numbers = new Array<number>(count)
  let at = numbersAt
  let running = 0
  for (let i = 0; i < count; i++) {
    const read = readVarint(payload, at)
    running += read[0]
    numbers[i] = running
    at = read[1]
  }

  const latAt = at
  const lngAt = at + count * 2

  const points = new Array<StreetPoint>(count)
  for (let i = 0; i < count; i++) {
    points[i] = {
      number: numbers[i],
      lat: baseLat + payload.readUInt16LE(latAt + i * 2) / OFFSET_SCALE,
      lng: baseLng + payload.readUInt16LE(lngAt + i * 2) / OFFSET_SCALE,
    }
  }
  return points
}

/**
 * A 32-bit FNV-1a hash of a payload and the name published alongside it.
 *
 * Stored on the street row so a re-ingest can tell in one integer comparison
 * whether anything about a street actually changed. FNV-1a because it is four
 * lines, has no dependencies, and is being asked to detect accidental
 * difference rather than resist an adversary -- nothing here is a security
 * boundary.
 *
 * Signed, because Postgres has no unsigned integer and `| 0` is exactly the
 * conversion that round-trips through an int4 column.
 */
export function payloadChecksum(payload: Buffer, name: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload[i]
    hash = Math.imul(hash, 0x01000193)
  }
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i) & 0xff
    hash = Math.imul(hash, 0x01000193)
  }
  return hash | 0
}

export interface NumberMatch {
  lat: number
  lng: number
  /**
   * `exact` -- the county register holds this house number.
   * `interpolated` -- it does not, so the point is placed proportionally
   *   between the two recorded neighbours that bracket it.
   * `street` -- the number falls outside the block entirely, or none was given;
   *   the point is the middle of the run.
   */
  kind: 'exact' | 'interpolated' | 'street'
  /**
   * How far apart the two bracketing points are, in metres. `null` unless the
   * answer was interpolated.
   *
   * This is the width of the guess. The caller cannot tell from `interpolated`
   * alone whether the number sits between two doors twenty metres apart or two
   * ends of a block, and those deserve different words in the interface.
   */
  spanM: number | null
  /**
   * Whether the bracketing pair is on the same side of the street as the number
   * being placed -- that is, whether all three share a parity.
   *
   * `null` unless the answer was interpolated. See the note in `findNumber`;
   * this is the single strongest predictor of how wrong an interpolation is.
   */
  sameSide: boolean | null
}

/** Even or odd, and correct for the negative numbers `%` would hand back. */
const parityOf = (n: number) => (((n % 2) + 2) % 2)

/**
 * The project's one distance function, in the unit this file reports.
 *
 * `haversineDistance` answers in miles, which is the sort of mismatch that is
 * silent when you get it wrong -- so the conversion happens here, once, rather
 * than at each call site.
 */
const metresBetween = (lat0: number, lng0: number, lat1: number, lng1: number) =>
  haversineDistance(lat0, lng0, lat1, lng1) * 1609.344

/**
 * Resolves a house number against a blob.
 *
 * Scans the number column rather than binary-searching it. The deltas are
 * variable-width, so a binary search would need a second index for what is, at
 * fifty-odd points per street, a scan of fifty bytes. The columnar layout is
 * what makes that cheap: the numbers are contiguous, and no coordinate is read
 * until one has been chosen.
 *
 * Pass `null` for a street-level answer.
 *
 * -- Why parity decides the bracket -----------------------------------------
 *
 * American streets number one side even and the other odd, so 861 is not
 * between 860 and 862; it is ACROSS THE ROAD from both. Bracketing it with its
 * two numeric neighbours therefore lands it in the middle of the carriageway,
 * and on a wide road with setbacks that is most of the error there is.
 *
 * Measured by leave-one-out over the county registers themselves -- take a
 * recorded door out, interpolate it back from its neighbours, compare against
 * where the county put it (`scripts/geo/gate-interpolation.ts`):
 *
 *                       same side      across the road
 *   Manatee, FL            3.2 m              46.4 m
 *   Hennepin, MN           0.6 m              58.2 m
 *   Aitkin, MN             1.9 m              13.1 m
 *   Wakulla, FL            0.7 m               0.7 m
 *
 * A factor of fifty to a hundred in the built-up counties, and the mistake was
 * invisible because the answer still looked like a street address. Wakulla is
 * flat because rural addressing runs up one side of a county road rather than
 * splitting by parity -- which is also why the fallback below is a fallback and
 * not an error: where no same-side pair exists, the mixed one is all there is,
 * and where parity is not in use it is just as good.
 */
export function findNumber(payload: Buffer, number: number | null): NumberMatch {
  const { count, baseLat, baseLng, numbersAt } = readHeader(payload)
  const wanted = number === null ? -1 : parityOf(number)

  let at = numbersAt
  let running = 0
  let exactAt = -1
  let scanned = 0

  // The nearest recorded number below the target and above it, tracked twice:
  // once for any neighbour, and once for a neighbour on the target's own side
  // of the street. The second is preferred and the first is the fallback.
  let belowAt = -1
  let belowNumber = 0
  let aboveAt = -1
  let aboveNumber = 0
  let sideBelowAt = -1
  let sideBelowNumber = 0
  let sideAboveAt = -1
  let sideAboveNumber = 0

  for (let i = 0; i < count; i++) {
    const read = readVarint(payload, at)
    running += read[0]
    at = read[1]
    scanned = i + 1

    if (number === null) continue
    if (running === number) {
      exactAt = i
      break
    }

    const sameSide = parityOf(running) === wanted

    if (running < number) {
      belowAt = i
      belowNumber = running
      if (sameSide) {
        sideBelowAt = i
        sideBelowNumber = running
      }
    } else {
      if (aboveAt === -1) {
        aboveAt = i
        aboveNumber = running
      }
      // Unlike the old scan, a number above the target is not the end of the
      // search: if it is on the wrong side we keep reading for one that is not.
      // In practice that is a single extra varint, since sides alternate.
      if (sameSide) {
        sideAboveAt = i
        sideAboveNumber = running
        break
      }
    }
  }

  // Skip whatever the scan did not read: the coordinate columns start
  // immediately after the last varint, so the cursor has to get there.
  for (let i = scanned; i < count; i++) at = readVarint(payload, at)[1]

  const latAt = at
  const lngAt = at + count * 2
  const latOf = (i: number) => baseLat + payload.readUInt16LE(latAt + i * 2) / OFFSET_SCALE
  const lngOf = (i: number) => baseLng + payload.readUInt16LE(lngAt + i * 2) / OFFSET_SCALE

  if (exactAt !== -1) {
    return { lat: latOf(exactAt), lng: lngOf(exactAt), kind: 'exact', spanM: null, sameSide: null }
  }

  // Prefer the pair that shares the target's parity, and fall back to the
  // numeric neighbours when the register has no such pair -- a one-sided
  // street, or a rural road numbered straight through.
  const sided = sideBelowAt !== -1 && sideAboveAt !== -1 && sideAboveNumber !== sideBelowNumber
  const loAt = sided ? sideBelowAt : belowAt
  const hiAt = sided ? sideAboveAt : aboveAt
  const loNumber = sided ? sideBelowNumber : belowNumber
  const hiNumber = sided ? sideAboveNumber : aboveNumber

  // Both neighbours present: place the number proportionally between them. This
  // is how every commercial geocoder fills a gap, and it is worth being honest
  // that it is a guess -- hence the separate `interpolated` label, which the UI
  // already treats as "approximate, drag the pin to correct it".
  if (loAt !== -1 && hiAt !== -1 && number !== null && hiNumber !== loNumber) {
    const t = (number - loNumber) / (hiNumber - loNumber)
    const lat0 = latOf(loAt)
    const lng0 = lngOf(loAt)
    const lat1 = latOf(hiAt)
    const lng1 = lngOf(hiAt)
    return {
      lat: lat0 + (lat1 - lat0) * t,
      lng: lng0 + (lng1 - lng0) * t,
      kind: 'interpolated',
      spanM: metresBetween(lat0, lng0, lat1, lng1),
      sameSide: sided,
    }
  }

  // Off the end of the block, or no number given: the middle of the run. Not
  // the average of the coordinates, which a long road with a dense cluster at
  // one end would drag into that cluster.
  const middle = count >> 1
  return { lat: latOf(middle), lng: lngOf(middle), kind: 'street', spanM: null, sameSide: null }
}

/** The nearest recorded door to a coordinate, for reverse geocoding. */
export interface NearestPoint {
  number: number
  lat: number
  lng: number
  /** Metres from the queried coordinate. */
  distanceM: number
}

/**
 * The closest address point in a street's blob to an arbitrary coordinate.
 *
 * The reverse of `findNumber`, and the primitive reverse geocoding is built on:
 * given where the pin was dropped, which door is it on?
 *
 * -- Two passes, and why ----------------------------------------------------
 *
 * The scan compares SQUARED planar distance in a locally-scaled degree space,
 * and only the winner is converted to metres. A street with four hundred doors
 * must not pay four hundred haversines -- each is two square roots and six
 * trigonometric calls -- to answer a question that only needs an ordering, and
 * squared distance orders identically to distance.
 *
 * Planar is safe here for the same reason it is safe in the SQL: over the few
 * hundred metres a street spans, the error against a great-circle distance is
 * submetric, and it is used only to pick a winner. The number that leaves this
 * function is a real haversine.
 *
 * The longitude scaling is not optional. At Minneapolis's latitude a degree of
 * longitude is 0.7 of a degree of latitude, so comparing raw degree differences
 * would treat a point 100 m east as nearer than one 80 m north.
 *
 * Note it reads the coordinate columns and never touches the numbers until it
 * has a winner -- which is the columnar layout paying for itself in the other
 * direction from `findNumber`, where the numbers are read and the coordinates
 * are not.
 */
export function nearestPoint(payload: Buffer, lat: number, lng: number): NearestPoint {
  const { count, baseLat, baseLng, numbersAt } = readHeader(payload)

  // Skip the number column to reach the coordinates. Variable-width deltas, so
  // there is no arithmetic shortcut -- but this reads no numbers, it only walks
  // past them.
  let at = numbersAt
  for (let i = 0; i < count; i++) at = readVarint(payload, at)[1]

  const latAt = at
  const lngAt = at + count * 2
  const lngScale = Math.cos((lat * Math.PI) / 180)

  let bestAt = 0
  let best = Infinity

  for (let i = 0; i < count; i++) {
    const dLat = baseLat + payload.readUInt16LE(latAt + i * 2) / OFFSET_SCALE - lat
    const dLng = (baseLng + payload.readUInt16LE(lngAt + i * 2) / OFFSET_SCALE - lng) * lngScale
    const d2 = dLat * dLat + dLng * dLng
    if (d2 < best) {
      best = d2
      bestAt = i
    }
  }

  // Only now is the number column worth reading, and only up to the winner.
  let number = 0
  let numberAt = numbersAt
  for (let i = 0; i <= bestAt; i++) {
    const read = readVarint(payload, numberAt)
    number += read[0]
    numberAt = read[1]
  }

  const bestLat = baseLat + payload.readUInt16LE(latAt + bestAt * 2) / OFFSET_SCALE
  const bestLng = baseLng + payload.readUInt16LE(lngAt + bestAt * 2) / OFFSET_SCALE

  return {
    number,
    lat: bestLat,
    lng: bestLng,
    distanceM: metresBetween(lat, lng, bestLat, bestLng),
  }
}
