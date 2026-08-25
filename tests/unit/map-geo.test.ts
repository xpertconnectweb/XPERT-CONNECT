import { describe, expect, it } from 'vitest'
import { radiusBounds, toLatLngBounds } from '@/lib/map/geo'

describe('toLatLngBounds', () => {
  /**
   * The geocoder returns `[south, north, west, east]` and Leaflet wants
   * `[[south, west], [north, east]]`. Passing one straight to the other is
   * silent — no error, just the wrong part of the world — so this is the
   * assertion that earns its keep.
   */
  it('reorders two latitudes and two longitudes into two corners', () => {
    expect(toLatLngBounds([28.53, 28.54, -81.38, -81.37])).toEqual([
      [28.53, -81.38],
      [28.54, -81.37],
    ])
  })

  it('keeps south-west first and north-east second', () => {
    const [[swLat, swLng], [neLat, neLng]] = toLatLngBounds([25.7, 30.4, -87.2, -80.1])
    expect(swLat).toBeLessThan(neLat)
    expect(swLng).toBeLessThan(neLng)
  })
})

describe('radiusBounds', () => {
  it('spans roughly twice the radius from north to south', () => {
    const [[south], [north]] = radiusBounds([28.5, -81.4], 69)
    // 69 miles is about one degree of latitude.
    expect(north - south).toBeCloseTo(2, 1)
  })

  it('widens the longitude span as latitude increases', () => {
    const florida = radiusBounds([25.8, -80.2], 25)
    const minnesota = radiusBounds([47.9, -97.0], 25)
    const span = (b: ReturnType<typeof radiusBounds>) => b[1][1] - b[0][1]
    // A degree of longitude is narrower up north, so the same distance in miles
    // covers more degrees. Ignoring this clips the circle east and west.
    expect(span(minnesota)).toBeGreaterThan(span(florida))
  })

  it('contains its own centre', () => {
    const [[south, west], [north, east]] = radiusBounds([28.5, -81.4], 10)
    expect(28.5).toBeGreaterThan(south)
    expect(28.5).toBeLessThan(north)
    expect(-81.4).toBeGreaterThan(west)
    expect(-81.4).toBeLessThan(east)
  })
})
