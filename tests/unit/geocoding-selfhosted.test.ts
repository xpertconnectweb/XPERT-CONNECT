import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createSelfHostedProvider } from '@/lib/geocoding/selfhosted'
import type { StreetRow, StreetStore } from '@/lib/geocoding/street-index'
import { encodePoints, type StreetPoint } from '@/lib/geocoding/payload-codec'

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

function storeOf(
  options: { rows?: StreetRow[]; covers?: boolean; nearby?: StreetRow[]; points?: StreetPoint[] } = {}
): StreetStore {
  const rows = options.rows ?? []
  const payload = encodePoints(
    options.points ?? [{ number: 862, lat: 27.491257, lng: -82.481824 }]
  )

  return {
    search: vi.fn(async () => rows),
    payloads: vi.fn(async (ids: readonly number[]) => {
      const out = new Map<number, Buffer>()
      for (const id of ids) out.set(id, payload)
      return out
    }),
    covers: vi.fn(async () => options.covers ?? false),
    nearby: vi.fn(async () => options.nearby ?? []),
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

/**
 * Reverse geocoding: what is at this point.
 *
 * The question the map asks on every pin drag, and until now the one place the
 * addresses still left the building -- `MapView` drags the HOME ADDRESS of a
 * personal-injury client, and those coordinates went to a third party.
 *
 * Every threshold these tests exercise is measured by
 * `scripts/geo/gate-reverse.ts` over 104,000 lookups, not chosen. The rule they
 * enforce is that the label and the precision must agree.
 */
describe('reverse', () => {
  const here = { lat: 27.491257, lng: -82.481824 }

  /** Doors along one block, so distance from the query is controllable. */
  const block: StreetPoint[] = [
    { number: 858, lat: 27.49116, lng: -82.481824 },
    { number: 860, lat: 27.49121, lng: -82.481824 },
    { number: 862, lat: 27.491257, lng: -82.481824 },
    { number: 864, lat: 27.49131, lng: -82.481824 },
  ]

  const on = () => {
    process.env.REVERSE_SELFHOSTED = '1'
  }

  beforeEach(() => {
    delete process.env.REVERSE_SELFHOSTED
  })

  it('names the door the pin is standing on, and calls it rooftop', async () => {
    on()
    const store = storeOf({ nearby: [street()], points: block })
    const result = await createSelfHostedProvider(store).reverse(here.lat, here.lng, { limit: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.value) throw new Error('expected an answer')
    expect(result.value.address?.street).toBe('862 62nd Street Cir E')
    expect(result.value.precision).toBe('rooftop')
    expect(result.value.providerId).toBe('selfhosted')
  })

  /**
   * The rule that makes this honest rather than decorative. Past
   * REVERSE_NUMBER_M the house number comes off the TEXT, not just the
   * precision -- saying "you are at 862" when the nearest recorded door is
   * a hundred metres away is the confident wrong answer this engine exists to
   * stop producing.
   */
  it('drops the house number once the nearest door is too far to claim', async () => {
    on()
    // About 550 m north of the block: inside coverage, far outside NUMBER_M.
    const store = storeOf({ nearby: [street()], points: block })
    const result = await createSelfHostedProvider(store).reverse(27.4962, -82.481824, { limit: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.value) throw new Error('expected an answer')
    expect(result.value.precision).toBe('street')
    expect(result.value.address?.street).toBe('62nd Street Cir E')
    // Not "contains no digit": this street is called 62nd, and the reported
    // address is on 62nd Street Circle East. What must be gone is a house
    // number in front of it.
    expect(result.value.address?.street).not.toMatch(/^\d+\s/)
  })

  it('leaves the pin where the user put it when it is only naming the street', async () => {
    on()
    const store = storeOf({ nearby: [street()], points: block })
    const result = await createSelfHostedProvider(store).reverse(27.4962, -82.481824, { limit: 1 })

    if (!result.ok || !result.value) throw new Error('expected an answer')
    // Moving someone's pin to a door we are explicitly not claiming they are at
    // would be worse than leaving it alone.
    expect(result.value.lat).toBeCloseTo(27.4962, 5)
  })

  it('answers null beyond the radius the index covers, so the chain can try', async () => {
    on()
    // Ten kilometres away: no register here, and a guess would be worse than
    // handing the question to Geoapify.
    const store = storeOf({ nearby: [street()], points: block })
    const result = await createSelfHostedProvider(store).reverse(27.58, -82.481824, { limit: 1 })

    expect(result.ok).toBe(true)
    expect(result.ok && result.value).toBeNull()
  })

  it('answers null with no candidates, without fetching a single blob', async () => {
    on()
    const store = storeOf({ nearby: [] })
    const result = await createSelfHostedProvider(store).reverse(here.lat, here.lng, { limit: 1 })

    expect(result.ok && result.value).toBeNull()
    expect(store.payloads).not.toHaveBeenCalled()
  })

  /**
   * `parcel` is never claimed, deliberately. `isExactPrecision` treats it as
   * exact and that predicate is what silences the drag-the-pin prompt; on a
   * browser geolocation, which can be blocks out, claiming it would suppress
   * the warning exactly where it is most needed. And it would only be true if
   * the registers published parcel polygons, which they do not -- they publish
   * points.
   */
  it('never claims parcel', async () => {
    on()
    const store = storeOf({ nearby: [street()], points: block })
    for (const at of [here, { lat: 27.4913, lng: -82.4818 }, { lat: 27.4962, lng: -82.4818 }]) {
      const result = await createSelfHostedProvider(store).reverse(at.lat, at.lng, { limit: 1 })
      if (result.ok && result.value) expect(result.value.precision).not.toBe('parcel')
    }
  })

  /**
   * The escape hatch. Reverse goes back to Geoapify and autocomplete is
   * untouched: one environment variable, no deploy, seconds. It is the first
   * of the three rollbacks in the plan and the only one that does not need a
   * redeploy, so it has to actually work.
   */
  describe('the escape hatch', () => {
    it('answers null when REVERSE_SELFHOSTED is not set', async () => {
      const store = storeOf({ nearby: [street()], points: block })
      const result = await createSelfHostedProvider(store).reverse(here.lat, here.lng, { limit: 1 })

      expect(result.ok && result.value).toBeNull()
    })

    it('does not touch the store to say so', async () => {
      const store = storeOf({ nearby: [street()], points: block })
      await createSelfHostedProvider(store).reverse(here.lat, here.lng, { limit: 1 })

      expect(store.nearby).not.toHaveBeenCalled()
      expect(store.payloads).not.toHaveBeenCalled()
    })

    it('leaves autocomplete alone either way', async () => {
      const store = storeOf({ rows: [street()], points: block })
      const off = await createSelfHostedProvider(store).autocomplete('862 62nd St Cir E', {
        limit: 5,
        state: 'FL',
      })
      on()
      const upon = await createSelfHostedProvider(store).autocomplete('862 62nd St Cir E', {
        limit: 5,
        state: 'FL',
      })

      expect(off.ok && off.value.length).toBe(upon.ok && upon.value.length)
    })
  })
})
