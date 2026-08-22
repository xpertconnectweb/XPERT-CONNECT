import { describe, expect, it } from 'vitest'
import { CANONICAL_REGIONS, canonicalizeRegion, regionsForState, sanitizeRegion } from '@/lib/regions'
import { canonicalizeCounty, countyLabel } from '@/lib/counties'

describe('canonicalizeRegion — collapsing the 23 stored spellings', () => {
  it('folds case variants onto one value', () => {
    expect(canonicalizeRegion('CENTRAL FLORIDA')).toBe('Central Florida')
    expect(canonicalizeRegion('Central Florida')).toBe('Central Florida')
    expect(canonicalizeRegion('SOUTHWEST FLORIDA')).toBe('Southwest Florida')
    expect(canonicalizeRegion('NORTH FLORIDA / PANHANDLE')).toBe('North Florida / Panhandle')
  })

  it('folds all three Tampa Bay spellings onto one value', () => {
    const expected = 'West Central Florida / Tampa Bay'
    expect(canonicalizeRegion('WEST CENTRAL FLORIDA (TAMPA BAY)')).toBe(expected)
    expect(canonicalizeRegion('West Central Florida / Tampa Bay')).toBe(expected)
    expect(canonicalizeRegion('West Central Florida')).toBe(expected)
  })

  it('keeps the Minnesota regions distinct', () => {
    expect(canonicalizeRegion('Southeast Minnesota')).toBe('Southeast Minnesota')
    expect(canonicalizeRegion('South Central Minnesota')).toBe('South Central Minnesota')
    expect(canonicalizeRegion('Twin Cities Metro')).toBe('Twin Cities Metro')
  })

  it('returns null for unknown or empty input', () => {
    expect(canonicalizeRegion('Atlantis')).toBeNull()
    expect(canonicalizeRegion('')).toBeNull()
    expect(canonicalizeRegion(null)).toBeNull()
    expect(canonicalizeRegion(42)).toBeNull()
  })

  it('every canonical region round-trips through itself', () => {
    for (const region of CANONICAL_REGIONS) {
      expect(canonicalizeRegion(region)).toBe(region)
    }
  })
})

describe('sanitizeRegion', () => {
  it('passes an unrecognised region through rather than deleting it', () => {
    expect(sanitizeRegion('Some New Region')).toBe('Some New Region')
  })

  it('still canonicalizes what it recognises', () => {
    expect(sanitizeRegion('SOUTH FLORIDA')).toBe('South Florida')
  })

  it('collapses whitespace', () => {
    expect(sanitizeRegion('  Odd    Region  ')).toBe('Odd Region')
  })
})

describe('regionsForState', () => {
  it('scopes options to the state', () => {
    expect(regionsForState('FL')).toContain('Florida Keys')
    expect(regionsForState('FL')).not.toContain('Twin Cities Metro')
    expect(regionsForState('MN')).toContain('Twin Cities Metro')
    expect(regionsForState(null)).toEqual(CANONICAL_REGIONS)
  })
})

describe('canonicalizeCounty — reconciling the two stored formats', () => {
  it('strips the suffix that only the lawyers table carries', () => {
    expect(canonicalizeCounty('Orange County')).toBe('Orange')
    expect(canonicalizeCounty('Polk County')).toBe('Polk')
  })

  it('leaves the bare form the clinics table uses', () => {
    expect(canonicalizeCounty('Escambia')).toBe('Escambia')
  })

  it('makes both tables agree', () => {
    expect(canonicalizeCounty('Orange County')).toBe(canonicalizeCounty('Orange'))
  })

  it('preserves meaningful casing in county names', () => {
    expect(canonicalizeCounty('Miami-Dade')).toBe('Miami-Dade')
    expect(canonicalizeCounty('St. Louis')).toBe('St. Louis')
  })

  it('title-cases an ALL-CAPS import', () => {
    expect(canonicalizeCounty('ORANGE CO.')).toBe('Orange')
  })

  it('returns null for empty input', () => {
    expect(canonicalizeCounty('')).toBeNull()
    expect(canonicalizeCounty('   ')).toBeNull()
    expect(canonicalizeCounty(null)).toBeNull()
  })
})

describe('countyLabel', () => {
  it('adds the suffix for display', () => {
    expect(countyLabel('Orange')).toBe('Orange County')
  })

  it('is idempotent — never doubles the suffix', () => {
    expect(countyLabel('Orange County')).toBe('Orange County')
    expect(countyLabel(countyLabel('Orange'))).toBe('Orange County')
  })

  it('returns null when there is no county', () => {
    expect(countyLabel(null)).toBeNull()
  })
})
