import { describe, expect, it } from 'vitest'
import {
  CLINIC_SPECIALTIES,
  normalizeSpecialties,
  normalizeSpecialty,
  resolveSpecialtyCatalog,
  sanitizeSpecialties,
  sanitizeSpecialty,
  FEATURED_SPECIALTIES,
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

describe('normalizeSpecialty — the vocabulary the NPPES registry speaks', () => {
  it('carries Neurosurgery in the catalog', () => {
    // Before the August 2026 import there was no neurosurgical tag at any
    // level: not in the catalog, not in the aliases, not on a single clinic.
    expect(CLINIC_SPECIALTIES).toContain('Neurosurgery')
  })

  it('maps the exact strings the registry returns', () => {
    // Copied from real `taxonomies[].desc` values. NPPES spells it with the
    // 'ae', which the catalog did not previously recognise at all.
    expect(normalizeSpecialty('Neurological Surgery')).toBe('Neurosurgery')
    expect(normalizeSpecialty('Orthopaedic Surgery')).toBe('Orthopedics')
    expect(normalizeSpecialty('Orthopaedic Surgery, Sports Medicine')).toBe('Sports Medicine')
    expect(normalizeSpecialty('Orthopaedic Surgery, Orthopaedic Surgery of the Spine')).toBe('Spine')
  })

  it('lands the subspecialties on tags that already existed', () => {
    // Eight NPPES subspecialties onto three catalog values. A tag each would
    // split one count eight ways and bury every one of them under the fold.
    for (const desc of [
      'Orthopaedic Surgery, Hand Surgery',
      'Orthopaedic Surgery, Foot and Ankle Surgery',
      'Orthopaedic Surgery, Orthopaedic Trauma',
      'Orthopaedic Surgery, Pediatric Orthopaedic Surgery',
      'Orthopaedic Surgery, Adult Reconstructive Orthopaedic Surgery',
    ]) {
      expect(normalizeSpecialty(desc)).toBe('Orthopedics')
    }
  })

  it('keeps neuro rehabilitation and neurosurgery apart', () => {
    expect(normalizeSpecialty('Neurological Rehabilitation')).toBe('Neurological Rehabilitation')
    expect(normalizeSpecialty('neurosurgeon')).toBe('Neurosurgery')
    // Bare 'neuro' deliberately stays with rehab. It is what the stored rows
    // mean, and the lenient path would otherwise pass it through as a literal
    // tag — one more chip on the map. The query side reaches both instead.
    expect(normalizeSpecialty('neuro')).toBe('Neurological Rehabilitation')
  })

  it('reads Spanish, accented or not', () => {
    expect(normalizeSpecialty('ortopedista')).toBe('Orthopedics')
    expect(normalizeSpecialty('traumatología')).toBe('Orthopedics')
    expect(normalizeSpecialty('Neurocirugía')).toBe('Neurosurgery')
    expect(normalizeSpecialty('neurocirujano')).toBe('Neurosurgery')
    expect(normalizeSpecialty('columna')).toBe('Spine')
  })

  it('folds diacritics without disturbing anything that has none', () => {
    // The guarantee that made adding NFD folding safe: no catalog entry and no
    // alias key carries an accent, so every pre-existing lookup is unchanged.
    for (const specialty of CLINIC_SPECIALTIES) {
      expect(normalizeSpecialty(specialty)).toBe(specialty)
    }
  })
})

describe('FEATURED_SPECIALTIES', () => {
  it('names only values that exist in the catalog', () => {
    // A typo here fails silently: the chip simply never gets promoted, and
    // nothing anywhere says why.
    for (const specialty of FEATURED_SPECIALTIES) {
      expect(CLINIC_SPECIALTIES).toContain(specialty)
    }
  })

  it('is the two the client asked for, in that order', () => {
    expect(FEATURED_SPECIALTIES).toEqual(['Orthopedics', 'Neurosurgery'])
  })
})

describe('specialtyTypeForClinicTags — reaching a surgeon', () => {
  it('routes a neurosurgical clinic to the Neurosurgeon type', () => {
    expect(specialtyTypeForClinicTags(['Neurosurgery'])).toBe('Neurosurgeon')
  })

  it('routes the Orthopedics tag to a surgeon, and rehab to an orthopedist', () => {
    // 'Orthopedics' appears under both types, and the reverse index is built
    // by flatMap, so the later key wins. That lands on 'Orthopedic Surgeon',
    // which is the right answer now that the tag comes off a surgical
    // taxonomy in the registry rather than off one lone imported row.
    expect(specialtyTypeForClinicTags(['Orthopedics'])).toBe('Orthopedic Surgeon')
    expect(specialtyTypeForClinicTags(['Orthopedic Rehabilitation'])).toBe('Orthopedist')
  })
})
