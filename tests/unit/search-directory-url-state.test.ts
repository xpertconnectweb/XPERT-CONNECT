import { describe, expect, it } from 'vitest'
import {
  parseDirectoryUrlState,
  toDirectoryUrlParams,
  toDirectoryUrlQuery,
  type DirectoryUrlState,
} from '@/lib/search/directory-url-state'

const parse = (query: string) => parseDirectoryUrlState(new URLSearchParams(query))

describe('parseDirectoryUrlState', () => {
  it('reads a full state', () => {
    expect(parse('q=Bradenton&area=Personal%20Injury&county=Manatee&sort=name&n=120')).toEqual({
      q: 'Bradenton',
      area: 'Personal Injury',
      county: 'Manatee',
      sort: 'name',
      show: 120,
    })
  })

  it('returns an empty state for an empty query string', () => {
    expect(parse('')).toEqual({})
    expect(parseDirectoryUrlState(null)).toEqual({})
    expect(parseDirectoryUrlState(undefined)).toEqual({})
  })

  it('trims, and treats whitespace as absent', () => {
    expect(parse('q=%20%20Bradenton%20%20').q).toBe('Bradenton')
    expect(parse('q=%20%20').q).toBeUndefined()
  })

  /**
   * A query string is user input and this runs during render. The map's
   * parser takes the same position: an unparseable parameter is absent,
   * never an error page.
   */
  it('ignores malformed values instead of throwing', () => {
    expect(() => parse('sort=explode&n=NaN&q=')).not.toThrow()
    expect(parse('sort=explode').sort).toBeUndefined()
    expect(parse('n=NaN').show).toBeUndefined()
    expect(parse('n=-40').show).toBeUndefined()
  })

  it('rounds the page size up to a whole page and caps it', () => {
    // A hand-edited URL must not be able to ask the browser to render
    // the whole corpus in one go.
    expect(parse('n=61').show).toBe(120)
    expect(parse('n=999999').show).toBe(3000)
  })
})

describe('toDirectoryUrlQuery', () => {
  it('round-trips', () => {
    const state: DirectoryUrlState = {
      q: 'Bradenton',
      area: 'Personal Injury',
      county: 'Manatee',
      sort: 'name',
      show: 120,
    }
    expect(parse(toDirectoryUrlParams(state).toString())).toEqual(state)
  })

  it('says nothing when there is nothing to say', () => {
    expect(toDirectoryUrlQuery({})).toBe('')
    expect(toDirectoryUrlQuery({ q: '   ' })).toBe('')
  })

  it('omits the defaults, so an idle page has a clean URL', () => {
    expect(toDirectoryUrlQuery({ sort: 'relevance', show: 60 })).toBe('')
    expect(toDirectoryUrlQuery({ q: 'x', show: 60 })).toBe('?q=x')
  })

  it('produces the link the landing block hands to /directory', () => {
    expect(toDirectoryUrlQuery({ q: 'Bradenton', area: 'Personal Injury' })).toBe(
      '?q=Bradenton&area=Personal+Injury'
    )
  })
})
