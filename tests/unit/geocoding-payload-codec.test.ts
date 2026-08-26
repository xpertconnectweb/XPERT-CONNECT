import { describe, it, expect } from 'vitest'
import {
  encodePoints,
  decodePoints,
  countPoints,
  findNumber,
  nearestPoint,
  PayloadSpanError,
  PAYLOAD_VERSION,
  type StreetPoint,
} from '@/lib/geocoding/payload-codec'

/**
 * The blob format is the load-bearing part of the self-hosted index: twenty
 * million address points have to fit in a 500 MB database, and every one of
 * them is read back through this file. A silent rounding bug here would move
 * every pin a few metres and nothing else in the system would notice.
 */

/** A block of houses on one side of a street, as a county would record it. */
function block(from: number, to: number, step = 2): StreetPoint[] {
  const points: StreetPoint[] = []
  for (let n = from; n <= to; n += step) {
    points.push({
      number: n,
      lat: 27.49 + (n - from) * 0.00002,
      lng: -82.48 + (n - from) * 0.00001,
    })
  }
  return points
}

/** The codec quantises to 1e-5 degrees, so equality is to within one unit. */
const QUANTUM = 1e-5

describe('payload codec', () => {
  it('round-trips every point to within the quantisation step', () => {
    const points = block(800, 900)
    const decoded = decodePoints(encodePoints(points))

    expect(decoded).toHaveLength(points.length)
    for (let i = 0; i < points.length; i++) {
      expect(decoded[i].number).toBe(points[i].number)
      expect(decoded[i].lat).toBeCloseTo(points[i].lat, 4)
      expect(decoded[i].lng).toBeCloseTo(points[i].lng, 4)
      expect(Math.abs(decoded[i].lat - points[i].lat)).toBeLessThanOrEqual(QUANTUM)
      expect(Math.abs(decoded[i].lng - points[i].lng)).toBeLessThanOrEqual(QUANTUM)
    }
  })

  it('stamps its version, so a later format change is detected rather than misread', () => {
    expect(encodePoints(block(2, 10))[0]).toBe(PAYLOAD_VERSION)

    const payload = encodePoints(block(2, 10))
    payload[0] = 99
    expect(() => decodePoints(payload)).toThrow(/version 99/)
  })

  it('sorts unsorted input', () => {
    const decoded = decodePoints(
      encodePoints([
        { number: 900, lat: 27.5, lng: -82.4 },
        { number: 100, lat: 27.4, lng: -82.5 },
        { number: 500, lat: 27.45, lng: -82.45 },
      ])
    )
    expect(decoded.map((p) => p.number)).toEqual([100, 500, 900])
  })

  /**
   * 123A and 123B are the two halves of one duplex, metres apart. Keeping both
   * would cost bytes to store a distinction the 50 m accuracy target cannot
   * see, and the house-number parser has already discarded the letter.
   */
  it('collapses repeated house numbers, keeping the first', () => {
    const payload = encodePoints([
      { number: 123, lat: 27.4, lng: -82.4 },
      { number: 123, lat: 27.9, lng: -82.9 },
    ])
    expect(countPoints(payload)).toBe(1)
    expect(decodePoints(payload)[0].lat).toBeCloseTo(27.4, 4)
  })

  it('holds a point in about five bytes', () => {
    const points = block(1, 2000, 1)
    const bytes = encodePoints(points).length / points.length
    expect(bytes).toBeLessThan(6)
    expect(bytes).toBeGreaterThan(4)
  })

  it('refuses a group too wide for a u16 offset instead of wrapping it', () => {
    // Two points a degree apart: the same "County Road 12" at opposite ends of
    // a source that published no city and no postcode.
    expect(() =>
      encodePoints([
        { number: 1, lat: 27.0, lng: -82.0 },
        { number: 2, lat: 28.0, lng: -82.0 },
      ])
    ).toThrow(PayloadSpanError)
  })

  it('accepts a group right up to the edge of the range', () => {
    const payload = encodePoints([
      { number: 1, lat: 27.0, lng: -82.0 },
      { number: 2, lat: 27.65, lng: -82.0 },
    ])
    expect(decodePoints(payload)[1].lat).toBeCloseTo(27.65, 4)
  })

  it('rejects an empty set rather than writing an unreadable blob', () => {
    expect(() => encodePoints([])).toThrow(/nothing to encode/)
  })
})

