import { describe, expect, it } from 'vitest'
import { buildSearchIndex, search, suggestEntities } from '@/lib/search/engine'
import { clinicToDoc, lawyerToDoc, toSearchDocs } from '@/lib/search/documents'
import type { ClinicLike, LawyerLike } from '@/lib/search/documents'

/**
 * Fixture modelled on the real corpus, including its landmines: an ALL-CAPS
 * region, a lawyer whose `region` is really a city, a county stored with the
 * "County" suffix, an accented name, and a placeholder row at (0,0).
 */
const CLINICS: ClinicLike[] = [
  {
    id: 'c-1',
    name: 'Newlin Chiropractic',
    address: '1117 N Palafox St, Pensacola, FL 32501',
    lat: 30.4243,
    lng: -87.2181,
    specialties: ['Chiropractic', 'Auto Injuries'],
    region: 'North Florida / Panhandle',
    county: 'Escambia',
    available: true,
  },
  {
    id: 'c-2',
    name: 'Tampa Orthopedic Rehab',
    address: '100 Bay St, Tampa, FL 33602',
    lat: 27.9506,
    lng: -82.4572,
    specialties: ['Orthopedic Rehabilitation', 'Physical Therapy'],
    region: 'WEST CENTRAL FLORIDA (TAMPA BAY)',
    county: 'Hillsborough',
    available: true,
  },
  {
    id: 'c-3',
    name: 'Miami Orthopedic Rehab',
    address: '200 Brickell Ave, Miami, FL 33130',
    lat: 25.7617,
    lng: -80.1918,
    specialties: ['Orthopedic Rehabilitation'],
    region: 'SOUTH FLORIDA',
    county: 'Miami-Dade',
    available: false,
  },
  {
    id: 'c-4',
    name: 'Clinica José Martínez',
    address: 'Melbourne, FL',
    lat: 28.0836,
    lng: -80.6081,
    specialties: ['Medical Clinic'],
    region: 'Central Florida',
    county: 'Brevard',
    available: true,
  },
  {
    // A second chiropractor, so "chiropractic" clears the corrector's minimum
    // document frequency. The real corpus has 275 of them; a single-document
    // term is treated as somebody's name, not a correction target.
    id: 'c-6',
    name: 'Bayou Chiropractic',
    address: '500 Gulf Rd, Pensacola, FL 32503',
    lat: 30.5,
    lng: -87.3,
    specialties: ['Chiropractic'],
    region: 'North Florida / Panhandle',
    county: 'Escambia',
    available: true,
  },
  {
    id: 'c-5',
    name: 'Placeholder Clinic',
    address: 'nowhere',
    lat: 0,
    lng: 0,
    specialties: [],
    region: null,
    county: null,
    available: true,
  },
]

const LAWYERS: LawyerLike[] = [
  {
    id: 'l-1',
    name: 'Bogin Munns & Munns PA',
    address: '2601 Technology Dr, Orlando, FL 32804',
    lat: 28.5383,
    lng: -81.3792,
    practiceAreas: ['Personal Injury'],
    region: 'Orlando',
    county: 'Orange County',
    available: true,
  },
  {
    id: 'l-2',
    name: 'The Law Office of Rene Pichardo',
    address: '9100 SW 107th Ave, Miami, FL 33176',
    lat: 25.6866,
    lng: -80.3689,
    practiceAreas: ['Criminal Defense'],
    region: 'Miami',
    county: 'Miami-Dade County',
    available: true,
  },
]

const index = buildSearchIndex(toSearchDocs(CLINICS, LAWYERS))

const PENSACOLA: [number, number] = [30.4213, -87.2169]
const ORLANDO: [number, number] = [28.5383, -81.3792]

const ids = (query: string, opts = {}) =>
  search(index, query, opts).hits.map((h) => h.doc.id)

