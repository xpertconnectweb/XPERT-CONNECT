import { describe, expect, it } from 'vitest'
import {
  CLINIC_SPECIALTIES,
  normalizeSpecialties,
  normalizeSpecialty,
  resolveSpecialtyCatalog,
  sanitizeSpecialties,
  sanitizeSpecialty,
} from '@/lib/clinic-specialties'
import {
  SPECIALTY_TYPE_TO_CLINIC_TAGS,
  specialtyTypeForClinicTags,
} from '@/lib/medical-specialties'

describe('normalizeSpecialty — reconciling stored duplicates', () => {
  it('folds the three real duplicates found in the corpus', () => {
    expect(normalizeSpecialty('Chiropractic Care')).toBe('Chiropractic')
    expect(normalizeSpecialty('PIP')).toBe('PIP Claims')
    expect(normalizeSpecialty('Spine & Trauma')).toBe('Spine')
  })

  it('keeps Orthopedics and Orthopedic Rehabilitation distinct', () => {
    // A clinic doing orthopedic rehab is not an orthopedist's office; merging
    // them would send referrals to the wrong kind of provider.
    expect(normalizeSpecialty('Orthopedics')).toBe('Orthopedics')
    expect(normalizeSpecialty('Orthopedic Rehabilitation')).toBe('Orthopedic Rehabilitation')
    expect(normalizeSpecialty('Orthopedics')).not.toBe(
      normalizeSpecialty('Orthopedic Rehabilitation')
    )
  })

  it('accepts the vocabulary a human would type', () => {
    expect(normalizeSpecialty('chiro')).toBe('Chiropractic')
    expect(normalizeSpecialty('ortho')).toBe('Orthopedics')
    expect(normalizeSpecialty('PT')).toBe('Physical Therapy')
    expect(normalizeSpecialty('workers comp')).toBe('Work Injury Rehabilitation')
  })

  it('is case and spacing insensitive', () => {
    expect(normalizeSpecialty('  CHIROPRACTIC   CARE ')).toBe('Chiropractic')
  })

  it('rejects spreadsheet headers imported as data', () => {
    expect(normalizeSpecialty('Especialidad')).toBeNull()
    expect(normalizeSpecialty('Specialty')).toBeNull()
    expect(normalizeSpecialty('N/A')).toBeNull()
    expect(normalizeSpecialty('-')).toBeNull()
  })

  it('returns null for values outside the catalog', () => {
    expect(normalizeSpecialty('Underwater Basket Weaving')).toBeNull()
  })

  it('every canonical specialty round-trips', () => {
    for (const specialty of CLINIC_SPECIALTIES) {
      expect(normalizeSpecialty(specialty)).toBe(specialty)
    }
  })
})

describe('sanitizeSpecialty — the lenient read/write path variant', () => {
  it('preserves an admin-defined specialty rather than deleting it', () => {
    expect(sanitizeSpecialty('Underwater Basket Weaving')).toBe('Underwater Basket Weaving')
  })

  it('still canonicalizes and still rejects junk', () => {
    expect(sanitizeSpecialty('Chiropractic Care')).toBe('Chiropractic')
    expect(sanitizeSpecialty('Especialidad')).toBeNull()
  })
})

describe('specialty lists', () => {
  it('dedupes after canonicalization', () => {
    expect(sanitizeSpecialties(['Chiropractic', 'Chiropractic Care', 'chiro'])).toEqual([
      'Chiropractic',
    ])
  })

  it('drops junk from a mixed list', () => {
    expect(normalizeSpecialties(['Chiropractic', 'N/A', 'Nonsense'])).toEqual(['Chiropractic'])
  })

  it('returns empty for non-arrays', () => {
    expect(sanitizeSpecialties(null)).toEqual([])
    expect(sanitizeSpecialties('Chiropractic')).toEqual([])
  })
})

describe('resolveSpecialtyCatalog', () => {
  it('falls back to the canonical list', () => {
    expect(resolveSpecialtyCatalog(null)).toEqual([...CLINIC_SPECIALTIES])
    expect(resolveSpecialtyCatalog([])).toEqual([...CLINIC_SPECIALTIES])
  })

  it('honours admin ordering and dedupes', () => {
    expect(resolveSpecialtyCatalog(['Spine', 'Chiropractic', 'Spine'])).toEqual([
      'Spine',
      'Chiropractic',
    ])
  })
})

describe('SPECIALTY_TYPE_TO_CLINIC_TAGS stays in step with the catalog', () => {
  it('references only tags that exist in the canonical vocabulary', () => {
    // The original map pointed at 'Neurology', 'Radiology', 'Family Medicine'
    // and others that appear on zero clinics, so three specialist types matched
    // nothing. This guards against that drifting back.
    const catalog = new Set<string>(CLINIC_SPECIALTIES)
    for (const [type, tags] of Object.entries(SPECIALTY_TYPE_TO_CLINIC_TAGS)) {
      for (const tag of tags) {
        expect(catalog.has(tag), `${type} -> "${tag}" is not a canonical specialty`).toBe(true)
      }
    }
  })
})

describe('specialtyTypeForClinicTags', () => {
  it('bridges clinic tags back to a specialist type', () => {
    expect(specialtyTypeForClinicTags(['Physical Therapy'])).toBe('Physical Therapist')
    expect(specialtyTypeForClinicTags(['Orthopedic Rehabilitation'])).toBe('Orthopedist')
    expect(specialtyTypeForClinicTags(['Pain Management'])).toBe('Pain Management')
  })

  it('is case-insensitive and skips unmapped tags', () => {
    expect(specialtyTypeForClinicTags(['Auto Injuries', 'physical therapy'])).toBe(
      'Physical Therapist'
    )
  })

  it('returns null when nothing maps', () => {
    expect(specialtyTypeForClinicTags(['Auto Injuries'])).toBeNull()
    expect(specialtyTypeForClinicTags([])).toBeNull()
    expect(specialtyTypeForClinicTags(null)).toBeNull()
  })
})
