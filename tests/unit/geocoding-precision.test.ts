import { describe, expect, it } from 'vitest'
import {
  approximateCopy,
  googleGeocodingPrecision,
  googlePlacesPrecision,
  isExactPrecision,
  mapboxPrecision,
  nominatimPrecision,
  precisionRank,
} from '@/lib/geocoding/precision'

/**
 * The three providers describe confidence in three different vocabularies.
 * This is the table that makes them mean the same thing, and these are the
 * cases that keep them honest as one gets swapped for another.
 *
 * The consumer rule is singular and lives in `isExactPrecision`: anything that
 * is not rooftop or parcel earns a "drag the pin" prompt. Getting a mapping
 * wrong in the confident direction is the expensive mistake — it suppresses
 * that prompt on a point that needed it, and every distance measured from it
 * is then quietly wrong.
 */

describe('nominatim', () => {
  it('treats a house number as a rooftop, however OSM tagged the feature', () => {
    // OSM records a house number either on an address node or on a building
    // polygon. Both put the point on the property.
    expect(nominatimPrecision('house', 'place', { house_number: '1000', road: 'Legion Pl' }))
      .toBe('rooftop')
    expect(nominatimPrecision('building', 'building', { house_number: '862' })).toBe('rooftop')
  })

  it('falls to street when there is a road but no number', () => {
    expect(nominatimPrecision('residential', 'highway', { road: '62nd Street Circle East' }))
      .toBe('street')
  })

  it('reads a postcode as a ZIP even when it also carries a city', () => {
    // A ZIP result usually has `city` too, and the city branch would swallow it
    // if the postcode check did not come first.
    expect(nominatimPrecision('postcode', 'place', { postcode: '32801', city: 'Orlando' }))
      .toBe('zip')
  })

  it('classifies a city and a bare region distinctly', () => {
    expect(nominatimPrecision('city', 'place', { city: 'Bradenton' })).toBe('city')
    expect(nominatimPrecision('state', 'boundary', { state: 'Florida' })).toBe('region')
  })

  it('gives an amenity rooftop precision, because a POI node is the building', () => {
    expect(nominatimPrecision('clinic', 'amenity', {})).toBe('rooftop')
  })

  it('says unknown rather than guessing when there is nothing to go on', () => {
    expect(nominatimPrecision(undefined, undefined, undefined)).toBe('unknown')
    expect(nominatimPrecision(undefined, undefined, {})).toBe('unknown')
  })
})

describe('mapbox', () => {
  it('prefers the accuracy field, which is the authoritative one', () => {
    expect(mapboxPrecision('rooftop', 'address')).toBe('rooftop')
    expect(mapboxPrecision('parcel', 'address')).toBe('parcel')
    // Without the accuracy field an address feature is only interpolated —
    // Mapbox will happily place a number along a street it has the range for.
    expect(mapboxPrecision(undefined, 'address')).toBe('interpolated')
  })

  it('maps interpolation and intersections to the same honest middle', () => {
    expect(mapboxPrecision('interpolated', 'address')).toBe('interpolated')
    expect(mapboxPrecision('intersection', 'address')).toBe('interpolated')
  })

  it('falls back to the feature type for everything coarser than an address', () => {
    expect(mapboxPrecision(undefined, 'postcode')).toBe('zip')
    expect(mapboxPrecision(undefined, 'place')).toBe('city')
    expect(mapboxPrecision(undefined, 'region')).toBe('region')
  })

  it('says unknown for a vocabulary it does not recognise', () => {
    expect(mapboxPrecision('something-new', 'also-new')).toBe('unknown')
    expect(mapboxPrecision(undefined, undefined)).toBe('unknown')
  })
})