describe('indexing', () => {
  it('drops placeholder records at (0,0)', () => {
    expect(index.docs.map((d) => d.id)).not.toContain('c-5')
    expect(clinicToDoc(CLINICS.find((c) => c.id === 'c-5')!)).toBeNull()
  })

  it('derives city, state and ZIP from the address', () => {
    const doc = index.docs.find((d) => d.id === 'c-1')!
    expect(doc.city).toBe('Pensacola')
    expect(doc.state).toBe('FL')
    expect(doc.zip).toBe('32501')
  })

  it('derives a city even when the address has no ZIP', () => {
    const doc = index.docs.find((d) => d.id === 'c-4')!
    expect(doc.city).toBe('Melbourne')
    expect(doc.zip).toBeNull()
  })

  it('normalizes the county suffix so both tables agree', () => {
    expect(index.docs.find((d) => d.id === 'l-1')!.county).toBe('Orange')
    expect(index.docs.find((d) => d.id === 'c-2')!.county).toBe('Hillsborough')
  })

  it('indexes a lawyer’s "region" as a city, because that is what it holds', () => {
    const doc = index.docs.find((d) => d.id === 'l-1')!
    expect(doc.city).toBe('Orlando')
    expect(doc.region).toBeNull()
  })
})

describe('matching', () => {
  it('finds an exact ZIP', () => {
    expect(ids('32501')).toEqual(['c-1'])
  })

  it('never fuzzy-matches a ZIP', () => {
    // 32502 is one edit from 32501 but a different place.
    expect(ids('32502')).toEqual([])
  })

  it('finds by city', () => {
    expect(ids('tampa')).toContain('c-2')
  })

  it('finds by specialty', () => {
    expect(ids('chiropractic')).toContain('c-1')
  })

  it('expands abbreviations', () => {
    expect(ids('ortho')).toEqual(expect.arrayContaining(['c-2', 'c-3']))
  })

  it('is accent-insensitive', () => {
    expect(ids('jose martinez')).toContain('c-4')
  })

  it('tolerates a typo', () => {
    expect(ids('chirpractic')).toContain('c-1')
  })

  it('requires every query token to match — AND, not OR', () => {
    // This is what makes a two-word query actually narrow.
    const result = ids('ortho tampa')
    expect(result).toContain('c-2')
    expect(result).not.toContain('c-3')
  })

  it('finds a firm by generic kind words', () => {
    expect(ids('orlando attorney')).toEqual(['l-1'])
  })

  it('finds by practice area', () => {
    expect(ids('criminal defense')).toEqual(['l-2'])
  })

  it('returns nothing for gibberish', () => {
    expect(ids('zzzqqq')).toEqual([])
  })
})

describe('ranking', () => {
  it('ranks an exact name match first', () => {
    expect(ids('Newlin Chiropractic')[0]).toBe('c-1')
  })

  it('lets a far exact match beat a near partial one', () => {
    // Searching a provider by name must find it, wherever it is.
    const hits = search(index, 'Newlin Chiropractic', { anchor: ORLANDO }).hits
    expect(hits[0].doc.id).toBe('c-1')
    expect(hits[0].distance).toBeGreaterThan(100)
  })

  it('uses distance to order otherwise-equal matches', () => {
    const hits = search(index, 'orthopedic rehabilitation', { anchor: [27.95, -82.45] }).hits
    expect(hits[0].doc.id).toBe('c-2')
  })

  it('falls back to pure proximity for an empty query', () => {
    const hits = search(index, '', { anchor: PENSACOLA }).hits
    expect(hits[0].doc.id).toBe('c-1')
    expect(hits.every((h) => Number.isFinite(h.distance))).toBe(true)
  })

  it('reports Infinity distance with no anchor', () => {
    expect(search(index, '').hits.every((h) => h.distance === Infinity)).toBe(true)
  })

  it('treats availability as a tiebreak, never a filter', () => {
    // c-3 is unavailable but must still be findable.
    expect(ids('miami orthopedic')).toContain('c-3')
  })

  it('is deterministic across repeated runs', () => {
    expect(ids('ortho')).toEqual(ids('ortho'))
  })
})

