import { describe, it, expect } from 'vitest'
import {
  locationAgreement,
  precisionOf,
  rankStreets,
  streetSimilarity,
  streetCentre,
  type StreetRow,
} from '@/lib/geocoding/street-index'
import { parseUsAddress } from '@/lib/geocoding/address-parser'
import { isExactPrecision } from '@/lib/geocoding/precision'

/**
 * Every case here is a real result the engine produced against the platform's
 * own 876 addresses, or against the 201-case county corpus. None of them is
 * hypothetical, and the two that are named after a street are the two that were
 * embarrassing.
 */

function street(over: Partial<StreetRow> = {}): StreetRow {
  return {
    id: 1,
    name_norm: 'main st',
    name_display: 'Main St',
    city: 'Bradenton',
    state: 'FL',
    zip: '34208',
    num_min: 1,
    num_max: 999,
    lat_min: 27.49,
    lat_max: 27.5,
    lng_min: -82.49,
    lng_max: -82.48,
    point_count: 100,
    score: 0.6,
    ...over,
  }
}

describe('streetSimilarity', () => {
  it('scores an exact match at 1', () => {
    expect(streetSimilarity('62nd st cir e', '62nd st cir e')).toBe(1)
  })

  /**
   * The Pensacola case. "N" and "ST" are on a large fraction of the 567,000
   * names and "STILLMAN" is on one street; counting the three equally scored
   * this pair at 0.66, which was close enough for a house-number bonus to
   * carry a wrong street past a right one.
   */
  it('does not let two meaningless tokens carry a match', () => {
    const wrong = streetSimilarity('n stillman st', 'n w st')
    const right = streetSimilarity('n stillman st', 'n stillman st')

    expect(wrong).toBeLessThan(0.6)
    expect(right).toBe(1)
    // The gap has to survive everything corroboration can do to it.
    expect(right / wrong).toBeGreaterThan(1.5)
  })

  it('is order-insensitive, because two counties write the same street both ways', () => {
    const a = streetSimilarity('se 17th st', '17th st se')
    expect(a).toBeGreaterThan(0.8)
  })

  it('still rewards a partial name while someone is typing', () => {
    expect(streetSimilarity('palmetto', 'palmetto ave')).toBeGreaterThan(0.7)
    expect(streetSimilarity('62nd st', '62nd st cir e')).toBeGreaterThan(0.6)
  })

  it('is 0 for nothing', () => {
    expect(streetSimilarity('', 'main st')).toBe(0)
    expect(streetSimilarity('main st', '')).toBe(0)
  })
})

describe('locationAgreement', () => {
  const asked = { zip: '34208', city: 'Bradenton' }

  it('is total when the postcode matches', () => {
    expect(locationAgreement(asked, { zip: '34208', city: 'Anywhere' })).toBe(1)
  })

  it('accepts a neighbouring postcode in the same sectional centre', () => {
    // 342xx is one USPS sectional centre, roughly a county. A correct address
    // one postcode boundary out is common and should not be thrown away.
    expect(locationAgreement(asked, { zip: '34209', city: '' })).toBeCloseTo(0.7)
  })

  it('accepts the city when the postcode is absent', () => {
    expect(locationAgreement(asked, { zip: '', city: 'Bradenton' })).toBeCloseTo(0.85)
  })

  /**
   * The Caledonia case, and the reason this function exists. Houston County
   * publishes no register, so the only Spruce St in Minnesota was the only
   * candidate -- and because that row carried no city, "unknown" was scored
   * above "wrong" and it won. The answer was 1,658 km from the question.
   */
  it('treats a row it cannot place as weak, never as neutral', () => {
    const silent = locationAgreement(asked, { zip: '', city: '' })
    const agreeing = locationAgreement(asked, { zip: '34208', city: 'Bradenton' })

    expect(silent).toBeGreaterThan(0)
    expect(silent).toBeLessThan(0.5)
    expect(silent).toBeLessThan(agreeing)
  })

  it('is zero when the row says plainly it is somewhere else', () => {
    expect(locationAgreement(asked, { zip: '33401', city: 'West Palm Beach' })).toBe(0)
  })

  it('is total when the query named no place, since there is nothing to contradict', () => {
    expect(locationAgreement({ zip: null, city: null }, { zip: '99999', city: 'Nowhere' })).toBe(1)
  })
})

