import { describe, it, expect } from 'vitest'
import { parseUsAddress, canonicalizeStreet, extractUnit } from '@/lib/geocoding/address-parser'
import { canonicalSuffix, expandSuffix, canonicalDirectional } from '@/lib/geocoding/usps'

/**
 * The parser and the ETL share `canonicalizeStreet`, and the index is built
 * from its output. Every case below that is marked "both sides" is checking
 * that agreement rather than any particular spelling -- if the two ever drift
 * apart, seventeen million points become unreachable and nothing else in the
 * system notices.
 */

describe('canonicalizeStreet', () => {
  /**
   * The address the client reported, and the reason this whole engine exists.
   * Manatee County publishes "62ND STREET CIR E"; USPS and most people write
   * "62nd St Cir E". Both have to land on one key.
   */
  it('collapses the spelling that lost the reported address', () => {
    const asPublished = canonicalizeStreet('62ND STREET CIR E')
    const asTyped = canonicalizeStreet('62nd St Cir E')
    const asSpoken = canonicalizeStreet('62nd Street Circle East')

    expect(asPublished.norm).toBe('62ND ST CIR E')
    expect(asTyped.norm).toBe('62ND ST CIR E')
    expect(asSpoken.norm).toBe('62ND ST CIR E')
  })

  it('collapses AV, AVE and AVENUE, which three counties spell three ways', () => {
    expect(canonicalizeStreet('CAPE AV').norm).toBe('CAPE AVE')
    expect(canonicalizeStreet('Cape Ave').norm).toBe('CAPE AVE')
    expect(canonicalizeStreet('Cape Avenue').norm).toBe('CAPE AVE')
  })

  it('collapses a spelled-out directional onto its abbreviation', () => {
    expect(canonicalizeStreet('NORTH PALMETTO CIR').norm).toBe('N PALMETTO CIR')
    expect(canonicalizeStreet('N Palmetto Cir').norm).toBe('N PALMETTO CIR')
  })

  /**
   * The trap that governs the whole file: abbreviate in position, never by
   * token. GREEN is a suffix spelling (GRN) but here it is the name.
   */
  it('leaves the first word of a name alone even when it is a suffix word', () => {
    expect(canonicalizeStreet('Green Bay Rd').norm).toBe('GREEN BAY RD')
    expect(canonicalizeStreet('Park Place').norm).toBe('PARK PL')
    expect(canonicalizeStreet('Forest Dr').norm).toBe('FOREST DR')
  })

  it('never reduces a street to no name at all', () => {
    // Both of these are real: N St in Pensacola, and streets simply called
    // Park. A parser that pops suffixes until it runs out returns nothing.
    expect(canonicalizeStreet('N St').norm).toBe('N ST')
    expect(canonicalizeStreet('Park').norm).toBe('PARK')
    expect(canonicalizeStreet('Broadway').norm).toBe('BROADWAY')
  })

  /**
   * Santa Rosa County publishes the flat number inside the street name. Left
   * alone, "6290 Berryhill Rd, Milton FL" matches nothing, because the index
   * holds "berryhill rd apt 3j" and not "berryhill rd".
   */
  it('lifts a unit out of a street name the county glued it into', () => {
    const parsed = canonicalizeStreet('BERRYHILL RD APT 3J')
    expect(parsed.norm).toBe('BERRYHILL RD')
    expect(parsed.unit).toEqual({ designator: 'APT', value: '3J' })
  })

  it('keeps the published spelling for display, with the unit removed', () => {
    expect(canonicalizeStreet('62ND STREET CIR E').display).toBe('62ND STREET CIR E')
    expect(canonicalizeStreet('BERRYHILL RD APT 3J').display).toBe('BERRYHILL RD')
  })

  it('is empty rather than throwing on nothing', () => {
    expect(canonicalizeStreet('').norm).toBe('')
    expect(canonicalizeStreet(null).norm).toBe('')
    expect(canonicalizeStreet('   ').norm).toBe('')
  })
})

