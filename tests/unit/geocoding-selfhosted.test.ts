import { describe, it, expect, vi } from 'vitest'
import { createSelfHostedProvider } from '@/lib/geocoding/selfhosted'
import type { StreetRow, StreetStore } from '@/lib/geocoding/street-index'
import { encodePoints } from '@/lib/geocoding/payload-codec'

/**
 * The self-hosted adapter, over a store that answers from memory.
 *
 * `createSelfHostedProvider` takes its store as an argument precisely so this is
 * possible: the ranking, the suggestion shape and the empty-answer rule can all
 * be exercised without a database, and the benchmark uses the same seam against
 * the real index.
 */

function street(over: Partial<StreetRow> = {}): StreetRow {
  return {
    id: 1,
    name_norm: '62nd st cir e',
    name_display: '62nd Street Cir E',
    city: 'Bradenton',
    state: 'FL',
    zip: '34208',
    num_min: 800,
    num_max: 900,
    lat_min: 27.491,
    lat_max: 27.492,
    lng_min: -82.482,
    lng_max: -82.481,
    point_count: 40,
    score: 0.9,
    ...over,
  }
}

function storeOf(options: { rows?: StreetRow[]; covers?: boolean } = {}): StreetStore {
  const rows = options.rows ?? []
  const payload = encodePoints([{ number: 862, lat: 27.491257, lng: -82.481824 }])

  return {
    search: vi.fn(async () => rows),
    payloads: vi.fn(async (ids) => new Map(ids.map((id) => [id, payload]))),
    covers: vi.fn(async () => options.covers ?? false),
  }
}

describe('the self-hosted provider', () => {
  it('resolves a house number the register holds, and calls it rooftop', async () => {
    const provider = createSelfHostedProvider(storeOf({ rows: [street()] }))
    const result = await provider.autocomplete('862 62nd St Cir E, Bradenton, FL 34208', {
      limit: 5,
      state: 'FL',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toHaveLength(1)
    expect(result.value[0]).toMatchObject({
      precision: 'rooftop',
      providerId: 'selfhosted',
      needsResolve: false,
    })
    expect(result.value[0].lat).toBeCloseTo(27.491257, 4)
  })

  it('says nothing when the query is too short to mean anything', async () => {
    const store = storeOf({ rows: [street()] })
    const result = await createSelfHostedProvider(store).autocomplete('86', { limit: 5 })

    expect(result.ok && result.value).toEqual([])
    // And does not go to the database to find that out.
    expect(store.search).not.toHaveBeenCalled()
  })
})

/**
 * The rule that decides whether an empty answer gets handed to Geoapify.
 *
 * Every case here is one the probe against production found or would have. The
 * one that prompted it: "9999999 Nowhere Rd, Bradenton, FL" fell through, and
 * Geoapify answered "1014 Baytree Road" at rooftop — a confident pin on a
 * different street, which is the failure this engine exists to stop producing.
 */
describe('when an empty answer is authoritative', () => {
  const ask = (query: string, covers: boolean, state?: string) =>
    createSelfHostedProvider(storeOf({ covers })).answersEmptyAuthoritatively!(query, {
      limit: 5,
      state: state ?? 'FL',
    })

  it('is authoritative about a house number in a place it holds the register for', async () => {
    await expect(ask('9999999 Nowhere Rd, Bradenton, FL 34208', true)).resolves.toBe(true)
  })

  /**
   * Houston County, Minnesota publishes no register. Every address in it is
   * absent from the index and none of those absences is evidence of anything.
   */
  it('is not authoritative where it holds no register', async () => {
    await expect(ask('183 Spruce St, Caledonia, MN 55921', false, 'MN')).resolves.toBe(false)
  })

  /**
   * A business name parses as a street. Declining these would lose the half of
   * the product this engine never claimed to serve — Geoapify finds the clinic.
   */
  it('is not authoritative without a house number', async () => {
    await expect(ask('Bayfront Health, Punta Gorda, FL', true)).resolves.toBe(false)
    await expect(ask('Bradenton, FL', true)).resolves.toBe(false)
    await expect(ask('34208', true)).resolves.toBe(false)
  })

  it('is not authoritative with no state to check coverage against', async () => {
    const provider = createSelfHostedProvider(storeOf({ covers: true }))
    await expect(provider.answersEmptyAuthoritatively!('9999999 Nowhere Rd', { limit: 5 })).resolves.toBe(false)
  })

  /** A store that cannot answer must not be read as "no coverage". */
  it('is not authoritative when the coverage check itself fails', async () => {
    const store = storeOf({ covers: true })
    store.covers = vi.fn(async () => {
      throw new Error('database unreachable')
    })
    const provider = createSelfHostedProvider(store)
    await expect(
      provider.answersEmptyAuthoritatively!('9999999 Nowhere Rd, Bradenton, FL 34208', {
        limit: 5,
        state: 'FL',
      })
    ).resolves.toBe(false)
  })
})