describe('rankStreets', () => {
  it('puts the right street first when the name matches exactly', () => {
    const parsed = parseUsAddress('5599 N Stillman St, Pensacola, FL 32505')
    const rows = [
      // Holds 5599, so it takes the in-block bonus. Its name does not match.
      street({ id: 1, name_norm: 'n w st', name_display: 'N W St', city: 'Pensacola', zip: '32505', num_min: 5000, num_max: 6000 }),
      // The right street. The register stops at 315, so 5599 is outside it.
      street({ id: 2, name_norm: 'n stillman st', name_display: 'N Stillman St', city: 'Pensacola', zip: '32505', num_min: 9, num_max: 315 }),
    ]

    const ranked = rankStreets(parsed, rows)
    expect(ranked[0].id).toBe(2)
  })

  it('drops a candidate the query says is somewhere else', () => {
    const parsed = parseUsAddress('223 9th Street, Port Saint Joe, FL 32456')
    const ranked = rankStreets(parsed, [
      street({ id: 1, name_norm: '9th st', name_display: '9th St', city: 'West Palm Beach', zip: '33401' }),
    ])
    expect(ranked).toEqual([])
  })

  it('keeps a candidate whose postcode is one boundary out', () => {
    const parsed = parseUsAddress('100 Main St, Bradenton, FL 34208')
    const ranked = rankStreets(parsed, [street({ zip: '34209', city: 'Palmetto' })])
    expect(ranked).toHaveLength(1)
    expect(ranked[0].agreement).toBeCloseTo(0.7)
  })

  /**
   * A long road is split per postcode, and a city that publishes separately
   * from its county adds its own row. Showing "SE 17th St, Ocala" five times
   * is worse than showing it once.
   */
  it('shows one suggestion per street, not one per segment', () => {
    const parsed = parseUsAddress('1531 SE 17th St, Ocala, FL')
    const rows = [
      street({ id: 1, name_norm: 'se 17th st', name_display: 'Se 17th St', city: 'Ocala', zip: '34471', num_min: 5, num_max: 5471 }),
      street({ id: 2, name_norm: 'se 17th st', name_display: 'Se 17th St', city: 'Ocala', zip: '34480', num_min: 4906, num_max: 5790 }),
      street({ id: 3, name_norm: 'se 17th st', name_display: 'Se 17th St', city: 'Ocala', zip: '', num_min: 1, num_max: 99 }),
    ]

    const ranked = rankStreets(parsed, rows)
    expect(ranked).toHaveLength(1)
    // The segment whose block actually contains 1531.
    expect(ranked[0].id).toBe(1)
  })

  it('prefers the segment holding the typed house number', () => {
    const parsed = parseUsAddress('4950 Main St, Bradenton, FL 34208')
    const ranked = rankStreets(parsed, [
      street({ id: 1, city: 'Bradenton', num_min: 1, num_max: 999 }),
      street({ id: 2, city: 'Bradenton', num_min: 4000, num_max: 5000, name_display: 'Main St ' }),
    ])
    expect(ranked[0].id).toBe(2)
    expect(ranked[0].numberInRange).toBe(true)
  })

  it('biases towards the map without ever excluding what is far from it', () => {
    const parsed = parseUsAddress('100 Main St, FL')
    // Different cities, or the two collapse into one suggestion -- which is
    // what the de-duplication above is for and is tested separately.
    const near = street({ id: 1, city: 'Bradenton', zip: '', lat_min: 27.49, lat_max: 27.5, lng_min: -82.49, lng_max: -82.48 })
    const far = street({ id: 2, city: 'Pensacola', zip: '', lat_min: 30.4, lat_max: 30.41, lng_min: -87.2, lng_max: -87.19 })

    const biased = rankStreets(parsed, [far, near], { proximity: { lat: 27.495, lng: -82.485 } })
    expect(biased[0].id).toBe(1)
    // Still offered. A bias, not a filter.
    expect(biased.map((r) => r.id)).toContain(2)
  })

  it('returns nothing rather than noise for a name that does not match', () => {
    const parsed = parseUsAddress('100 Zzyzx Rd, Bradenton, FL 34208')
    expect(rankStreets(parsed, [street()])).toEqual([])
  })

  it('honours the limit', () => {
    const parsed = parseUsAddress('100 Main St, FL')
    const rows = Array.from({ length: 20 }, (_, i) => street({ id: i, city: `City${i}`, zip: '' }))
    expect(rankStreets(parsed, rows, { limit: 5 })).toHaveLength(5)
  })
})