describe('unit extraction', () => {
  /**
   * KEY is a USPS designator for a marina berth, and also half the place names
   * in south Florida. Before the "a unit number looks like a number" rule,
   * "Boca Key Dr" parsed as the street "Boca" with unit "KEY DR".
   */
  it('does not mistake a place name for a designator', () => {
    // The street survives intact. That KEY also abbreviates to KY, and BEACH to
    // BCH, is not a defect: the ETL runs the county's own string through this
    // same function, so both sides say BOCA KY DR and they meet. What would be
    // a defect is the street coming back as "BOCA" with a unit hanging off it,
    // which is what happened before the unit-value check.
    expect(canonicalizeStreet('Boca Key Dr').norm).toBe('BOCA KY DR')
    expect(canonicalizeStreet('Boca Key Dr').unit).toBeNull()

    expect(canonicalizeStreet('Front Beach Rd').norm).toBe('FRONT BCH RD')
    expect(canonicalizeStreet('Front Beach Rd').unit).toBeNull()

    expect(canonicalizeStreet('Pier Point Dr').norm).toBe('PIER PT DR')
    expect(canonicalizeStreet('Lot Line Rd').norm).toBe('LOT LINE RD')
    expect(canonicalizeStreet('Lot Line Rd').unit).toBeNull()
  })

  /**
   * The property the odd-looking abbreviations above are really protecting:
   * however a register spelled a street and however a person types it, the two
   * end up on one key. Nothing here asserts a particular spelling.
   */
  it('lands both spellings of a street on the same key', () => {
    const pairs: Array<[string, string]> = [
      ['Boca Key Dr', 'BOCA KEY DRIVE'],
      ['Front Beach Rd', 'FRONT BEACH ROAD'],
      ['Mill Creek Rd', 'MILL CRK RD'],
      ['Little Pine Ave', 'LITTLE PINE AV'],
      ['62nd St Cir E', '62ND STREET CIR EAST'],
    ]
    for (const [typed, published] of pairs) {
      expect(canonicalizeStreet(typed).norm).toBe(canonicalizeStreet(published).norm)
    }
  })

  it('reads the units people actually type', () => {
    expect(extractUnit('1531 SE 17th St Unit 101')).toEqual({ designator: 'UNIT', value: '101' })
    expect(extractUnit('1531 SE 17th St Ste 200')).toEqual({ designator: 'STE', value: '200' })
    expect(extractUnit('1531 SE 17th St Apt 3J')).toEqual({ designator: 'APT', value: '3J' })
    expect(extractUnit('1531 SE 17th St #200')).toEqual({ designator: 'UNIT', value: '200' })
  })

  /** The double unit, which `stripUnit` was fixed for earlier in this project. */
  it('keeps a slash-joined pair together', () => {
    const parsed = parseUsAddress('1531 SE 17th St Unit 101/102, Ocala, FL 34471')
    expect(parsed.street).toBe('SE 17TH ST')
    expect(parsed.unit).toEqual({ designator: 'UNIT', value: '101/102' })
  })

  it('reads a designator that stands alone', () => {
    expect(extractUnit('100 Main St Rear')).toEqual({ designator: 'REAR', value: '' })
    expect(extractUnit('100 Main St Lobby')).toEqual({ designator: 'LBBY', value: '' })
  })

  /**
   * A truncated address, not a unit. Inventing an empty unit here would also
   * shorten the street, and silently.
   */
  it('leaves a dangling designator in place', () => {
    const parsed = parseUsAddress('100 Main St Apt, Ocala, FL')
    expect(parsed.unit).toBeNull()
    expect(parsed.street).toContain('MAIN')
  })

  it('does not treat a leading designator as a unit', () => {
    expect(canonicalizeStreet('Key Plaza').unit).toBeNull()
    expect(canonicalizeStreet('Key Plaza').norm).toBe('KEY PLZ')
  })
})

