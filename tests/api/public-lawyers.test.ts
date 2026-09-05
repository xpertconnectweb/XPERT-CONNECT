import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data', () => ({
  getPublicDirectoryLawyers: vi.fn(),
}))

import { GET } from '@/app/api/public/lawyers/route'
import * as data from '@/lib/data'

const mockedData = vi.mocked(data)

/**
 * A decorated lawyer as the data layer hands one over — every field the
 * route could possibly forward, so a leak has something to leak.
 */
const FIRM = {
  id: 'l-001',
  name: 'Bogin Munns & Munns PA',
  address: '1000 Legion Pl #1000, Orlando, FL 32801',
  lat: 28.54,
  lng: -81.37,
  phone: '(407) 578-9696',
  email: 'private@firm.example',
  practiceAreas: ['Business Law'],
  website: 'https://example.com',
  region: 'Orlando',
  county: 'Orange',
  zipCode: '32801',
  available: true,
  directoryPublic: true,
  street: '1000 Legion Pl #1000',
  city: 'Orlando',
  state: 'FL',
  placeId: 'place-abc',
  placeProvider: 'selfhosted',
  geocodePrecision: 'rooftop',
  geocodedAt: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedData.getPublicDirectoryLawyers.mockResolvedValue([{ ...FIRM }] as never)
})

describe('GET /api/public/lawyers', () => {
  it('answers an unauthenticated request', async () => {
    // No session, no requireAuth import, no 401. This is the only read
    // route in the project where that is the correct behaviour.
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('RETURNS phone and address — a directory you cannot call is useless', async () => {
    const [firm] = await (await GET()).json()
    expect(firm.phone).toBe('(407) 578-9696')
    expect(firm.address).toBe('1000 Legion Pl #1000, Orlando, FL 32801')
    expect(firm.website).toBe('https://example.com')
  })

  it('withholds internal bookkeeping and the firm email', async () => {
    const [firm] = await (await GET()).json()
    for (const field of [
      'email',
      'street',
      'placeId',
      'placeProvider',
      'geocodePrecision',
      'geocodedAt',
      'available',
      'directoryPublic',
    ]) {
      expect(firm, `${field} must not reach the public directory`).not.toHaveProperty(field)
    }
  })

  it('is an allowlist, so an unknown column cannot ride along', async () => {
    mockedData.getPublicDirectoryLawyers.mockResolvedValue([
      { ...FIRM, someColumnAddedNextYear: 'secret' },
    ] as never)
    const [firm] = await (await GET()).json()
    expect(firm).not.toHaveProperty('someColumnAddedNextYear')
  })

  it('canonicalizes practice areas so the category cards do not split', async () => {
    mockedData.getPublicDirectoryLawyers.mockResolvedValue([
      { ...FIRM, practiceAreas: ['personal injury', 'accident'] },
    ] as never)
    const [firm] = await (await GET()).json()
    expect(firm.practiceAreas).toEqual(['Personal Injury'])
  })

  it('is cacheable by the CDN — one document for the whole world', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(res.headers.get('Cache-Control')).toContain('public')
  })

  it('degrades to an empty list, uncached, rather than a cached 500', async () => {
    mockedData.getPublicDirectoryLawyers.mockRejectedValue(new Error('db down'))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    // Caching the failure would keep the directory broken for an hour
    // after the database came back.
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
