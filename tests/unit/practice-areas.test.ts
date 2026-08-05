import { describe, expect, it } from 'vitest'
import {
  PRACTICE_AREAS,
  normalizePracticeArea,
  normalizePracticeAreas,
  sanitizePracticeArea,
  sanitizePracticeAreas,
  resolveCatalog,
} from '@/lib/practice-areas'
import { VALID_PRACTICE_AREAS } from '@/lib/validation'

describe('PRACTICE_AREAS catalog', () => {
  it('matches the eight areas present in the production data', () => {
    expect([...PRACTICE_AREAS].sort()).toEqual(
      [
        'Business Law',
        'Civil Litigation',
        'Criminal Defense',
        'Estate Planning',
        'Family Law',
        'Immigration',
        'Personal Injury',
        'Real Estate Law',
      ].sort()
    )
  })

  it('is re-exported as VALID_PRACTICE_AREAS', () => {
    expect(VALID_PRACTICE_AREAS).toEqual(PRACTICE_AREAS)
  })
})

describe('normalizePracticeArea (strict)', () => {
  it('passes canonical values through', () => {
    expect(normalizePracticeArea('Family Law')).toBe('Family Law')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(normalizePracticeArea('  criminal   defense ')).toBe('Criminal Defense')
    expect(normalizePracticeArea('PERSONAL INJURY')).toBe('Personal Injury')
  })

  it('resolves the vocabulary the client actually uses', () => {
    expect(normalizePracticeArea('injury')).toBe('Personal Injury')
    expect(normalizePracticeArea('criminal')).toBe('Criminal Defense')
    expect(normalizePracticeArea('family')).toBe('Family Law')
  })

  it('rejects the CSV headers that leaked into the data set', () => {
    expect(normalizePracticeArea('Especialidad')).toBeNull()
    expect(normalizePracticeArea('Región')).toBeNull()
    expect(normalizePracticeArea('Condado')).toBeNull()
  })

  it('rejects anything else', () => {
    expect(normalizePracticeArea('Maritime Law')).toBeNull()
    expect(normalizePracticeArea('')).toBeNull()
    expect(normalizePracticeArea('   ')).toBeNull()
    expect(normalizePracticeArea(null)).toBeNull()
    expect(normalizePracticeArea(42)).toBeNull()
  })

  it('drops unknowns and duplicates from a list', () => {
    expect(
      normalizePracticeAreas(['injury', 'Personal Injury', 'Especialidad', 'Maritime Law'])
    ).toEqual(['Personal Injury'])
    expect(normalizePracticeAreas('not an array')).toEqual([])
  })
})

describe('sanitizePracticeArea (lenient — the read/write path)', () => {
  it('canonicalizes what it recognises', () => {
    expect(sanitizePracticeArea('injury')).toBe('Personal Injury')
    expect(sanitizePracticeArea('estate')).toBe('Estate Planning')
  })

  it('still rejects known junk', () => {
    expect(sanitizePracticeArea('Especialidad')).toBeNull()
    expect(sanitizePracticeArea('  ')).toBeNull()
  })

  /**
   * Admins can add their own areas in /admin/settings, so an unknown
   * value is kept rather than silently deleted. The strict variant above
   * is what would break that.
   */
  it('preserves admin-defined areas', () => {
    expect(sanitizePracticeArea('  Maritime   Law ')).toBe('Maritime Law')
  })

  it('dedupes a list while preserving order', () => {
    expect(
      sanitizePracticeAreas(['criminal', 'Criminal Defense', 'Maritime Law', 'Especialidad'])
    ).toEqual(['Criminal Defense', 'Maritime Law'])
  })
})

describe('resolveCatalog', () => {
  it('falls back to the canonical list when nothing is stored', () => {
    expect(resolveCatalog(undefined)).toEqual([...PRACTICE_AREAS])
    expect(resolveCatalog([])).toEqual([...PRACTICE_AREAS])
    expect(resolveCatalog('nonsense')).toEqual([...PRACTICE_AREAS])
  })

  it('honours the admin ordering and drops blanks/duplicates', () => {
    expect(resolveCatalog(['Family Law', '  ', 'Family Law', 'Maritime Law'])).toEqual([
      'Family Law',
      'Maritime Law',
    ])
  })
})
