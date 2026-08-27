import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { getClinics, getLawyers } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * PostgREST answers with at most 1000 rows and says nothing about the ones it
 * dropped: no error, no flag, no count. A truncated answer and a complete one
 * are the same shape, so nothing in the code could tell them apart.
 *
 * It went unnoticed for as long as the directory was under a thousand rows.
 * The August 2026 orthopedic import took it to 1031 clinics and the map began
 * reporting "999 results" — thirty-two clinics that existed, were geocoded and
 * were tagged, and that nobody could find.
 */

const mockedFrom = vi.mocked(supabaseAdmin.from)

/** One clinic-shaped row; only the fields the decorator touches matter. */
const row = (i: number) => ({
  id: `c-${i}`,
  name: `Clinic ${i}`,
  address: `${i} Main St, Tampa, FL 33601`,
  lat: 27.9 + i / 100000,
  lng: -82.4,
  phone: '',
  specialties: ['Orthopedics'],
  email: '',
  website: null,
  region: null,
  county: null,
  available: true,
  street: `${i} Main St`,
  city: 'Tampa',
  state: 'FL',
  zip_code: '33601',
  place_id: null,
  place_provider: null,
  geocode_precision: null,
  geocoded_at: null,
})

/**
 * Stands in for PostgREST: hands back at most `pageSize` rows per range, and
 * — this is the part that matters — never says that it did.
 */
function fakeTable(total: number, pageSize = 1000) {
  const ranges: [number, number][] = []
  const terminal = {
    range: (from: number, to: number) => {
      ranges.push([from, to])
      const slice = Array.from({ length: total }, (_, i) => row(i)).slice(
        from,
        Math.min(to + 1, from + pageSize)
      )
      return Promise.resolve({ data: slice, error: null })
    },
  }
  const builder = {
    select: () => builder,
    order: () => terminal,
    eq: () => builder,
    is: () => builder,
    ilike: () => builder,
  }
  return { builder, ranges }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getClinics — paging past the 1000-row answer', () => {
  it('returns every clinic when there are more than a thousand', async () => {
    const { builder, ranges } = fakeTable(1031)
    mockedFrom.mockReturnValue(builder as never)

    const clinics = await getClinics()

    expect(clinics).toHaveLength(1031)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('stops after one request when everything fits', async () => {
    const { builder, ranges } = fakeTable(697)
    mockedFrom.mockReturnValue(builder as never)

    const clinics = await getClinics()

    // A short page is the end of the data. Asking again would be a wasted
    // round trip on every page load in the product.
    expect(clinics).toHaveLength(697)
    expect(ranges).toHaveLength(1)
  })

  it('stops when the last page lands exactly on the boundary', async () => {
    const { builder, ranges } = fakeTable(2000)
    mockedFrom.mockReturnValue(builder as never)

    const clinics = await getClinics()

    // 2000 rows is two full pages, so it takes a third, empty request to know
    // the data ran out. That is the cost of an API that will not say.
    expect(clinics).toHaveLength(2000)
    expect(ranges).toHaveLength(3)
  })

  it('returns nothing rather than a partial answer on an error', async () => {
    const builder = {
      select: () => builder,
      order: () => ({
        range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
    }
    mockedFrom.mockReturnValue(builder as never)

    expect(await getClinics()).toEqual([])
  })
})

describe('getLawyers — the same read, the same ceiling', () => {
  it('pages too, so the firm directory cannot silently truncate later', async () => {
    const { builder, ranges } = fakeTable(1500)
    mockedFrom.mockReturnValue(builder as never)

    const lawyers = await getLawyers()

    expect(lawyers).toHaveLength(1500)
    expect(ranges).toHaveLength(2)
  })
})