describe('findNumber', () => {
  const payload = encodePoints(block(800, 900))

  it('returns the register coordinate for a number it holds', () => {
    const match = findNumber(payload, 862)
    expect(match.kind).toBe('exact')
    expect(match.lat).toBeCloseTo(27.49 + 62 * 0.00002, 4)
    expect(match.lng).toBeCloseTo(-82.48 + 62 * 0.00001, 4)
  })

  it('finds the first and last of the block', () => {
    expect(findNumber(payload, 800).kind).toBe('exact')
    expect(findNumber(payload, 900).kind).toBe('exact')
    expect(findNumber(payload, 900).lat).toBeCloseTo(27.49 + 100 * 0.00002, 4)
  })

  /**
   * The odd side of the street, which this county did not publish. Placing 861
   * halfway between 860 and 862 is a guess, and the separate label is what
   * lets the UI say so -- `isExactPrecision` is false for `interpolated`, which
   * is what raises "approximate, drag the pin to correct it".
   */
  it('interpolates a missing number between its neighbours and says so', () => {
    const match = findNumber(payload, 861)
    expect(match.kind).toBe('interpolated')
    expect(match.lat).toBeCloseTo(27.49 + 61 * 0.00002, 4)
    // No odd number anywhere in this register, so the only bracket available
    // crosses the road. The flag is what lets `precisionOf` decline to call
    // this a house number at all.
    expect(match.sameSide).toBe(false)
  })

  /**
   * The correction this codec exists to make, and the one that was costing the
   * most: American streets run even down one side and odd down the other, so
   * 861 is not between 860 and 862 -- it is ACROSS THE ROAD from both.
   *
   * Measured by leave-one-out over the county registers, bracketing by numeric
   * neighbour put the median answer 46 m out in Manatee and 58 m out in
   * Hennepin. Bracketing by same-parity neighbour puts it at 3.2 m and 0.6 m.
   */
  describe('which side of the street', () => {
    /** Evens at one latitude, odds thirty metres north, as a real street is. */
    const twoSided = encodePoints(
      Array.from({ length: 82 }, (_, i) => {
        const number = 800 + i
        return {
          number,
          lat: (number % 2 === 0 ? 27.49 : 27.4903) + (number - 800) * 0.00002,
          lng: -82.48 + (number - 800) * 0.00001,
        }
      }).filter((p) => p.number !== 861)
    )

    it('brackets an odd number with odd neighbours, not with the evens beside it', () => {
      const match = findNumber(twoSided, 861)
      expect(match.kind).toBe('interpolated')
      expect(match.sameSide).toBe(true)
      // On the odd side, where 861 actually is -- not the middle of the road.
      expect(match.lat).toBeCloseTo(27.4903 + 61 * 0.00002, 4)
    })

    it('reports how far apart the bracketing pair was', () => {
      // 859 and 863 are four numbers and two metres of latitude apart, which is
      // what `precisionOf` grades the answer on.
      const match = findNumber(twoSided, 861)
      expect(match.spanM).toBeGreaterThan(0)
      expect(match.spanM).toBeLessThan(50)
    })

    it('leaves an exact hit alone, with nothing to grade', () => {
      const match = findNumber(twoSided, 862)
      expect(match.kind).toBe('exact')
      expect(match.spanM).toBeNull()
      expect(match.sameSide).toBeNull()
    })

    /**
     * A rural county road numbered straight up one side. There is no parity to
     * respect, so the numeric neighbours are both the best and the only
     * bracket -- and the gate measures them as good as any (Wakulla: 0.7 m
     * either way). The fallback has to stay a fallback and not an error.
     */
    it('uses the numeric neighbours when the register has only one side', () => {
      const oneSided = encodePoints(block(800, 900, 2))
      const match = findNumber(oneSided, 851)
      expect(match.kind).toBe('interpolated')
      expect(match.sameSide).toBe(false)
      expect(match.lat).toBeCloseTo(27.49 + 51 * 0.00002, 4)
    })
  })

  it('falls back to the middle of the run past either end of the block', () => {
    const low = findNumber(payload, 10)
    const high = findNumber(payload, 99999)
    expect(low.kind).toBe('street')
    expect(high.kind).toBe('street')
    expect(low.lat).toBe(high.lat)
    // The middle of the block, not the first point and not the last.
    expect(low.lat).toBeGreaterThan(27.49)
    expect(low.lat).toBeLessThan(27.49 + 100 * 0.00002)
  })

  it('answers at street level when no number was typed', () => {
    expect(findNumber(payload, null).kind).toBe('street')
  })

  it('reads the coordinate columns correctly wherever the number scan stopped', () => {
    // The scan breaks out early on a hit and then has to skip the remaining
    // variable-width numbers to find the columns. Getting that wrong reads a
    // coordinate from the middle of a varint, which decodes to a plausible but
    // wrong point -- so every position is checked, not just one.
    const points = block(800, 900)
    for (let i = 0; i < points.length; i++) {
      const match = findNumber(payload, points[i].number)
      expect(match.kind).toBe('exact')
      expect(match.lat).toBeCloseTo(points[i].lat, 4)
      expect(match.lng).toBeCloseTo(points[i].lng, 4)
    }
  })

  it('handles a street with a single point', () => {
    const one = encodePoints([{ number: 862, lat: 27.491257, lng: -82.481824 }])
    expect(findNumber(one, 862).kind).toBe('exact')
    expect(findNumber(one, 862).lat).toBeCloseTo(27.491257, 4)
    expect(findNumber(one, 1).kind).toBe('street')
    expect(findNumber(one, null).lat).toBeCloseTo(27.491257, 4)
  })

  it('survives house numbers past the one-byte varint boundary', () => {
    // Deltas above 127 need a second byte. A block numbered in thousands with
    // gaps is the ordinary rural case, not an edge case.
    const rural = encodePoints([
      { number: 1000, lat: 27.0, lng: -82.0 },
      { number: 25503, lat: 27.1, lng: -82.1 },
      { number: 148000, lat: 27.2, lng: -82.2 },
    ])
    expect(decodePoints(rural).map((p) => p.number)).toEqual([1000, 25503, 148000])
    expect(findNumber(rural, 25503).kind).toBe('exact')
    expect(findNumber(rural, 25503).lat).toBeCloseTo(27.1, 4)
    expect(findNumber(rural, 148000).lat).toBeCloseTo(27.2, 4)
  })
})

