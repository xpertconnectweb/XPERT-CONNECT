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
  address: { house_number: '1000', road: 'Legion Pl', city: 'Orlando', postcode: '32801' },
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
