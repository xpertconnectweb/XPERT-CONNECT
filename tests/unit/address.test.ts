import { describe, expect, it } from 'vitest'
import { parseAddress, publicLocationLabel, stripUnit } from '@/lib/address'

describe('parseAddress — shapes that actually occur in the corpus', () => {
  it('parses the standard three-segment form', () => {
    expect(parseAddress('1117 N Palafox St, Pensacola, FL 32501')).toEqual({
      street: '1117 N Palafox St',
      city: 'Pensacola',
      state: 'FL',
      zip: '32501',
      confident: true,
    })
  })

  it('keeps unit designators in the street', () => {
    expect(parseAddress('316 SE 12th St Unit 100, Ocala, FL 34471')).toMatchObject({
      street: '316 SE 12th St Unit 100',
      city: 'Ocala',
      zip: '34471',
    })
  })

  it('parses a city-only address with no ZIP', () => {
    // This is the exact shape that broke state scoping: the old
    // `ilike('address', '%, FL %')` required a trailing space, so these 12
    // clinics were invisible to every Florida user.
    expect(parseAddress('Melbourne, FL')).toEqual({
      street: null,
      city: 'Melbourne',
      state: 'FL',
      zip: null,
      confident: true,
    })
  })

  it('tolerates trailing whitespace', () => {
    expect(parseAddress('Clearwater, MN  ')).toMatchObject({
      city: 'Clearwater',
      state: 'MN',
    })
  })

  it('drops parenthetical annotations before matching', () => {
    expect(parseAddress('Wesley Chapel, FL (Pasco County)')).toMatchObject({
      city: 'Wesley Chapel',
      state: 'FL',
      confident: true,
    })
  })

  it('tolerates a duplicated ZIP', () => {
    // l-002 is stored as "...FL 32803 32801".
    expect(parseAddress('21 Park Lake St, Orlando, FL 32803 32801')).toMatchObject({
      city: 'Orlando',
      state: 'FL',
      zip: '32803',
      confident: true,
    })
  })

  it('truncates ZIP+4', () => {
    expect(parseAddress('1 Main St, Miami, FL 33130-1234').zip).toBe('33130')
  })

  it('refuses to guess a state from a title-cased street suffix', () => {
    // "Janet Ct" was being read as Connecticut, filing c-336 in the wrong
    // state. Only an already-uppercase token may be read as a state code.
    expect(parseAddress('Janet Ct / Spring Hill area (consultar por llamada)')).toEqual({
      street: null,
      city: null,
      state: null,
      zip: null,
      confident: false,
    })
  })

  it('does not invent a city when only a state can be found', () => {
    const parsed = parseAddress('somewhere near the FL line')
    expect(parsed.state).toBe('FL')
    expect(parsed.city).toBeNull()
    expect(parsed.confident).toBe(false)
  })

  it('handles empty and non-string input', () => {
    for (const input of ['', '   ', null, undefined, 42 as unknown as string]) {
      expect(parseAddress(input)).toMatchObject({ state: null, confident: false })
    }
  })

  it('title-cases an ALL-CAPS city', () => {
    expect(parseAddress('1 Main St, ORLANDO, FL 32801').city).toBe('Orlando')
  })

  it('leaves mixed-case city names alone', () => {
    expect(parseAddress('1 Main St, Port St Joe, FL 32456').city).toBe('Port St Joe')
  })
})

describe('publicLocationLabel', () => {
  it('renders city, state and ZIP without the street', () => {
    const parts = parseAddress('1000 Legion Pl #1000, Orlando, FL 32801')
    expect(publicLocationLabel(parts)).toBe('Orlando, FL 32801')
  })

  it('omits a missing ZIP', () => {
    expect(publicLocationLabel(parseAddress('Melbourne, FL'))).toBe('Melbourne, FL')
  })

  it('returns null when there is no geography at all', () => {
    expect(publicLocationLabel(parseAddress(''))).toBeNull()
  })
})

describe('stripUnit', () => {
  it('removes the designators that make Nominatim return nothing', () => {
    expect(stripUnit('123 Main St Apt 4B, Orlando, FL 32801')).toBe(
      '123 Main St, Orlando, FL 32801'
    )
    expect(stripUnit('123 Main St #1402, Orlando, FL')).toBe('123 Main St, Orlando, FL')
    expect(stripUnit('123 Main St Suite 200, Orlando, FL')).toBe(
      '123 Main St, Orlando, FL'
    )
  })

  it('takes a slash-joined unit whole, leaving no fragment behind', () => {
    // "Unit 101/102" is a practice that took two adjoining rooms, and it is
    // common in this corpus. Matching only the first half used to leave "/102"
    // glued to the street — and that fragment is enough to make the lookup fail
    // on its own: the full string returns nothing from the provider, while
    // "1531 SE 17th St, Ocala, FL 34471" is a rooftop match.
    expect(stripUnit('1531 SE 17th St Unit 101/102, Ocala, FL 34471')).toBe(
      '1531 SE 17th St, Ocala, FL 34471'
    )
    expect(stripUnit('3256 S Pine Ave Suite 301/302, Ocala, FL 34471')).toBe(
      '3256 S Pine Ave, Ocala, FL 34471'
    )
  })

  it('never strips a bare "fl" — it would take the state and ZIP with it', () => {
    expect(stripUnit('123 Main St, Orlando, FL 32801')).toBe('123 Main St, Orlando, FL 32801')
  })

  it('leaves a clean address untouched', () => {
    expect(stripUnit('1117 N Palafox St, Pensacola, FL 32501')).toBe(
      '1117 N Palafox St, Pensacola, FL 32501'
    )
  })
})