describe('google', () => {
  it('reads location_type directly, which only the Geocoding endpoint gives', () => {
    expect(googleGeocodingPrecision('ROOFTOP')).toBe('rooftop')
    expect(googleGeocodingPrecision('RANGE_INTERPOLATED')).toBe('interpolated')
    expect(googleGeocodingPrecision('GEOMETRIC_CENTER')).toBe('street')
    expect(googleGeocodingPrecision('APPROXIMATE')).toBe('city')
    expect(googleGeocodingPrecision(undefined)).toBe('unknown')
  })

  /**
   * Places Details does NOT return `location_type`, so precision has to be
   * inferred from `types[]`. That is a real fidelity gap and the reason
   * `reverse()` deliberately uses the Geocoding endpoint instead — for a
   * dragged pin, "rooftop or middle of the street" is the whole question.
   */
  it('infers from types[] on Places, erring coarse where it cannot tell', () => {
    expect(googlePlacesPrecision(['street_address'])).toBe('rooftop')
    expect(googlePlacesPrecision(['premise', 'point_of_interest'])).toBe('rooftop')
    expect(googlePlacesPrecision(['route'])).toBe('street')
    expect(googlePlacesPrecision(['postal_code'])).toBe('zip')
    expect(googlePlacesPrecision(['locality', 'political'])).toBe('city')
    expect(googlePlacesPrecision(['administrative_area_level_1'])).toBe('region')
    expect(googlePlacesPrecision(undefined)).toBe('unknown')
    expect(googlePlacesPrecision([])).toBe('unknown')
  })
})

describe('the consumer rule', () => {
  it('treats only rooftop and parcel as exact', () => {
    expect(isExactPrecision('rooftop')).toBe(true)
    expect(isExactPrecision('parcel')).toBe(true)
    // Interpolated is the interesting one: it looks like a street address and
    // is not on the building. It has to earn the prompt.
    expect(isExactPrecision('interpolated')).toBe(false)
    expect(isExactPrecision('street')).toBe(false)
    expect(isExactPrecision('zip')).toBe(false)
    expect(isExactPrecision('city')).toBe(false)
    expect(isExactPrecision('region')).toBe(false)
    expect(isExactPrecision('unknown')).toBe(false)
  })

  it('orders precision best to worst', () => {
    expect(precisionRank('rooftop')).toBeLessThan(precisionRank('street'))
    expect(precisionRank('street')).toBeLessThan(precisionRank('zip'))
    expect(precisionRank('zip')).toBeLessThan(precisionRank('unknown'))
  })
})

/**
 * The wording, not the decision.
 *
 * Every inexact answer used to get the same sentence, whether the point was
 * estimated between two doors twenty metres apart or was the centre of a
 * postcode. That warning fired on about a fifth of searches, and one that cries
 * the same wolf at both is one people stop reading.
 */
describe('how an approximate answer is worded', () => {
  it('says something different for each kind of approximation', () => {
    const said = (['interpolated', 'street', 'zip', 'city'] as const).map(
      (p) => approximateCopy(p).full
    )
    expect(new Set(said).size).toBe(said.length)
  })

  it('is softer for an interpolation than for the centre of a postcode', () => {
    // The measured case: a same-side bracket under 100 m lands within 50 m
    // about 98% of the time. Worth mentioning, not worth alarming anyone over.
    expect(approximateCopy('interpolated').full).not.toMatch(/^Approximate/)
    expect(approximateCopy('zip').full).toMatch(/^Approximate/)
  })

  /**
   * Both forms, and this is the line that matters. The chip under a search box
   * is the only instruction some of these fields ever show -- an earlier draft
   * graded the wording by dropping the drag from the softer cases, and a
   * component test caught it saying "centre of the ZIP code" and nothing else.
   * Grade the severity, never the way out.
   */
  it('always offers the drag, whichever wording it uses', () => {
    for (const p of ['interpolated', 'street', 'zip', 'city', 'region', 'unknown'] as const) {
      expect(approximateCopy(p).full).toMatch(/[Dd]rag the pin/)
      expect(approximateCopy(p).short).toMatch(/[Dd]rag the pin/)
    }
  })

  it('falls back rather than going blank on a level it has no copy for', () => {
    expect(approximateCopy('region').full).toBeTruthy()
    expect(approximateCopy('unknown').short).toBeTruthy()
  })

  /**
   * `isExactPrecision` is what decides whether any of this is shown. Grading the
   * wording must never turn into suppressing the warning -- softening a message
   * is honest, hiding it is not.
   */
  it('does not quietly promote an interpolation to exact', () => {
    expect(isExactPrecision('interpolated')).toBe(false)
  })
})
