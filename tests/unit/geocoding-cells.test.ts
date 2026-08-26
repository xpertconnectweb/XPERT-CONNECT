import { describe, expect, it } from 'vitest'
import { boxDistanceSq, cellOf, cellRange, cellsCovering } from '@/lib/geocoding/cells'
import { REVERSE_CELL_DEGREES } from '@/lib/geocoding/constants'

/**
 * The grid the reverse lookup reads.
 *
 * Everything here is duplicated in SQL -- `geo_rebuild_cells` writes what
 * `cellsCovering` describes, `geo_street_nearby` reads what `cellRange`
 * describes. A disagreement between the two does not throw: it quietly reads
 * the wrong neighbourhood and answers with whatever street is in it. These
 * tests are the only place that mismatch can be caught cheaply.
 */

describe('the cell size', () => {
  /**
   * Pinned deliberately. The value appears in two SQL functions as a literal,
   * so changing it here without a migration would put the writer and the reader
   * on different grids -- and the symptom is a wrong answer, not an error.
   */
  it('is 0.01 degrees, and changing it means a migration', () => {
    expect(REVERSE_CELL_DEGREES).toBe(0.01)
  })
})

describe('cellOf', () => {
  it('puts a coordinate in the cell that contains it', () => {
    expect(cellOf(27.491257, -82.481824)).toEqual({ lat: 2749, lng: -8249 })
  })

  /**
   * Floor, not round. A cell owns `[n * size, (n + 1) * size)`, so no
   * coordinate is in two cells and none is in neither. Postgres `floor()`
   * agrees, including below zero -- which is every longitude in this index.
   */
  it('floors rather than rounding, on both signs', () => {
    expect(cellOf(27.4999, -82.4001).lat).toBe(2749)
    expect(cellOf(27.5000, -82.4001).lat).toBe(2750)
    // -8241 would be the rounded answer and it is the wrong cell: -82.4001 is
    // below -82.40, so it belongs to the cell starting at -82.41.
    expect(cellOf(27.5, -82.4001).lng).toBe(-8241)
    expect(cellOf(27.5, -82.4000).lng).toBe(-8240)
  })
})

describe('cellsCovering', () => {
  it('gives a small street the one cell it sits in', () => {
    expect(cellsCovering(27.4912, 27.4918, -82.4820, -82.4815)).toEqual([
      { lat: 2749, lng: -8249 },
    ])
  })

  it('gives a street straddling a boundary both cells', () => {
    const cells = cellsCovering(27.4995, 27.5005, -82.4820, -82.4815)
    expect(cells).toHaveLength(2)
    expect(cells.map((c) => c.lat).sort()).toEqual([2749, 2750])
  })

  /**
   * The case the whole coverage scheme exists for: a source that published
   * neither city nor postcode, so every segment of one road in the county
   * became a single row 0.1 degrees across. Its centroid is kilometres from
   * most of it.
   */
  it('spreads a very wide street across every cell it touches', () => {
    const cells = cellsCovering(27.40, 27.50, -82.50, -82.40)
    // Eleven cells of latitude by eleven of longitude, inclusive at both ends.
    expect(cells).toHaveLength(11 * 11)
    expect(cells).toContainEqual({ lat: 2740, lng: -8250 })
    expect(cells).toContainEqual({ lat: 2750, lng: -8240 })
  })

  it('never returns nothing, however small the box', () => {
    expect(cellsCovering(27.4912, 27.4912, -82.482, -82.482)).toHaveLength(1)
  })
})

describe('cellRange', () => {
  it('covers the query cell and its neighbours', () => {
    const range = cellRange(27.491257, -82.481824, REVERSE_CELL_DEGREES)
    expect(range.latMin).toBeLessThanOrEqual(2749)
    expect(range.latMax).toBeGreaterThanOrEqual(2749)
    expect(range.lngMin).toBeLessThanOrEqual(-8249)
    expect(range.lngMax).toBeGreaterThanOrEqual(-8249)
  })

  /**
   * A degree of longitude is 0.73 of a degree of latitude in Minneapolis. A
   * square of cells measured in raw degrees would therefore search a third less
   * ground east-west than north-south, and every street missed by that would be
   * missed in silence.
   */
  it('reaches further in longitude than in latitude, and further the further north', () => {
    // A radius of several cells, because the answer is quantised to whole cells
    // and at a one-cell radius the grid hides the difference entirely. That is
    // fine in production -- the query radius is small and the extra ground is
    // free -- but it means this property can only be observed above the grid.
    const florida = cellRange(27.5, -82.5, 0.1)
    const minnesota = cellRange(44.98, -93.27, 0.1)

    const width = (r: { lngMin: number; lngMax: number }) => r.lngMax - r.lngMin
    const height = (r: { latMin: number; latMax: number }) => r.latMax - r.latMin

    expect(width(florida)).toBeGreaterThan(height(florida))
    expect(width(minnesota)).toBeGreaterThan(width(florida))
  })

  it('does not ask for the whole planet at a pole', () => {
    const polar = cellRange(89.9, 0, 0.02)
    expect(polar.lngMax - polar.lngMin).toBeLessThan(50)
  })
})

describe('boxDistanceSq', () => {
  it('is zero inside the box', () => {
    expect(boxDistanceSq(27.5, -82.5, 27.4, 27.6, -82.6, -82.4)).toBe(0)
  })

  it('grows with distance outside it', () => {
    const near = boxDistanceSq(27.61, -82.5, 27.4, 27.6, -82.6, -82.4)
    const far = boxDistanceSq(27.70, -82.5, 27.4, 27.6, -82.6, -82.4)
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near)
  })

  /**
   * Same reason as `nearestPoint`: the two axes are not the same size, and an
   * unscaled comparison would rank a street 100 m east ahead of one 80 m north.
   */
  it('scales longitude so the two axes are comparable', () => {
    const box = { latMin: 44.98, latMax: 44.98, lngMin: -93.27, lngMax: -93.27 }
    // 0.001 degrees each way, which is 111 m north and 79 m east up here.
    const north = boxDistanceSq(44.981, -93.27, box.latMin, box.latMax, box.lngMin, box.lngMax)
    const east = boxDistanceSq(44.98, -93.269, box.latMin, box.latMax, box.lngMin, box.lngMax)
    expect(east).toBeLessThan(north)
  })
})