describe('precisionOf', () => {
  const exact = { lat: 0, lng: 0, kind: 'exact', spanM: null, sameSide: null } as const
  /** An interpolation between two doors on the caller's own side of the road. */
  const between = (spanM: number, sameSide = true) =>
    ({ lat: 0, lng: 0, kind: 'interpolated', spanM, sameSide }) as const

  it('claims rooftop only when the register holds the number', () => {
    expect(precisionOf(exact)).toBe('rooftop')
    expect(precisionOf(between(30))).toBe('interpolated')
    expect(precisionOf({ lat: 0, lng: 0, kind: 'street', spanM: null, sameSide: null })).toBe(
      'street'
    )
  })

  /**
   * The whole point of the project, in one assertion. Geoapify labelled 100% of
   * its answers `rooftop` while 29% were over 50 m out, so `isExactPrecision`
   * was always true and the "approximate -- drag the pin" prompt never fired.
   * Finding house number 183 is worthless if it is the wrong Spruce St.
   */
  it('will not claim rooftop for a street it cannot place', () => {
    const uncertain = precisionOf(exact, 0.3)
    expect(uncertain).toBe('street')
    expect(isExactPrecision(uncertain)).toBe(false)
  })

  it('claims rooftop when the location is corroborated', () => {
    expect(precisionOf(exact, 1)).toBe('rooftop')
    expect(precisionOf(exact, 0.7)).toBe('rooftop')
  })

  /**
   * Both rules below come out of `scripts/geo/gate-interpolation.ts`, which
   * measures the shipped `findNumber` by leave-one-out against the county
   * registers. Neither number is a judgement call, and changing one without
   * re-running that gate is how this stops being true.
   */
  describe('how much an interpolation may claim', () => {
    it('trusts a narrow bracket on the same side of the road', () => {
      // 95.9-99.7% of these land within 50 m, in every county measured.
      expect(precisionOf(between(10))).toBe('interpolated')
      expect(precisionOf(between(100))).toBe('interpolated')
    })

    it('demotes a bracket too wide to be placing a door', () => {
      // Past 100 m the median error triples and the tail runs to hundreds of
      // metres. That is a street-level answer wearing a house number.
      expect(precisionOf(between(101))).toBe('street')
      expect(precisionOf(between(900))).toBe('street')
    })

    /**
     * The finding that made this phase worth doing: 861 is not between 860 and
     * 862, it is across the road from both. Where the register holds no
     * same-parity pair the engine still answers, but the answer is a street.
     */
    it('demotes a bracket that crosses the road, however narrow', () => {
      expect(precisionOf(between(8, false))).toBe('street')
      expect(precisionOf(between(80, false))).toBe('street')
    })

    it('still never counts an interpolation as exact', () => {
      expect(isExactPrecision(precisionOf(between(10)))).toBe(false)
    })
  })
})

describe('streetCentre', () => {
  it('is the middle of the bounding box', () => {
    const centre = streetCentre(street())
    expect(centre.lat).toBeCloseTo(27.495, 6)
    expect(centre.lng).toBeCloseTo(-82.485, 6)
  })
})
