import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The route's corpus now comes from a tagged `unstable_cache` entry, so
 * that a database-only import can purge it. `unstable_cache` needs
 * Next's incremental cache context, which does not exist here — record
 * the registration and hand back the function.
 */
const { cacheRegistrations } = vi.hoisted(() => ({
  cacheRegistrations: [] as { keys: unknown; options: unknown }[],
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, keys: unknown, options: unknown) => {
    cacheRegistrations.push({ keys, options })
    return fn
  },
}))

vi.mock('@/lib/data', () => ({
  getPublicDirectoryLawyers: vi.fn(),
  getPracticeAreaCatalog: vi.fn(),
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
    expect(res.headers.get('Cache-Control')).toContain('public')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
  })

  /**
   * The directory grows by running an importer against Supabase: a
   * database-only write, with no deploy and no request to this app.
   * The tag is the only thing that lets that write reach visitors — it
   * is what `/api/revalidate/directory` purges. Without it the previous
   * payload keeps being served, which is exactly how 451 new firms
   * (Bradenton among them) stayed invisible for a day.
   */
  it('caches the corpus under the tag the importer purges', () => {
    const listings = cacheRegistrations.find((r) =>
      (r.keys as string[])?.includes('public-lawyer-directory-listings')
    )
    expect(listings).toBeDefined()
    expect((listings!.options as { tags?: string[] }).tags).toContain('lawyer-directory')
  })

  it('does not hold the corpus long enough to outlive a missed purge', async () => {
    // The old header was s-maxage=3600 + stale-while-revalidate=86400.
    // A write that forgets to purge — a row edited by hand in Supabase,
    // an admin flipping directory_public — stayed invisible for 25
    // hours. This bounds the same mistake at fifteen minutes.
    const control = (await GET()).headers.get('Cache-Control') ?? ''
    const maxAge = Number(/s-maxage=(\d+)/.exec(control)?.[1])
    const stale = Number(/stale-while-revalidate=(\d+)/.exec(control)?.[1])
    expect(maxAge + stale).toBeLessThanOrEqual(900)
  })

  it('degrades to an empty list, uncached, rather than a cached 500', async () => {
    mockedData.getPublicDirectoryLawyers.mockRejectedValue(new Error('db down'))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    // Caching the failure would keep the directory broken for an hour
    // after the database came back. This is also why the route stays
    // dynamic instead of carrying `export const revalidate`: that would
    // put THIS response in Next's cache too.
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

/**
 * `region` on a lawyer row usually holds the RECOGNISABLE city — four
 * published firms sit in Brent, Wright, Mango and Belleair, and their
 * regions say Pensacola, Fort Walton Beach, Tampa and Clearwater, which
 * is what anyone would search for. So region-first is right, until the
 * region is not a city at all.
 */
describe('the city a listing reports', () => {
  const listingFor = async (over: Record<string, unknown>) => {
    mockedData.getPublicDirectoryLawyers.mockResolvedValue([{ ...FIRM, ...over }] as never)
    const [firm] = await (await GET()).json()
    return firm
  }

  it('prefers the region when it names a real place', async () => {
    const firm = await listingFor({ city: 'Brent', region: 'Pensacola' })
    expect(firm.city).toBe('Pensacola')
  })

  /**
   * Rows created through /admin carry a genuine region. Czaia Law's is
   * "Southwest Florida", and region-first published the firm as being
   * in a city by that name — so it never appeared under Bradenton and
   * could not be found by the name of the town it is in.
   */
  it('falls back to the postal city when the region is a region', async () => {
    const firm = await listingFor({ city: 'Bradenton', region: 'Southwest Florida' })
    expect(firm.city).toBe('Bradenton')
  })

  it('falls back when the region is not a place at all', async () => {
    const firm = await listingFor({ city: 'Pensacola', region: 'Pensacola Area' })
    expect(firm.city).toBe('Pensacola')
  })

  it('still uses the region when there is no city', async () => {
    const firm = await listingFor({ city: null, region: 'Orlando' })
    expect(firm.city).toBe('Orlando')
  })

  it('reports nothing rather than guessing', async () => {
    const firm = await listingFor({ city: null, region: null })
    expect(firm.city).toBeNull()
  })
})