describe('sorting', () => {
  it('sorts by distance', () => {
    const hits = search(index, '', { anchor: ORLANDO, sort: 'distance' }).hits
    const distances = hits.map((h) => h.distance)
    expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  })

  it('sorts by name', () => {
    const names = search(index, '', { sort: 'name' }).hits.map((h) => h.doc.text.name)
    expect([...names].sort()).toEqual(names)
  })

  it('sorts available first', () => {
    const hits = search(index, 'orthopedic rehabilitation', { sort: 'availability' }).hits
    expect(hits[0].doc.available).toBe(true)
    expect(hits[hits.length - 1].doc.available).toBe(false)
  })
})

describe('filters', () => {
  it('filters by availability', () => {
    expect(ids('orthopedic rehabilitation', { filters: { availableOnly: true } })).toEqual(['c-2'])
  })

  it('filters by type', () => {
    const result = ids('', { filters: { types: ['lawyer'] } })
    expect(result).toEqual(expect.arrayContaining(['l-1', 'l-2']))
    expect(result).not.toContain('c-1')
  })

  it('filters by tag', () => {
    expect(ids('', { filters: { tags: ['Criminal Defense'] } })).toEqual(['l-2'])
  })

  it('filters by county using the normalized form', () => {
    // 'Orange' works even though the lawyer row stores 'Orange County'.
    expect(ids('', { filters: { counties: ['Orange'] } })).toEqual(['l-1'])
  })

  it('filters by a radius around the anchor', () => {
    const nearby = ids('', { anchor: PENSACOLA, radiusMiles: 25 })
    expect(nearby).toEqual(expect.arrayContaining(['c-1', 'c-6']))
    expect(nearby).not.toContain('c-2')
    expect(ids('', { anchor: PENSACOLA, radiusMiles: 1 })).toEqual(['c-1'])
  })

  it('filters by viewport bounds', () => {
    const result = ids('', {
      bounds: { south: 27.5, north: 28.5, west: -83, east: -82 },
    })
    expect(result).toEqual(['c-2'])
  })

  it('applies limit after sorting but reports the full total', () => {
    const outcome = search(index, '', { limit: 2 })
    expect(outcome.hits).toHaveLength(2)
    expect(outcome.total).toBeGreaterThan(2)
  })
})

describe('facets', () => {
  it('counts tags across the result set', () => {
    const { facets } = search(index, '')
    const ortho = facets.tags.find((t) => t.value === 'Orthopedic Rehabilitation')
    expect(ortho?.count).toBe(2)
  })

  it('excludes a facet’s own filter from its counts', () => {
    // Selecting one specialty must not zero out the others, or the chips
    // dead-end and you cannot switch between them.
    const { facets } = search(index, '', { filters: { tags: ['Chiropractic'] } })
    const ortho = facets.tags.find((t) => t.value === 'Orthopedic Rehabilitation')
    expect(ortho?.count).toBe(2)
  })

  it('applies other active filters to a facet’s counts', () => {
    const { facets } = search(index, '', { filters: { types: ['clinic'] } })
    expect(facets.counties.find((c) => c.value === 'Orange')).toBeUndefined()
  })
})

