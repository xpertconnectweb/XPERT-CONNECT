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
}

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
 */
export function findNumber(payload: Buffer, number: number | null): NumberMatch {
  const { count, baseLat, baseLng, numbersAt } = readHeader(payload)

  let at = numbersAt
  let running = 0
  let exactAt = -1

  // The bracketing pair, tracked as the scan goes: the last number below the
  // target and the first one above it.
  let belowAt = -1
  let belowNumber = 0
  let aboveAt = -1
  let aboveNumber = 0

  for (let i = 0; i < count; i++) {
    const read = readVarint(payload, at)
    running += read[0]
    at = read[1]

    if (number === null) continue
    if (running === number) {
      exactAt = i
      break
    }
    if (running < number) {
      belowAt = i
      belowNumber = running
    } else {
      aboveAt = i
      aboveNumber = running
      break
    }
  }

  // The scan stops early on a hit, so skip whatever it did not read: the
  // coordinate columns start immediately after the last varint.
  if (exactAt !== -1 || aboveAt !== -1) {
    const read = (exactAt !== -1 ? exactAt : aboveAt) + 1
    for (let i = read; i < count; i++) at = readVarint(payload, at)[1]
  }

  const latAt = at
  const lngAt = at + count * 2
  const latOf = (i: number) => baseLat + payload.readUInt16LE(latAt + i * 2) / OFFSET_SCALE
  const lngOf = (i: number) => baseLng + payload.readUInt16LE(lngAt + i * 2) / OFFSET_SCALE

  if (exactAt !== -1) {
    return { lat: latOf(exactAt), lng: lngOf(exactAt), kind: 'exact' }
  }

  // Both neighbours present: place the number proportionally between them. This
  // is how every commercial geocoder fills a gap, and it is worth being honest
  // that it is a guess -- hence the separate `interpolated` label, which the UI
  // already treats as "approximate, drag the pin to correct it".
  if (belowAt !== -1 && aboveAt !== -1 && number !== null && aboveNumber !== belowNumber) {
    const t = (number - belowNumber) / (aboveNumber - belowNumber)
    const lat0 = latOf(belowAt)
    const lng0 = lngOf(belowAt)
    return {
      lat: lat0 + (latOf(aboveAt) - lat0) * t,
      lng: lng0 + (lngOf(aboveAt) - lng0) * t,
      kind: 'interpolated',
    }
  }

  // Off the end of the block, or no number given: the middle of the run. Not
  // the average of the coordinates, which a long road with a dense cluster at
  // one end would drag into that cluster.
  const middle = count >> 1
  return { lat: latOf(middle), lng: lngOf(middle), kind: 'street' }
}