describe('parseUsAddress', () => {
  it('takes the reported address apart', () => {
    const parsed = parseUsAddress('862 62nd St Cir E, Bradenton, FL 34208')

    expect(parsed.number).toBe(862)
    expect(parsed.street).toBe('62ND ST CIR E')
    expect(parsed.suffix).toBe('CIR')
    expect(parsed.postDirectional).toBe('E')
    expect(parsed.city).toBe('Bradenton')
    expect(parsed.state).toBe('FL')
    expect(parsed.zip).toBe('34208')
    expect(parsed.confident).toBe(true)
  })

  it('reads a pre-directional', () => {
    const parsed = parseUsAddress('1531 SE 17th St, Ocala, FL 34471')
    expect(parsed.preDirectional).toBe('SE')
    expect(parsed.streetName).toBe('17TH')
    expect(parsed.suffix).toBe('ST')
    expect(parsed.street).toBe('SE 17TH ST')
  })

  it('separates a suffixed house number from the street', () => {
    expect(parseUsAddress('123A Main St, Ocala, FL')).toMatchObject({ number: 123, numberSuffix: 'A' })
    expect(parseUsAddress('123-125 Main St, Ocala, FL')).toMatchObject({ number: 123, numberSuffix: '125' })
    expect(parseUsAddress('123 1/2 Main St, Ocala, FL')).toMatchObject({ number: 123, numberSuffix: '1/2' })
  })

  /** A postcode on its own is not a house number, and neither is a bare digit. */
  it('does not read a lone number as a house number', () => {
    expect(parseUsAddress('34208').number).toBeNull()
    expect(parseUsAddress('34208, FL').number).toBeNull()
  })

  /**
   * Found by typing addresses at production. "62nd St Cir E" with no house
   * number parsed as number 62 with the suffix "nd", leaving the street as
   * "ST CIR E" — which matched "17th Street Cir E", a different road entirely.
   */
  it('does not eat an ordinal street name as a house number', () => {
    for (const [typed, street] of [
      ['62nd St Cir E, Bradenton, FL 34208', '62ND ST CIR E'],
      ['1st Ave N, Saint Petersburg, FL 33701', '1ST AVE N'],
      ['3rd St, Miami, FL', '3RD ST'],
      ['4th Ave, Tampa, FL', '4TH AVE'],
    ] as const) {
      const parsed = parseUsAddress(typed)
      expect(parsed.number, typed).toBeNull()
      expect(parsed.street, typed).toBe(street)
    }
  })

  it('still reads a house number in front of an ordinal street', () => {
    const parsed = parseUsAddress('100 1st St, Miami, FL 33132')
    expect(parsed.number).toBe(100)
    expect(parsed.street).toBe('1ST ST')
  })

  /**
   * `parseAddress` has nothing else to do with a single-segment head, so it puts
   * the same word in both `street` and `city`. Searching for it returned "Braden
   * Run", a road four postcodes from Bradenton that merely starts the same way.
   */
  it('declines to search for a street when the query only names a city', () => {
    for (const typed of ['Bradenton, FL', 'Ocala, FL 34471']) {
      expect(parseUsAddress(typed).variants, typed).toEqual([])
    }
  })

  /** The regression that rule caused first: comparing the name without its suffix. */
  it('still searches for a street named after its own city', () => {
    expect(parseUsAddress('Miami St, Miami, FL').street).toBe('MIAMI ST')
    expect(parseUsAddress('100 Bradenton, Bradenton, FL').number).toBe(100)
  })

  it('emits the canonical form first and the spelled-out one after it', () => {
    const parsed = parseUsAddress('862 62nd St Cir E, Bradenton, FL 34208')
    expect(parsed.variants[0]).toBe('62ND ST CIR E')
    expect(parsed.variants).toContain('62ND STREET CIRCLE EAST')
    expect(parsed.variants.length).toBeLessThanOrEqual(6)
    expect(new Set(parsed.variants).size).toBe(parsed.variants.length)
  })

  it('survives an address with no city and no postcode', () => {
    const parsed = parseUsAddress('862 62nd St Cir E')
    expect(parsed.number).toBe(862)
    expect(parsed.street).toBe('62ND ST CIR E')
    expect(parsed.city).toBeNull()
  })

  it('ignores full stops in abbreviations', () => {
    expect(parseUsAddress('100 N.E. 2nd St., Miami, FL 33132').street).toBe('NE 2ND ST')
  })

  it('returns something usable rather than throwing on rubbish', () => {
    for (const junk of ['', '   ', ',,,', '???']) {
      const parsed = parseUsAddress(junk)
      expect(parsed.confident).toBe(false)
      expect(parsed.variants).toEqual([])
    }
    expect(parseUsAddress(null).number).toBeNull()
    expect(parseUsAddress(undefined).number).toBeNull()
  })
})

describe('USPS tables', () => {
  it('maps both directions for the suffixes that broke the reported address', () => {
    expect(canonicalSuffix('street')).toBe('ST')
    expect(canonicalSuffix('St')).toBe('ST')
    expect(expandSuffix('ST')).toBe('STREET')
    expect(expandSuffix('street')).toBe('STREET')

    expect(canonicalSuffix('av')).toBe('AVE')
    expect(expandSuffix('av')).toBe('AVENUE')

    expect(canonicalSuffix('circle')).toBe('CIR')
    expect(expandSuffix('cir')).toBe('CIRCLE')
  })

  it('keeps singular and plural apart, because USPS does', () => {
    expect(canonicalSuffix('field')).toBe('FLD')
    expect(canonicalSuffix('fields')).toBe('FLDS')
    expect(canonicalSuffix('spring')).toBe('SPG')
    expect(canonicalSuffix('springs')).toBe('SPGS')
  })

  it('reads Spanish directionals, which bilingual intake staff type', () => {
    expect(canonicalDirectional('norte')).toBe('N')
    expect(canonicalDirectional('sureste')).toBe('SE')
  })

  it('returns null for a word that is not one', () => {
    expect(canonicalSuffix('palmetto')).toBeNull()
    expect(canonicalDirectional('bradenton')).toBeNull()
    expect(expandSuffix('palmetto')).toBeNull()
  })
})
