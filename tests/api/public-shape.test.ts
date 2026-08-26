import { describe, expect, it } from 'vitest'
import {
  toPublicClinic,
  toPublicClinics,
  toPublicLawyer,
  toPublicLawyers,
} from '@/lib/api/public-shape'
import type { DecoratedClinic, DecoratedLawyer } from '@/types/professionals'

/**
 * Guards the privacy boundary shared by /api/professionals/clinics,
 * /api/professionals/lawyers and /api/partners/clinics.
 *
 * These three routes each used to strip contact details with their own inline
 * destructure, which is exactly the kind of duplication that drifts — and a
 * divergence here leaks a provider's direct line, not just a cosmetic detail.
 */

const CLINIC: DecoratedClinic = {
  id: 'c-1',
  name: 'Newlin Chiropractic',
  address: '1117 N Palafox St, Pensacola, FL 32501',
  lat: 30.4243,
  lng: -87.2181,
  phone: '(850) 433-1111',
  specialties: ['Chiropractic'],
  email: '',
  website: 'https://example.test',
  region: 'North Florida / Panhandle',
  county: 'Escambia',
  available: true,
  city: 'Pensacola',
  state: 'FL',
  zipCode: '32501',
  // Present so "leaks no street detail" is testing something.
  //
  // `toPublicClinic` withholds by destructuring named fields out and spreading
  // the rest, so a new column is public by default. Before `street` existed the
  // Palafox assertion below passed because the only place that string appeared
  // was `address`. With the column and without it in the fixture, the same
  // assertion would keep passing while the route started publishing the street.
  street: '1117 N Palafox St',
  placeId: 'nominatim-123',
  placeProvider: 'nominatim',
  geocodePrecision: 'rooftop',
  geocodedAt: '2026-08-25T00:00:00.000Z',
}

const LAWYER: DecoratedLawyer = {
  id: 'l-1',
  name: 'Bogin Munns & Munns PA',
  address: '2601 Technology Dr, Orlando, FL 32804',
  lat: 28.5383,
  lng: -81.3792,
  phone: '(407) 555-0100',
  practiceAreas: ['Personal Injury'],
  email: '',
  region: 'Orlando',
  county: 'Orange',
  zipCode: '32804',
  available: true,
  city: 'Orlando',
  state: 'FL',
  street: '2601 Technology Dr',
  placeId: 'nominatim-456',
  placeProvider: 'nominatim',
  geocodePrecision: 'rooftop',
  geocodedAt: '2026-08-25T00:00:00.000Z',
}

describe('toPublicClinic', () => {
  const result = toPublicClinic(CLINIC) as Record<string, unknown>

  it('withholds the direct contact details', () => {
    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('address')
  })

  it('keeps coarse location, without which ZIP and city search cannot work', () => {
    expect(result.city).toBe('Pensacola')
    expect(result.state).toBe('FL')
    expect(result.zipCode).toBe('32501')
  })

  it('leaks no street detail through another field', () => {
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('Palafox')
    expect(serialized).not.toContain('433-1111')
  })

  it('withholds the structured street column, not just the free-text address', () => {
    expect(result).not.toHaveProperty('street')
  })

  it('withholds the geocoding bookkeeping, which no client needs', () => {
    expect(result).not.toHaveProperty('placeId')
    expect(result).not.toHaveProperty('placeProvider')
    expect(result).not.toHaveProperty('geocodePrecision')
    expect(result).not.toHaveProperty('geocodedAt')
  })

  it('keeps everything else the map needs', () => {
    expect(result).toMatchObject({
      id: 'c-1',
      name: 'Newlin Chiropractic',
      lat: 30.4243,
      lng: -87.2181,
      specialties: ['Chiropractic'],
      region: 'North Florida / Panhandle',
      county: 'Escambia',
      available: true,
    })
  })

  it('does not mutate the input', () => {
    expect(CLINIC.phone).toBe('(850) 433-1111')
    expect(CLINIC.address).toContain('Palafox')
  })
})

describe('toPublicLawyer', () => {
  const result = toPublicLawyer(LAWYER) as Record<string, unknown>

  it('withholds the direct contact details', () => {
    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('address')
  })

  it('keeps coarse location', () => {
    expect(result.city).toBe('Orlando')
    expect(result.state).toBe('FL')
    expect(result.zipCode).toBe('32804')
  })

  it('keeps the practice areas the directory filters on', () => {
    expect(result.practiceAreas).toEqual(['Personal Injury'])
  })

  it('withholds the structured street column and the geocoding bookkeeping', () => {
    expect(result).not.toHaveProperty('street')
    expect(result).not.toHaveProperty('placeId')
    expect(JSON.stringify(result)).not.toContain('Technology Dr')
  })
})

describe('list helpers apply the same shape', () => {
  it('maps every clinic', () => {
    const [only] = toPublicClinics([CLINIC]) as Record<string, unknown>[]
    expect(only).not.toHaveProperty('phone')
    expect(only.city).toBe('Pensacola')
  })

  it('maps every lawyer', () => {
    const [only] = toPublicLawyers([LAWYER]) as Record<string, unknown>[]
    expect(only).not.toHaveProperty('address')
    expect(only.city).toBe('Orlando')
  })

  it('handles empty input', () => {
    expect(toPublicClinics([])).toEqual([])
    expect(toPublicLawyers([])).toEqual([])
  })
})
