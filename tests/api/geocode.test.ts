import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildRequireAuth, buildSession } from './_helpers'

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }))

import { GET } from '@/app/api/geocode/route'
import * as auth from '@/lib/api-auth'

const mockedAuth = vi.mocked(auth)

const place = (over: Record<string, unknown> = {}) => ({
  place_id: 123,
  lat: '28.5383',
  lon: '-81.3792',
  display_name: '1000 Legion Pl, Orlando, Orange County, Florida, 32801, United States',
  boundingbox: ['28.53', '28.54', '-81.38', '-81.37'],
  class: 'place',
  type: 'house',
  address: {
    house_number: '1000',
    road: 'Legion Pl',
    city: 'Orlando',
    state: 'Florida',
    'ISO3166-2-lvl4': 'US-FL',
    postcode: '32801',
  },
  ...over,
})

/** A unique query per test, so the route's module-level cache can't bleed across cases. */
let seq = 0
const uniq = (base: string) => `${base} ${(seq += 1)}`

const call = (q: string, extra = '') =>
  GET(new Request(`http://localhost/api/geocode?q=${encodeURIComponent(q)}${extra}`))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  mockedAuth.requireAuth.mockImplementation(
    buildRequireAuth(buildSession({ role: 'lawyer', state: 'FL' }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('auth', () => {
  it('rejects an unauthenticated caller', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await call(uniq('orlando'))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('query validation', () => {
  it('rejects a query below the minimum length', async () => {
    const res = await call('or')
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an absurdly long query', async () => {
    const res = await call('x'.repeat(201))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('results', () => {
  it('maps the upstream response onto the public shape', async () => {
    fetchMock.mockResolvedValue(ok([place()]))
    const res = await call(uniq('1000 Legion Pl Orlando'))
    expect(res.status).toBe(200)
    const [first] = await res.json()
    expect(first).toMatchObject({
      id: '123',
      lat: 28.5383,
      lng: -81.3792,
      kind: 'address',
      bbox: [28.53, 28.54, -81.38, -81.37],
    })
    expect(first.label).toBe('1000 Legion Pl, Orlando, FL 32801')
    expect(first.address).toEqual({
      street: '1000 Legion Pl',
      city: 'Orlando',
      state: 'FL',
      postcode: '32801',
    })
  })

  /**
   * The label used to be the first three comma parts of `display_name`, which
   * for this fixture yields "1000 Legion Pl, Orlando, Orange County" — a county
   * nobody typed, and no ZIP. The ZIP is the part that tells a user the
   * geocoder found the right place.
   */
  it('keeps the ZIP the user typed instead of a county they did not', async () => {
    fetchMock.mockResolvedValue(ok([place()]))
    const res = await call(uniq('1000 Legion Pl Orlando 32801'))
    const [first] = await res.json()
    expect(first.label).toContain('32801')
    expect(first.label).not.toContain('Orange County')
  })

  it('takes the state code from the ISO field, not by truncating the name', async () => {
    // "Michigan" and "Minnesota" both start "Mi"; only the ISO field is safe.
    fetchMock.mockResolvedValue(
      ok([place({ address: { city: 'Duluth', state: 'Minnesota', 'ISO3166-2-lvl4': 'US-MN' } })])
    )
    const res = await call(uniq('duluth'))
    const [first] = await res.json()
    expect(first.address.state).toBe('MN')
  })

  it('promotes the city line when there is no street, so a ZIP search reads right', async () => {
    fetchMock.mockResolvedValue(
      ok([place({ type: 'postcode', address: { postcode: '32801', city: 'Orlando', 'ISO3166-2-lvl4': 'US-FL' } })])
    )
    const res = await call(uniq('32801'))
    const [first] = await res.json()
    expect(first.label).toBe('Orlando, FL 32801')
  })

  it('falls back to the upstream label when there are no components', async () => {
    fetchMock.mockResolvedValue(ok([place({ address: undefined })]))
    const res = await call(uniq('somewhere vague'))
    const [first] = await res.json()
    expect(first.address).toBeNull()
    expect(first.label).toBe('1000 Legion Pl, Orlando, Orange County')
  })

  it('classifies a ZIP, a city and a region distinctly', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ type: 'postcode', address: { postcode: '32801' } }, 'zip'],
      [{ type: 'city', address: { city: 'Orlando' } }, 'city'],
      [{ type: 'state', address: { state: 'Florida' } }, 'region'],
      [{ class: 'amenity', type: 'clinic', address: { amenity: 'Clinic' } }, 'poi'],
    ]
    for (const [over, kind] of cases) {
      fetchMock.mockResolvedValue(ok([place(over)]))
      const res = await call(uniq('somewhere'))
      const [first] = await res.json()
      expect(first.kind, JSON.stringify(over)).toBe(kind)
    }
  })

  it('drops entries with unusable coordinates', async () => {
    fetchMock.mockResolvedValue(ok([place({ lat: 'nope' }), place({ place_id: 9 })]))
    const res = await call(uniq('orlando'))
    expect(await res.json()).toHaveLength(1)
  })

  it('survives an upstream payload that is not an array', async () => {
    fetchMock.mockResolvedValue(ok({ unexpected: true }))
    const res = await call(uniq('orlando'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('honours the limit, clamped', async () => {
    fetchMock.mockResolvedValue(ok([place(), place({ place_id: 2 }), place({ place_id: 3 })]))
    const res = await call(uniq('orlando'), '&limit=2')
    expect(await res.json()).toHaveLength(2)
  })
})

describe('the unit-designator fallback chain', () => {
  it('strips the unit before asking, because Nominatim returns nothing with it', async () => {
    fetchMock.mockResolvedValue(ok([place()]))
    await call(uniq('123 Main St Apt 4B, Orlando, FL 32801'))
    const url = String(fetchMock.mock.calls[0][0])
    expect(decodeURIComponent(url)).toContain('123 Main St, Orlando, FL 32801')
    expect(decodeURIComponent(url)).not.toContain('Apt 4B')
  })

  it('falls back to the bare ZIP when everything else comes back empty', async () => {
    fetchMock.mockResolvedValue(ok([]))
    const res = await call(uniq('Nowhere Rd, Nowhereville, FL 32801'))
    expect(res.status).toBe(200)
    const lastUrl = decodeURIComponent(String(fetchMock.mock.calls.at(-1)?.[0]))
    expect(lastUrl).toContain('q=32801')
  })

  it('sends a real User-Agent, which the browser could never do', async () => {
    fetchMock.mockResolvedValue(ok([place()]))
    await call(uniq('orlando'))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('XpertConnect')
  })
})

describe('caching', () => {
  it('serves a repeated query without touching the upstream', async () => {
    const query = uniq('cache me')
    fetchMock.mockResolvedValue(ok([place()]))

    const first = await call(query)
    expect(first.headers.get('X-Geocode-Cache')).toBe('miss')
    const callsAfterFirst = fetchMock.mock.calls.length

    const second = await call(query)
    expect(second.headers.get('X-Geocode-Cache')).toBe('hit')
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
    expect(await second.json()).toEqual(await first.json())
  })

  it('caches an empty result, so a dead prefix is not retried on every keystroke', async () => {
    const query = uniq('no such place')
    fetchMock.mockResolvedValue(ok([]))

    await call(query)
    const callsAfterFirst = fetchMock.mock.calls.length
    const second = await call(query)

    expect(second.headers.get('X-Geocode-Cache')).toBe('hit')
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('upstream failure', () => {
  it('returns 502 rather than a broken 200', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const res = await call(uniq('orlando'))
    expect(res.status).toBe(502)
  })

  it('treats a non-OK upstream status as a failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    const res = await call(uniq('orlando'))
    expect(res.status).toBe(502)
  })
})

/**
 * Reverse mode exists for the draggable home pin: once someone nudges it onto
 * the right driveway the address on screen has to follow, or the card goes on
 * naming a building the pin is no longer on.
 */
describe('reverse lookup', () => {
  it('turns coordinates into a structured address', async () => {
    fetchMock.mockResolvedValue(ok(place()))
    const res = await GET(new Request('http://localhost/api/geocode?lat=28.5383&lng=-81.3792'))
    expect(res.status).toBe(200)
    const [first] = await res.json()
    expect(first.label).toBe('1000 Legion Pl, Orlando, FL 32801')
    expect(first.address.city).toBe('Orlando')
  })

  it('asks the reverse endpoint, not the search one', async () => {
    fetchMock.mockResolvedValue(ok(place()))
    await GET(new Request('http://localhost/api/geocode?lat=28.6&lng=-81.4'))
    expect(String(fetchMock.mock.calls[0][0])).toContain('/reverse')
  })

  it('returns an empty list rather than an error for open water', async () => {
    // Nominatim answers `{ error: 'Unable to geocode' }` over the sea. The pin
    // is still exactly where the user put it; only the name is unknown.
    fetchMock.mockResolvedValue(ok({ error: 'Unable to geocode' }))
    const res = await GET(new Request('http://localhost/api/geocode?lat=25.1&lng=-79.9'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('rejects coordinates that are not on Earth', async () => {
    const res = await GET(new Request('http://localhost/api/geocode?lat=999&lng=0'))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches by rounded coordinates, so a one-metre wobble is one call', async () => {
    fetchMock.mockResolvedValue(ok(place()))
    await GET(new Request('http://localhost/api/geocode?lat=28.538312&lng=-81.379244'))
    await GET(new Request('http://localhost/api/geocode?lat=28.538314&lng=-81.379241'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
