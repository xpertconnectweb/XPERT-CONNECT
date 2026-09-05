import { beforeEach, describe, expect, it, vi } from 'vitest'

// `unstable_cache` runs at module scope, and the module also pulls in the
// Supabase-backed data layer. Neither is under test here — `pickShowcase`
// is a pure function and that is the part with a real invariant.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock('@/lib/data', () => ({
  getPublicDirectoryLawyers: vi.fn(),
  getPracticeAreaCatalog: vi.fn(),
}))

import { pickShowcase, getDirectorySummary } from '@/lib/directory-summary'
import * as data from '@/lib/data'
import type { DirectoryListing } from '@/types/professionals'

const mockedData = vi.mocked(data)

const CATALOG = [
  'Personal Injury',
  'Criminal Defense',
  'Family Law',
  'Estate Planning',
  'Immigration',
]

function firm(
  id: string,
  areas: string[],
  city: string
): DirectoryListing {
  return {
    id,
    name: `Firm ${id}`,
    address: `1 Main St, ${city}, FL 33101`,
    phone: '(305) 555-0100',
    practiceAreas: areas,
    city,
    county: 'Miami-Dade',
    zipCode: '33101',
    state: 'FL',
    lat: 25.77,
    lng: -80.19,
  }
}

/**
 * Deliberately lopsided, the way the real corpus is: Criminal Defense
 * outnumbers everything and Orlando outnumbers everywhere.
 */
const CORPUS: DirectoryListing[] = [
  ...Array.from({ length: 12 }, (_, i) =>
    firm(`l-0${10 + i}`, ['Criminal Defense'], 'Orlando')
  ),
  firm('l-100', ['Personal Injury'], 'Miami'),
  firm('l-101', ['Personal Injury'], 'Tampa'),
  firm('l-102', ['Family Law'], 'Jacksonville'),
  firm('l-103', ['Estate Planning'], 'Naples'),
  firm('l-104', ['Immigration'], 'Hialeah'),
]

describe('pickShowcase', () => {
  it('is deterministic — the same input gives the same rows every time', () => {
    // Not a nicety: the server renders these and the client hydrates
    // over them, so a random pick is a hydration mismatch. It would also
    // make every screenshot of the landing page different.
    const first = pickShowcase(CORPUS, CATALOG, 5).map((f) => f.id)
    for (let i = 0; i < 50; i++) {
      expect(pickShowcase(CORPUS, CATALOG, 5).map((f) => f.id)).toEqual(first)
    }
  })

  it('spreads across practice areas instead of showing twelve of the biggest', () => {
    const areas = pickShowcase(CORPUS, CATALOG, 5).flatMap((f) => f.practiceAreas)
    expect(new Set(areas).size).toBe(5)
  })

  it('spreads across cities', () => {
    const cities = pickShowcase(CORPUS, CATALOG, 5).map((f) => f.city)
    expect(new Set(cities).size).toBeGreaterThanOrEqual(4)
  })

  it('never repeats a firm', () => {
    const ids = pickShowcase(CORPUS, CATALOG, 9).map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tops up from the remainder when the catalog runs out', () => {
    expect(pickShowcase(CORPUS, CATALOG, 9)).toHaveLength(9)
  })

  it('returns what it has rather than padding when the corpus is small', () => {
    expect(pickShowcase(CORPUS.slice(0, 2), CATALOG, 9)).toHaveLength(2)
  })

  it('survives an empty corpus', () => {
    expect(pickShowcase([], CATALOG, 9)).toEqual([])
  })
})

/**
 * The catalog the public directory browses by is not simply the admin's
 * `practice_areas_list`. Production showed why: that setting omits
 * Estate Planning and Business Law, which between them account for 58
 * of the 176 published firms. Those firms rendered their area as a pill
 * on every row while having no card to browse them by.
 */
describe('getDirectorySummary — practice-area catalog', () => {
  const lawyer = (id: string, areas: string[]) => ({
    id,
    name: `Firm ${id}`,
    address: `1 Main St, Orlando, FL 32801`,
    lat: 28.5,
    lng: -81.3,
    phone: '(407) 555-0100',
    email: '',
    practiceAreas: areas,
    website: '',
    region: 'Orlando',
    county: 'Orange',
    zipCode: '32801',
    available: true,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockedData.getPublicDirectoryLawyers.mockResolvedValue([
      lawyer('l-001', ['Criminal Defense']),
      lawyer('l-002', ['Estate Planning']),
      lawyer('l-003', ['Estate Planning']),
      lawyer('l-004', ['Business Law']),
    ] as never)
  })

  it('surfaces an area that has firms even when the admin list omits it', async () => {
    mockedData.getPracticeAreaCatalog.mockResolvedValue(['Criminal Defense'] as never)

    const summary = await getDirectorySummary(9)
    const areas = summary.counts.map(([a]) => a)

    expect(areas).toContain('Estate Planning')
    expect(areas).toContain('Business Law')
    expect(summary.counts).toContainEqual(['Estate Planning', 2])
  })

  it('keeps the admin ordering first, then the busiest of the rest', async () => {
    mockedData.getPracticeAreaCatalog.mockResolvedValue(['Criminal Defense'] as never)

    const summary = await getDirectorySummary(9)
    expect(summary.counts.map(([a]) => a)).toEqual([
      'Criminal Defense', // configured, so first regardless of count
      'Estate Planning', // 2
      'Business Law', // 1
    ])
  })

  it('drops a configured area that has no firms behind it', async () => {
    mockedData.getPracticeAreaCatalog.mockResolvedValue([
      'Criminal Defense',
      'Bankruptcy',
    ] as never)

    const summary = await getDirectorySummary(9)
    expect(summary.counts.map(([a]) => a)).not.toContain('Bankruptcy')
  })

  it('returns an empty summary rather than throwing when the database is down', async () => {
    // The landing page renders this. A thrown error here would take the
    // whole marketing site down, not just one section.
    mockedData.getPublicDirectoryLawyers.mockRejectedValue(new Error('db down'))
    mockedData.getPracticeAreaCatalog.mockResolvedValue([] as never)

    const summary = await getDirectorySummary(9)
    expect(summary.total).toBe(0)
    expect(summary.showcase).toEqual([])
  })
})