describe('did you mean', () => {
  it('suggests a correction that yields more results', () => {
    // Three edits from "chiropractic" — beyond the matcher's budget, within
    // the corrector's deliberately wider one.
    const outcome = search(index, 'chiroprktik')
    expect(outcome.total).toBe(0)
    expect(outcome.didYouMean).toBe('chiropractic')
    expect(search(index, outcome.didYouMean!).total).toBeGreaterThan(outcome.total)
  })

  it('stays silent when the query already worked', () => {
    expect(search(index, 'ortho').didYouMean).toBeNull()
    expect(search(index, 'chiropractic').didYouMean).toBeNull()
  })

  it('does not "correct" a token that matched as a prefix', () => {
    // "ortho" is a prefix of "orthopedic", doing exactly what it should.
    // Treating anything short of an exact hit as correctable made this
    // propose "north tampa" for "ortho tampa".
    const outcome = search(index, 'ortho tampa')
    expect(outcome.total).toBeGreaterThan(0)
    expect(outcome.didYouMean).toBeNull()
  })

  it('never proposes a correction that does not improve the results', () => {
    // "Did you mean X?" leading to another empty page is worse than silence.
    for (const query of ['zzzqqq', 'chiroprktik', 'ortho', 'xyzzy plugh']) {
      const outcome = search(index, query)
      if (outcome.didYouMean) {
        expect(search(index, outcome.didYouMean).total).toBeGreaterThan(outcome.total)
      }
    }
  })

  it('stays silent when nothing would improve', () => {
    expect(search(index, 'zzzqqq').didYouMean).toBeNull()
  })

  it('does not recurse forever on a thin corrected query', () => {
    expect(() => search(index, 'chiropractik zzzqqq')).not.toThrow()
  })
})

describe('suggestEntities', () => {
  it('returns nothing below two characters', () => {
    expect(suggestEntities(index, 'a')).toEqual([])
    expect(suggestEntities(index, '')).toEqual([])
  })

  it('caps the number of suggestions', () => {
    expect(suggestEntities(index, 'rehab', 1)).toHaveLength(1)
  })
})

describe('documents adapters', () => {
  it('accepts a record with contact details stripped', () => {
    // The professionals and partners APIs withhold `address`; the adapter must
    // still index whatever geography it is given.
    const doc = clinicToDoc({
      id: 'c-9',
      name: 'Stripped Clinic',
      lat: 28,
      lng: -81,
      specialties: ['Chiropractic'],
      available: true,
      city: 'Orlando',
      state: 'FL',
      zipCode: '32801',
    })
    expect(doc).not.toBeNull()
    expect(doc!.city).toBe('Orlando')
    expect(doc!.zip).toBe('32801')
    expect(doc!.tokens.street).toEqual([])
  })

  it('returns null for non-finite coordinates', () => {
    expect(
      lawyerToDoc({
        id: 'l-9',
        name: 'Bad Coords',
        lat: NaN,
        lng: -81,
        practiceAreas: [],
        available: true,
      })
    ).toBeNull()
  })
})

/**
 * The admin tables reuse this core through `useProviderSearchIds`, with two
 * options flipped. Both exist because an admin is looking at the data itself
 * rather than shopping for a provider.
 */
/**
 * The type toggles on the map. `useMapSearch` builds this list from them, so
 * the empty case is not hypothetical: on the clinic map the attorney toggle is
 * already off, and unchecking Clinics leaves the list empty.
 */
describe('type filter', () => {
  it('restricts to the named types', () => {
    const clinics = ids('', { filters: { types: ['clinic'] } })
    expect(clinics.length).toBeGreaterThan(0)
    expect(clinics.every((id) => id.startsWith('c-'))).toBe(true)
  })

  it('treats an EMPTY list as none, not as unfiltered', () => {
    // The bug this replaces: guarding on `.length > 0` made an empty list mean
    // "no filter", so switching every pin type off left every pin on screen and
    // the button looked dead.
    expect(ids('', { filters: { types: [] } })).toEqual([])
  })

  it('still treats an absent list as unfiltered', () => {
    // The directory and the specialists list never set it.
    expect(ids('', { filters: {} }).length).toBeGreaterThan(0)
  })

  it('keeps the facet counts honest while everything is switched off', () => {
    // The chip has to keep saying what turning it back on would give you.
    const outcome = search(index, '', { filters: { types: [] } })
    expect(outcome.hits).toEqual([])
    expect(outcome.facets.types.find((t) => t.value === 'clinic')?.count).toBeGreaterThan(0)
  })
})

