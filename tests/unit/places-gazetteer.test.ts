import { describe, expect, it } from 'vitest'
import {
  FL_PLACES,
  FL_COUNTY_CENTROIDS,
  countyName,
  lookupPlace,
  matchFloridaPlaces,
  nearestCities,
  placesInCounty,
} from '@/lib/places/florida'
import { resolveLocationIntent } from '@/lib/places/intent'
import { interpretQuery } from '@/lib/search/query'
import { haversineDistance } from '@/lib/map/geo'

/** Florida's bounding box, generously. */
const FL_BOUNDS = { south: 24.3, north: 31.1, west: -87.7, east: -79.9 }

describe('the gazetteer file', () => {
  it('loads', () => {
    expect(FL_PLACES.length).toBeGreaterThan(400)
  })

  it('stays small enough to ship to every visitor', () => {
    // It is bundled into the public directory's JS. A gazetteer that
    // grows without anyone noticing is a page-weight regression with no
    // symptom until someone opens the site on a phone.
    const bytes = JSON.stringify(FL_PLACES.map((p) => [p.name, p.county, p.lat, p.lng, p.points]))
      .length
    expect(bytes).toBeLessThan(60_000)
    expect(FL_PLACES.length).toBeLessThan(900)
  })

  it('puts every place inside Florida', () => {
    for (const p of FL_PLACES) {
      expect(p.lat).toBeGreaterThan(FL_BOUNDS.south)
      expect(p.lat).toBeLessThan(FL_BOUNDS.north)
      expect(p.lng).toBeGreaterThan(FL_BOUNDS.west)
      expect(p.lng).toBeLessThan(FL_BOUNDS.east)
    }
  })

  it('has no duplicate name within a county', () => {
    const seen = new Set<string>()
    for (const p of FL_PLACES) {
      const key = `${p.key}|${p.county}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})

describe('lookupPlace', () => {
  it('finds the city the client could not', () => {
    const place = lookupPlace('bradenton')
    expect(place?.county).toBe('Manatee')
    expect(haversineDistance(place!.lat, place!.lng, 27.4989, -82.5748)).toBeLessThan(8)
  })

  /**
   * The source data writes "Saint Augustine" and the corpus writes
   * "St. Augustine". Fifteen firms lost their anchor to a full stop.
   */
  it('treats St. and Saint as the same word', () => {
    expect(lookupPlace('st augustine')?.name).toBe('Saint Augustine')
    expect(lookupPlace('saint augustine')?.name).toBe('Saint Augustine')
    expect(lookupPlace('st petersburg')).not.toBeNull()
    expect(lookupPlace('saint petersburg')).not.toBeNull()
  })

  /**
   * Florida has a Fort Myers in Lee and a sliver of one in Charlotte.
   * Ordering duplicates alphabetically by county anchored the query
   * thirteen miles from the city everyone means.
   */
  it('resolves a repeated name to the larger place', () => {
    expect(lookupPlace('fort myers')?.county).toBe('Lee')
  })

  it('honours a county hint over size', () => {
    expect(lookupPlace('fort myers', 'Charlotte')?.county).toBe('Charlotte')
  })

  it('returns null for something that is not a place', () => {
    expect(lookupPlace('zzzznotacityzzzz')).toBeNull()
  })
})

describe('counties', () => {
  it('knows the counties, bare, the way the table stores them', () => {
    expect(countyName('manatee')).toBe('Manatee')
    expect(countyName('miami dade')).toBe('Miami-Dade')
    expect(FL_COUNTY_CENTROIDS.get('manatee')).toBeDefined()
  })

  it('lists the places in one', () => {
    const names = placesInCounty('Manatee').map((p) => p.name)
    expect(names).toContain('Bradenton')
    expect(names).toContain('Anna Maria')
  })
})

describe('matchFloridaPlaces', () => {
  it('completes a half-typed city', () => {
    expect(matchFloridaPlaces('brad').map((p) => p.name)).toContain('Bradenton')
  })

  it('reaches a multi-word name by its distinctive word', () => {
    expect(matchFloridaPlaces('maria').map((p) => p.name)).toContain('Anna Maria')
  })

  it('offers counties as well as cities', () => {
    const manatee = matchFloridaPlaces('manatee').find((p) => p.isCounty)
    expect(manatee?.name).toBe('Manatee')
  })

  it('accepts the county with its suffix, as the UI renders it', () => {
    expect(matchFloridaPlaces('manatee county').some((p) => p.isCounty)).toBe(true)
  })

  it('says nothing for one character', () => {
    expect(matchFloridaPlaces('b')).toEqual([])
  })
})

describe('resolveLocationIntent', () => {
  const intentOf = (q: string) => resolveLocationIntent(interpretQuery(q))

  it('finds a place at the end of a longer query', () => {
    const intent = intentOf('personal injury bradenton')
    expect(intent?.kind).toBe('city')
    expect(intent?.label).toBe('Bradenton')
    expect(intent?.matched).toEqual(['bradenton'])
  })

  it('reads "Manatee County" as the county', () => {
    const intent = intentOf('manatee county')
    expect(intent?.kind).toBe('county')
    expect(intent?.label).toBe('Manatee County')
  })

  it('ignores the state qualifier', () => {
    expect(intentOf('bradenton fl')?.label).toBe('Bradenton')
    expect(intentOf('bradenton florida')?.label).toBe('Bradenton')
  })

  /**
   * The longest trailing run has to win, or a multi-word city resolves
   * to the shorter place inside it and anchors an hour away.
   */
  it('prefers the longest place name it can make', () => {
    const intent = intentOf('palm beach gardens')
    expect(intent?.label).toBe('Palm Beach Gardens')
  })

  it('returns null when nothing is a place', () => {
    expect(intentOf('zzzznotafirmzzzz')).toBeNull()
  })
})

describe('nearestCities', () => {
  const docs = [
    { city: 'Bradenton', lat: 27.4959, lng: -82.6103 },
    { city: 'Bradenton', lat: 27.49, lng: -82.61 },
    { city: 'Sarasota', lat: 27.3364, lng: -82.5307 },
    { city: 'Miami', lat: 25.7617, lng: -80.1918 },
    { city: null, lat: 27.0, lng: -82.0 },
  ]

  it('orders by distance and counts the docs in each', () => {
    const near = nearestCities(docs, [27.53, -82.7], 3)
    expect(near[0].city).toBe('Bradenton')
    expect(near[0].count).toBe(2)
    expect(near[1].city).toBe('Sarasota')
    expect(near[0].miles).toBeLessThan(near[1].miles)
  })

  it('skips documents with no city', () => {
    expect(nearestCities(docs, [27.53, -82.7], 10).map((c) => c.city)).not.toContain(null)
  })
})
