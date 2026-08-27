import { describe, expect, it } from 'vitest'
import { titleCaseOrg, titleCaseStreet } from '../../scripts/nppes/text'

/**
 * These two functions decide what a clinic is CALLED and where it SAYS it is.
 * NPPES shouts everything, and the directory it lands next to does not — so a
 * bug here does not throw, it just makes every imported row look like it came
 * from somewhere else. Both bugs below were found by reading the first import.
 */

describe('titleCaseOrg', () => {
  it('keeps professional and corporate suffixes upper', () => {
    expect(titleCaseOrg('SUMMIT ORTHOPEDICS, LTD')).toBe('Summit Orthopedics, LTD')
    expect(titleCaseOrg('BOCA RATON ORTHOPEDIC ASSOCIATES PLLC')).toBe(
      'Boca Raton Orthopedic Associates PLLC'
    )
  })

  it('title-cases a brand acronym it has no way to recognise', () => {
    // "TRIA" is a brand, "MAYO" is a name, and nothing in the string says
    // which is which. Title case is the safe default: "Tria Orthopaedic
    // Center" reads fine, where lower-casing a name would not. Add the
    // acronym to KEEP if a client ever objects to a specific one.
    expect(titleCaseOrg('TRIA ORTHOPAEDIC CENTER LLC')).toBe('Tria Orthopaedic Center LLC')
  })

  it('rebuilds a dotted suffix without duplicating its letters', () => {
    // Punctuation used to be re-attached by slicing at the bare length, which
    // put back whatever the dots had been hiding: "M.D.," became "MDD.,".
    expect(titleCaseOrg('FRANCISCO J. BORJA, M.D., P.A.')).toBe('Francisco J. Borja, MD., PA.')
  })

  it('title-cases across a hyphen', () => {
    // "Mayo Clinic-rochester" reads as a typo rather than as a place.
    expect(titleCaseOrg('MAYO CLINIC-ROCHESTER')).toBe('Mayo Clinic-Rochester')
  })

  it('lowercases the joining words', () => {
    expect(titleCaseOrg('UNIVERSITY OF FLORIDA BOARD OF TRUSTEES')).toBe(
      'University of Florida Board of Trustees'
    )
  })
})

describe('titleCaseStreet', () => {
  it('writes an address the way the rest of the corpus does', () => {
    expect(titleCaseStreet('1117 N PALAFOX ST')).toBe('1117 N Palafox St')
    expect(titleCaseStreet('5901 E FOWLER AVE STE 100')).toBe('5901 E Fowler Ave Ste 100')
  })

  it('keeps directionals upper and ordinal suffixes lower', () => {
    // Running the organisation caser over this gives "200 1St St Sw", which is
    // worse than leaving it shouting.
    expect(titleCaseStreet('200 1ST ST SW')).toBe('200 1st St SW')
    expect(titleCaseStreet('913 E 26TH ST')).toBe('913 E 26th St')
  })
})
