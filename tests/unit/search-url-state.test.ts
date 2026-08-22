import { describe, expect, it } from 'vitest'
import {
  parseMapUrlState,
  toMapUrlParams,
  toMapUrlQuery,
  type MapUrlState,
} from '@/lib/search/url-state'

const parse = (query: string) => parseMapUrlState(new URLSearchParams(query))

describe('the ?near= contract', () => {
  it('still works on its own', () => {
    // ReferrerReferralForm's "View clinics near this client" link generates
    // these, and they are already in circulation.
    expect(parse('near=123%20Main%20St%2C%20Orlando%2C%20FL')).toEqual({
      near: '123 Main St, Orlando, FL',
    })
  })

  it('survives an address containing a unit designator', () => {
    const address = '123 Main St Apt 4B, Orlando, FL 32801'
    const params = new URLSearchParams()
    params.set('near', address)
    expect(parse(params.toString()).near).toBe(address)
  })

  it('coexists with a resolved anchor', () => {
    const state = parse('near=Orlando&at=28.5383,-81.3792')
    expect(state.near).toBe('Orlando')
    expect(state.at).toEqual([28.5383, -81.3792])
  })
})

describe('parsing', () => {
  it('returns an empty object for an empty query', () => {
    expect(parse('')).toEqual({})
  })

  it('reads every parameter', () => {
    const state = parse(
      'q=chiro&at=28.5,-81.3&r=25&bbox=27,-83,29,-81&z=12&tags=Chiropractic,Spine&type=clinic&avail=1&sort=distance&sel=c-1'
    )
    expect(state).toEqual({
      q: 'chiro',
      at: [28.5, -81.3],
      radius: 25,
      bbox: { south: 27, west: -83, north: 29, east: -81 },
      zoom: 12,
      tags: ['Chiropractic', 'Spine'],
      types: ['clinic'],
      availableOnly: true,
      sort: 'distance',
      selected: 'c-1',
    })
  })

  it('ignores malformed values rather than throwing', () => {
    for (const query of [
      'at=nonsense',
      'at=28.5',
      'at=28.5,-81.3,99',
      'at=999,-81.3',
      'bbox=1,2,3',
      'bbox=a,b,c,d',
      'bbox=29,-83,27,-81',
      'r=abc',
      'z=abc',
      'sort=sideways',
      'type=wizard',
    ]) {
      expect(() => parse(query)).not.toThrow()
    }
    expect(parse('at=nonsense').at).toBeUndefined()
    expect(parse('bbox=29,-83,27,-81').bbox).toBeUndefined()
    expect(parse('sort=sideways').sort).toBeUndefined()
    expect(parse('type=wizard').types).toBeUndefined()
  })

  it('drops a zero or negative radius, which means "no limit"', () => {
    expect(parse('r=0').radius).toBeUndefined()
    expect(parse('r=-5').radius).toBeUndefined()
  })

  it('ignores blank and whitespace-only text', () => {
    expect(parse('q=&near=%20%20').q).toBeUndefined()
    expect(parse('q=&near=%20%20').near).toBeUndefined()
  })

  it('keeps only recognised record types', () => {
    expect(parse('type=clinic,dragon,lawyer').types).toEqual(['clinic', 'lawyer'])
  })
})

describe('serialising', () => {
  it('omits everything that is unset', () => {
    expect(toMapUrlQuery({})).toBe('')
  })

  it('rounds coordinates so float noise cannot churn the URL', () => {
    const params = toMapUrlParams({ at: [28.538312345678, -81.379287654321] })
    expect(params.get('at')).toBe('28.53831,-81.37929')
  })

  it('rounds bounds less finely than a point', () => {
    const params = toMapUrlParams({
      bbox: { south: 27.123456, west: -83.123456, north: 29.123456, east: -81.123456 },
    })
    expect(params.get('bbox')).toBe('27.1235,-83.1235,29.1235,-81.1235')
  })

  it('prefixes the query string only when there is something to say', () => {
    expect(toMapUrlQuery({ q: 'chiro' })).toBe('?q=chiro')
    expect(toMapUrlQuery({ availableOnly: false })).toBe('')
  })
})

describe('round trip', () => {
  it('preserves a fully populated state', () => {
    const state: MapUrlState = {
      q: 'ortho tampa',
      near: '123 Main St, Orlando, FL',
      at: [28.5383, -81.3792],
      radius: 25,
      bbox: { south: 27, west: -83, north: 29, east: -81 },
      zoom: 12,
      tags: ['Orthopedic Rehabilitation'],
      types: ['clinic', 'lawyer'],
      availableOnly: true,
      sort: 'relevance',
      selected: 'c-42',
    }
    expect(parseMapUrlState(toMapUrlParams(state))).toEqual(state)
  })

  it('preserves a tag containing a space', () => {
    const state: MapUrlState = { tags: ['Physical Therapy', 'Pain Management'] }
    expect(parseMapUrlState(toMapUrlParams(state)).tags).toEqual(state.tags)
  })
})