describe('admin document options', () => {
  const adminOpts = { requireCoordinates: false, includeKindWords: false }
  const adminIndex = buildSearchIndex(toSearchDocs(CLINICS, LAWYERS, adminOpts))
  const adminIds = (query: string) =>
    search(adminIndex, query).hits.map((h) => h.doc.id)

  it('keeps placeholder records so an admin can find the row that needs fixing', () => {
    expect(adminIndex.docs.map((d) => d.id)).toContain('c-5')
    expect(adminIds('placeholder')).toContain('c-5')
  })

  it('still drops them everywhere else, which is what keeps them off the maps', () => {
    expect(index.docs.map((d) => d.id)).not.toContain('c-5')
  })

  it('gives a placeholder finite coordinates rather than NaN', () => {
    const doc = adminIndex.docs.find((d) => d.id === 'c-5')!
    expect(Number.isFinite(doc.lat)).toBe(true)
    expect(Number.isFinite(doc.lng)).toBe(true)
  })

  it('coerces non-finite coordinates instead of indexing NaN', () => {
    const doc = lawyerToDoc(
      { id: 'l-9', name: 'Bad Coords', lat: NaN, lng: -81, practiceAreas: [], available: true },
      { requireCoordinates: false }
    )
    expect(doc).not.toBeNull()
    expect(doc!.lat).toBe(0)
    expect(doc!.lng).toBe(-81)
  })

  it('stops the type vocabulary from selecting the whole table', () => {
    // On a mixed map "clinic" is a useful way to say "show me the clinics".
    // On the admin clinics table every row is a clinic, so it would match all
    // of them and the query would do nothing.
    expect(ids('clinic')).toContain('c-2')
    expect(adminIds('clinic')).not.toContain('c-2')
    // A firm whose NAME contains the word is still found, which is the whole
    // point of typing it there.
    expect(adminIds('law')).toContain('l-2')
  })

  it('keeps typo tolerance, which the substring filter it replaces had none of', () => {
    expect('Newlin Chiropractic'.toLowerCase().includes('chriopractic')).toBe(false)
    expect(adminIds('chriopractic')).toContain('c-1')
  })

  it('matches on specialty, which the admin substring filter never searched', () => {
    expect(adminIds('orthopedic')).toContain('c-2')
  })
})

/**
 * The queries a client actually typed, and the ones that broke on the
 * way to diagnosing them.
 *
 * Reported as "I search Bradenton in the feed and nothing comes up".
 * The rows were there and the cache was stale — but running the real
 * engine over the live 627-firm corpus turned up eleven more queries
 * that genuinely returned nothing, several of them things any visitor
 * would type. Each one is a case below.
 */
const BRADENTON: LawyerLike[] = [
  {
    id: 'b-1',
    name: 'Wyckoff Law Firm, P.A.',
    address: '4909 Manatee Ave W, Bradenton, FL 34209',
    lat: 27.4959,
    lng: -82.6103,
    practiceAreas: ['Real Estate Law', 'Business Law'],
    region: 'Bradenton',
    county: 'Manatee',
    available: true,
  },
  {
    // Same county, different city, and the only Personal Injury firm
    // anywhere near Bradenton — which is what makes "Personal Injury
    // Bradenton" a question with a useful answer and no exact match.
    id: 'b-2',
    name: 'Palmetto Injury Law',
    address: '600 10th St, Palmetto, FL 34221',
    lat: 27.5214,
    lng: -82.5723,
    practiceAreas: ['Personal Injury'],
    region: 'Palmetto',
    county: 'Manatee',
    available: true,
  },
  {
    // "Miami" must outrank this on the query "Miami".
    id: 'b-3',
    name: 'Yolanda Mendoza Law',
    address: '1674 Meridian Ave, Miami Beach, FL 33139',
    lat: 25.7907,
    lng: -80.13,
    practiceAreas: ['Immigration'],
    region: 'Miami Beach',
    county: 'Miami-Dade',
    available: true,
  },
  {
    id: 'b-4',
    name: 'All Family Law Group, P.A.',
    address: '1234 Kennedy Blvd, Tampa, FL 33602',
    lat: 27.9506,
    lng: -82.4572,
    practiceAreas: ['Family Law'],
    region: 'Tampa',
    county: 'Hillsborough',
    available: true,
  },
]