/**
 * The other direction: given where the pin was dropped, which door is it?
 *
 * This is what lets reverse geocoding stop leaving the building. Today dragging
 * the pin over a personal-injury client's home sends those exact coordinates to
 * a third party, which is the one privacy hole the self-hosted engine was
 * supposed to close and has not yet.
 */
describe('nearestPoint', () => {
  const street = encodePoints([
    { number: 800, lat: 27.49, lng: -82.48 },
    { number: 802, lat: 27.491, lng: -82.4805 },
    { number: 804, lat: 27.492, lng: -82.481 },
    { number: 806, lat: 27.493, lng: -82.4815 },
  ])

  it('finds the door a coordinate is standing on', () => {
    const hit = nearestPoint(street, 27.492, -82.481)
    expect(hit.number).toBe(804)
    expect(hit.distanceM).toBeLessThan(2)
  })

  it('finds the nearest door when the coordinate is between two', () => {
    // Nudged towards 806.
    const hit = nearestPoint(street, 27.4928, -82.4814)
    expect(hit.number).toBe(806)
  })

  it('reports the distance in metres, not the degrees it compared', () => {
    // A tenth of a degree of latitude is about eleven kilometres.
    const far = nearestPoint(street, 27.59, -82.48)
    expect(far.distanceM).toBeGreaterThan(10_000)
    expect(far.distanceM).toBeLessThan(12_000)
  })

  it('returns the register coordinate, not the queried one', () => {
    const hit = nearestPoint(street, 27.4915, -82.4802)
    expect(hit.lat).toBeCloseTo(27.491, 4)
    expect(hit.lng).toBeCloseTo(-82.4805, 4)
  })

  it('handles a street of one', () => {
    const one = encodePoints([{ number: 862, lat: 27.491257, lng: -82.481824 }])
    const hit = nearestPoint(one, 27.4, -82.4)
    expect(hit.number).toBe(862)
  })

  /**
   * The scan compares squared distance in degree space, so longitude has to be
   * scaled by cos(latitude) or the ordering is wrong. At Minneapolis a degree
   * of longitude is 0.7 of a degree of latitude: without the scaling, a door
   * 100 m east reads as nearer than one 80 m north.
   */
  it('does not mistake a degree of longitude for a degree of latitude', () => {
    const north = { number: 1, lat: 44.9786, lng: -93.265 }
    const east = { number: 3, lat: 44.9778, lng: -93.2637 }
    const hit = nearestPoint(encodePoints([north, east]), 44.9778, -93.265)

    // 89 m north against 103 m east once the cosine is applied. Comparing raw
    // degrees would answer 3, because 0.0013 degrees of longitude looks smaller
    // than 0.0008 of latitude only after scaling -- and larger before it.
    expect(hit.number).toBe(1)
    expect(hit.distanceM).toBeCloseTo(89, -1)
  })

  it('agrees with a brute-force scan over a long street', () => {
    const long = Array.from({ length: 400 }, (_, i) => ({
      number: 100 + i * 2,
      lat: 27.49 + Math.sin(i / 9) * 0.002 + i * 0.000004,
      lng: -82.48 + Math.cos(i / 7) * 0.002,
    }))
    const payload = encodePoints(long)

    for (const probe of [
      { lat: 27.4905, lng: -82.4795 },
      { lat: 27.4915, lng: -82.4822 },
      { lat: 27.4885, lng: -82.4788 },
    ]) {
      const hit = nearestPoint(payload, probe.lat, probe.lng)
      const brute = long
        .map((p) => ({
          number: p.number,
          d:
            (p.lat - probe.lat) ** 2 +
            ((p.lng - probe.lng) * Math.cos((probe.lat * Math.PI) / 180)) ** 2,
        }))
        .sort((a, b) => a.d - b.d)[0]
      expect(hit.number).toBe(brute.number)
    }
  })
})