const wide = buildSearchIndex(toSearchDocs(CLINICS, [...LAWYERS, ...BRADENTON]))
const wideIds = (query: string, opts = {}) =>
  search(wide, query, opts).hits.map((h) => h.doc.id)

describe('the Bradenton regressions', () => {
  it('spells out the state, because people type the word not the code', () => {
    // `state` indexes as "fl", so "florida" matched nothing and the AND
    // gate dropped every Bradenton firm. 0 results against 11.
    expect(wideIds('Bradenton Florida')).toEqual(wideIds('Bradenton FL'))
    expect(wideIds('Bradenton Florida')).toContain('b-1')
  })

  it('accepts the county name the UI itself renders', () => {
    // countyLabel() prints "Manatee County" in the dropdown two inches
    // away, and typing it returned nothing: the county is stored bare,
    // so the token "county" matched no field and gated every row out.
    expect(wideIds('Manatee County')).toEqual(expect.arrayContaining(['b-1', 'b-2']))
    expect(wideIds('Manatee')).toEqual(expect.arrayContaining(['b-1', 'b-2']))
  })

  it('knows divorce is Family Law, from the alias table that already said so', () => {
    expect(wideIds('divorce lawyer Tampa')).toContain('b-4')
  })

  it('reads "car accident" as both a clinic specialty and a practice area', () => {
    // It used to rewrite to "auto injuries" — a clinic specialty — so on
    // a lawyer-only index it found nothing at all.
    const hits = wideIds('car accident')
    expect(hits).toContain('c-1') // Auto Injuries clinic
    expect(hits).toContain('l-1') // Personal Injury attorney
  })

  it('treats "near me" as intent rather than two unmatchable words', () => {
    const outcome = search(wide, 'personal injury near me')
    expect(outcome.interpretation.nearMe).toBe(true)
    expect(outcome.total).toBeGreaterThan(0)
    // It used to propose "personal injury real me".
    expect(outcome.didYouMean).toBeNull()
  })

  it('leaves nearMe false for an ordinary query', () => {
    expect(search(wide, 'Bradenton').interpretation.nearMe).toBe(false)
  })

  it('prefers the city that IS the query over one that merely contains it', () => {
    const hits = wideIds('Miami')
    // l-2 is in Miami, b-3 in Miami Beach. Both match identically on
    // token similarity; only exactness separates them.
    expect(hits.indexOf('l-2')).toBeLessThan(hits.indexOf('b-3'))
  })

  it('narrows to a ZIP instead of ranking by it', () => {
    // "injury attorney 34205" returned 99 firms statewide, correctly
    // ordered. Leading with the right answer is not giving it.
    const zip = search(wide, 'Personal Injury 34209')
    expect(zip.hits.every((h) => h.doc.zip === '34209')).toBe(true)
  })

  it('still widens when the ZIP itself has nothing to offer', () => {
    // The fallback is what makes narrowing safe: a ZIP with no match
    // must not turn a good query into an empty page.
    const outcome = search(wide, 'Personal Injury 99999')
    expect(outcome.total).toBeGreaterThan(0)
  })

  it('keeps the ZIP rescue, so a ZIP finds firms whose words do not match', () => {
    // "32501 chiropractic" must still reach a clinic in that ZIP.
    expect(wideIds('32501 chiropractic')).toContain('c-1')
  })

  it('does not let a bare qualifier return the whole corpus', () => {
    // Reduced-weight tokens are exempt from the AND gate, which leaves
    // a query made only of them with nothing to close on.
    expect(search(wide, 'zzzcounty').total).toBe(0)
  })

  it('requires every token by default, on every surface', () => {
    // The guarantee the portal's map depends on. If this ever passes
    // with requireAll defaulted off, two-word queries stop narrowing.
    expect(wideIds('orthopedic Bradenton')).toEqual([])
    expect(wideIds('orthopedic Bradenton', { requireAll: false }).length).toBeGreaterThan(0)
  })
})
