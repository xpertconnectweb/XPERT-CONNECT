/**
 * The query engine: fifty candidates in, one answer out.
 *
 * Phase 4. `geo_street_search` in Postgres does the cheap, generous half --
 * trigram matching over 567,000 streets, indexed -- and everything expensive
 * and clever happens here, on the fifty rows it returns.
 *
 * That split exists because of a measurement. `src/lib/search/engine.ts` has a
 * scoring model this project trusts, calibrated against real incidents and
 * pinned by ~29,000 comparisons against a reference implementation. But its
 * `search()` walks every document at about 2.3 microseconds each: fine for 872
 * clinics, and twenty-two minutes for 17 million address points. So the index
 * narrows and the good scorer ranks. Its primitives are reused here; its linear
 * scan is not.
 *
 * ── Why the ranking is multiplicative ───────────────────────────────────────
 *
 * Street-name similarity is the only signal that can be right on its own.
 * Everything else -- postcode, city, whether the house number falls inside the
 * block, how near the map is looking -- is corroboration, and corroboration
 * should move a score rather than set it. Added together, three weak agreements
 * could outvote the name; multiplied, they cannot. The name stays in charge.
 *
 * Two things are filters, and only two. The state, which is read server-side
 * from the session and is reliable. And location agreement, which drops a
 * candidate the query says is somewhere else -- because the alternative,
 * measured on this platform's own addresses, was answering a question about
 * Caledonia with a street 1,658 km away.
 *
 * A wrong postcode alone still costs a candidate its lead rather than its
 * existence: people mistype postcodes, and a clinic at the edge of a city has
 * a postal city nobody calls it by. The filter needs BOTH signals to disagree.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { haversineDistance } from '@/lib/map/geo'
import { fold, SUFFIX_TOKEN_WEIGHT } from '@/lib/search/text'
import { tokenSimilarity, trigramSimilarity } from '@/lib/search/fuzzy'
import type { GeocodePrecision } from '@/types/geocode'
import { INTERPOLATION_MAX_SPAN_M } from './constants'
import { findNumber, type NumberMatch } from './payload-codec'
import type { ParsedUsAddress } from './address-parser'
import { canonicalDirectional, canonicalSuffix } from './usps'

/** One row of `geo_street`, as `geo_street_search` returns it. */
export interface StreetRow {
  id: number
  name_norm: string
  name_display: string
  city: string
  state: string
  zip: string
  num_min: number
  num_max: number
  lat_min: number
  lat_max: number
  lng_min: number
  lng_max: number
  point_count: number
  /**
   * pg_trgm's similarity, 0..1.
   *
   * Used to pick the fifty candidates and nothing after that. The ranking is
   * `streetSimilarity`, which weights tokens by how much they distinguish a
   * street and which sees every spelling the parser offered.
   */
  score: number
}

export interface RankedStreet extends StreetRow {
  /** The final ranking score. Comparable within one query, not across queries. */
  rank: number
  /** How well the name alone matched, before any corroboration. */
  nameScore: number
  /** True when the typed house number falls inside this segment's block. */
  numberInRange: boolean
  /** `locationAgreement` for this row. Caps the precision that may be claimed. */
  agreement: number
}

/**
 * Below this, a candidate is noise the trigram stage let through.
 *
 * Deliberately low. The cost of showing one wrong suggestion is that a user
 * ignores it; the cost of dropping the right one is that the address cannot be
 * entered at all, which is the bug this whole engine was built to fix.
 */
const MIN_NAME_SCORE = 0.34

/**
 * Corroboration weights, and the reason they are as small as they are.
 *
 * They started at 1.4 and 0.72, a swing of nearly two, and that was enough to
 * break the rule this file is built on. Asked for "5599 North Stillman Street,
 * Pensacola", the engine answered "5599 N W St": the register holds no 5599 on
 * Stillman -- it runs from 9 to 315 -- but N W St does, so a street whose name
 * barely matched took the exact-number bonus and beat a perfect name match.
 *
 * A house number is evidence about which segment of a street, not about which
 * street. At 1.16 and 0.88 the swing is a third, which can reorder candidates
 * whose names are close and cannot overturn one whose name is right.
 */
const NUMBER_IN_BLOCK = 1.16
const NUMBER_OUTSIDE_BLOCK = 0.88

/**
 * How well a candidate's location agrees with the one the query named, 0..1.
 *
 * This is the single most important function in the ranker, and it exists
 * because of what happened without it. Asked for "183 Spruce St, Caledonia, MN
 * 55921", the engine answered with a Spruce St **1,658 km away**: Houston
 * County publishes no register, so the only Spruce St in Minnesota won by
 * default, and because that row carried no city at all it was scored as
 * "unknown" rather than "wrong" -- which let it beat every candidate that
 * merely disagreed. Eleven of the twelve worst results in the platform's own
 * 876 addresses were this exact shape.
 *
 * The lesson is that absent evidence is not neutral evidence. A row we cannot
 * place is a row we cannot trust, and saying so costs a suggestion where
 * pretending costs a pin in the wrong state.
 *
 * The three-digit postcode is here because it is a real geographic unit -- a
 * USPS sectional centre, roughly a county or two -- and it rescues the common
 * case of a correct address whose postcode is one boundary out.
 */
export function locationAgreement(
  parsed: Pick<ParsedUsAddress, 'zip' | 'city'>,
  row: Pick<StreetRow, 'zip' | 'city'>
): number {
  const askedZip = parsed.zip
  const askedCity = parsed.city ? fold(parsed.city) : null
  if (!askedZip && !askedCity) return 1

  if (askedZip && row.zip) {
    if (row.zip === askedZip) return 1
    if (row.zip.slice(0, 3) === askedZip.slice(0, 3)) {
      /**
       * The sectional centre rescues a postcode one boundary out, and in that
       * case the city almost always still matches. When the city contradicts
       * as well, the two disagreements are not independent noise -- together
       * they are evidence that this is somewhere else, and the three-digit
       * match is just saying "same corner of the state".
       *
       * This was found by re-geocoding the platform's own records. Asked for
       * "411 West Main Street, Kasson, MN 55944" the engine answered "411 Main
       * Street West, Wabasha, MN 55981" and called it `rooftop` -- 69.6 km
       * away, and written into a clinic record before anyone looked. Both are
       * 559xx, so the branch above scored 0.7, cleared CONFIDENT_LOCATION, and
       * the contradicting city was never consulted.
       *
       * 0.45 keeps the candidate -- it is still the best guess if nothing else
       * matches, and MIN_LOCATION_AGREEMENT is 0.25 -- while capping it at
       * `street`, so the UI asks for the pin instead of claiming a building.
       */
      if (askedCity && row.city && fold(row.city) !== askedCity) return 0.45
      return 0.7
    }
  }

  if (askedCity && row.city && fold(row.city) === askedCity) return 0.85

  // Contradicted: the row says where it is, and it is not where we asked.
  if ((askedZip && row.zip) || (askedCity && row.city)) return 0

  // Silent: the source published neither a city nor a postcode for this street,
  // so there is nothing to agree or disagree with. Five percent of the index is
  // like this. Weak, not zero -- some of these are the only record of a real
  // street -- but never enough on its own.
  return 0.3
}

/**
 * Below this, a candidate is not returned at all.
 *
 * A geocoder that answers "somewhere in Minnesota" to a question about
 * Caledonia has not been helpful, it has been wrong in a way that looks right.
 * The provider chain treats an empty answer as a reason to try Geoapify, so
 * dropping these hands them to something that may know better rather than
 * losing them.
 */
const MIN_LOCATION_AGREEMENT = 0.25

/**
 * Below this, a result cannot claim `rooftop` however well its number matched.
 *
 * Precision is a claim about the pin, and the pin is only as good as the
 * weakest link. Finding house number 183 in a register is worthless if it is
 * the wrong Spruce St, so geographic doubt caps precision at `street` and the
 * UI asks the user to place it -- which is exactly what it should do.
 */
const CONFIDENT_LOCATION = 0.6

/**
 * Distance at which the proximity bias has decayed to half, in miles.
 *
 * Twelve, matching `TAU_MILES` in the directory search, and for the same
 * reason: it is roughly a drive across one metropolitan area, so a street in
 * the city being looked at outranks the same street name two cities away
 * without ever excluding it.
 */
const TAU_MILES = 12
/** The most proximity can move a score. A bias, never a filter. */
const PROXIMITY_REACH = 0.3

/**
 * How much a token of a street name is worth, comparing two of them.
 *
 * "N", "ST" and "AVE" appear in a large fraction of the 567,000 names;
 * "STILLMAN" appears on one street in Pensacola. Counting all three equally is
 * what let "N STILLMAN ST" score 0.66 against "N W ST" -- two of its three
 * tokens matched, and the two that matched were the two that mean nothing.
 * Weighted, the same pair scores 0.47, which is the honest answer.
 *
 * `SUFFIX_TOKEN_WEIGHT` is 0.35 and comes from `src/lib/search/text.ts`, where
 * it already discounts "Clinic" and "Center" in firm names for exactly this
 * reason. Same problem, same number, deliberately not a second one to tune.
 */
function tokenWeight(token: string): number {
  return canonicalSuffix(token) || canonicalDirectional(token) ? SUFFIX_TOKEN_WEIGHT : 1
}

/**
 * How well a typed street name matches a stored one, 0..1.
 *
 * Token-aligned rather than whole-string, because "SE 17TH ST" and "17TH ST SE"
 * are the same street written by two counties, and any whole-string measure
 * scores that pair far below the truth.
 *
 * The coverage term is what stops "MAIN" from matching "MAIN STREET CIR E" as
 * well as it matches "MAIN ST". It is deliberately gentle -- someone typing an
 * address is often halfway through it, and a harsh penalty would make
 * autocomplete worse exactly while it is most useful.
 */
export function streetSimilarity(query: string, doc: string): number {
  if (!query || !doc) return 0
  if (query === doc) return 1

  const q = query.split(' ')
  const d = doc.split(' ')

  let total = 0
  let totalWeight = 0
  const matched = new Array<boolean>(d.length)

  for (let i = 0; i < q.length; i++) {
    let best = 0
    let bestAt = -1
    for (let j = 0; j < d.length; j++) {
      const score = tokenSimilarity(q[i], d[j])
      if (score > best) {
        best = score
        bestAt = j
      }
    }
    const weight = tokenWeight(q[i])
    total += best * weight
    totalWeight += weight
    if (bestAt !== -1 && best > 0.5) matched[bestAt] = true
  }

  let covered = 0
  for (let j = 0; j < d.length; j++) if (matched[j]) covered++

  const aligned = (total / (totalWeight || 1)) * (0.82 + 0.18 * (covered / d.length))

  // A whole-string trigram floor, for the cases token alignment mishandles:
  // "62NDST" typed without the space, or a county that hyphenated a name.
  return Math.max(aligned, trigramSimilarity(query, doc))
}

/** Distance in miles from a point to the nearest edge of a street's bounding box. */
function distanceToBox(lat: number, lng: number, row: StreetRow): number {
  const nearestLat = Math.min(Math.max(lat, row.lat_min), row.lat_max)
  const nearestLng = Math.min(Math.max(lng, row.lng_min), row.lng_max)
  return haversineDistance(lat, lng, nearestLat, nearestLng)
}

export interface RankOptions {
  /** The map's current centre, if there is one. Bias only. */
  proximity?: { lat: number; lng: number } | null
  /** How many to return. */
  limit?: number
}

/**
 * Ranks candidates against a parsed query. Pure, and the part worth testing.
 *
 * De-duplicates on the way out. One street can be several rows -- a long road
 * is split per postcode, and a city that publishes separately from its county
 * contributes its own -- and showing "SE 17th St, Ocala" five times is worse
 * than showing it once. The best-ranked row of each group wins, which means the
 * one whose block contains the typed house number, since that is what
 * `NUMBER_IN_BLOCK` is for.
 */
export function rankStreets(
  parsed: ParsedUsAddress,
  rows: readonly StreetRow[],
  options: RankOptions = {}
): RankedStreet[] {
  const limit = options.limit ?? 8
  const wanted = parsed.variants.map(fold).filter(Boolean)

  const ranked: RankedStreet[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    // The best of the spellings the parser offered. A county that wrote
    // "62ND STREET CIR E" should not be penalised for it.
    //
    // Deliberately NOT floored at `row.score`. Postgres computed that against
    // one variant and without token weighting, so using it as a floor would
    // quietly undo the weighting -- a candidate the ranker scored at 0.1
    // would come back as 0.5 because two meaningless tokens matched. Its job
    // is to decide which fifty rows arrive, and it ends there.
    let nameScore = 0
    for (let v = 0; v < wanted.length; v++) {
      const score = streetSimilarity(wanted[v], row.name_norm)
      if (score > nameScore) nameScore = score
    }
    if (nameScore < MIN_NAME_SCORE) continue

    const agreement = locationAgreement(parsed, row)
    if (agreement < MIN_LOCATION_AGREEMENT) continue

    // Multiplied in directly rather than through a weight. Location is not a
    // nudge here -- a candidate half as well placed is half as good an answer.
    let rank = nameScore * agreement

    const numberInRange =
      parsed.number !== null && parsed.number >= row.num_min && parsed.number <= row.num_max

    if (parsed.number !== null) {
      rank *= numberInRange ? NUMBER_IN_BLOCK : NUMBER_OUTSIDE_BLOCK
    }

    if (options.proximity) {
      const miles = distanceToBox(options.proximity.lat, options.proximity.lng, row)
      rank *= 1 + PROXIMITY_REACH * (TAU_MILES / (TAU_MILES + miles))
    }

    ranked.push({ ...row, rank, nameScore, numberInRange, agreement })
  }

  ranked.sort((a, b) => b.rank - a.rank || b.point_count - a.point_count)

  const seen = new Set<string>()
  const out: RankedStreet[] = []
  for (let i = 0; i < ranked.length && out.length < limit; i++) {
    const row = ranked[i]
    const key = `${row.state}\0${fold(row.city)}\0${row.name_norm}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }

  return out
}

/** The centre of a street's bounding box: where the map goes before a number is resolved. */
export function streetCentre(row: StreetRow): { lat: number; lng: number } {
  return { lat: (row.lat_min + row.lat_max) / 2, lng: (row.lng_min + row.lng_max) / 2 }
}

/**
 * The precision vocabulary the whole UI already speaks.
 *
 * The honest mapping, and the reason for building this at all. Measured over
 * 201 county-verified addresses, Geoapify labelled 100% of its answers
 * `rooftop` while only 71% landed within 50 m and nine were over a kilometre
 * out -- so `isExactPrecision` was always true and the "approximate, drag the
 * pin to correct it" prompt never once appeared on a result that needed it.
 *
 * Here `rooftop` means the county register holds this exact house number.
 * Anything else says so.
 */
export function precisionOf(match: NumberMatch, agreement = 1): GeocodePrecision {
  // Geographic doubt caps the claim. Finding house number 183 in a register
  // says nothing if it is the wrong Spruce St, and `street` is what makes the
  // UI ask the user to place the pin -- which is the right thing to ask.
  if (agreement < CONFIDENT_LOCATION) return 'street'
  if (match.kind === 'exact') return 'rooftop'

  if (match.kind === 'interpolated') {
    // A bracket that crosses the road is not a near miss, it is a different
    // kind of answer. Where the register had no same-parity pair, `findNumber`
    // falls back to the numeric neighbours, and leave-one-out puts that case
    // below the 50 m bar in every band it was measured in -- 76% at its very
    // best, against 99% for a same-side pair of the same width. It gets the
    // street, which is the part of it that is true.
    if (match.sameSide === false) return 'street'
    // And a same-side pair can still be too far apart to be placing a door.
    if (match.spanM !== null && match.spanM > INTERPOLATION_MAX_SPAN_M) return 'street'
    return 'interpolated'
  }

  return 'street'
}

/**
 * Where the rows come from.
 *
 * Two implementations exist and both matter. `supabaseStreetStore` is the one
 * that ships. The other lives in `scripts/geo/lib/local-index.ts` and holds the
 * whole index in memory, so Phase 4's gate -- does this engine beat Geoapify --
 * can be answered before a migration has been run against a real database.
 *
 * The interface is narrow on purpose: everything above it is shared, so what
 * the benchmark measures is the code that will actually run, not a
 * reimplementation of it that could quietly disagree.
 */
export interface StreetStore {
  search(query: string, options: StreetSearchOptions): Promise<StreetRow[]>
  /**
   * The packed points for several streets at once.
   *
   * Plural because it has to be. Measured against the live database, fetching
   * eight blobs in one request took 226 ms and fetching one took 218 -- the
   * cost is the round trip and almost nothing else. Resolving a house number
   * for each of eight suggestions one at a time therefore paid the round trip
   * eight times to move the same bytes.
   *
   * Streets with no stored blob are simply absent from the result.
   */
  payloads(streetIds: readonly number[]): Promise<Map<number, Buffer>>

  /**
   * The streets nearest a coordinate, nearest first, for reverse geocoding.
   *
   * `radiusDeg` is in degrees of LATITUDE; implementations widen it for
   * longitude by `1 / cos(lat)`. Ordered by distance to each street's bounding
   * BOX and then by the smaller box -- see `cells.ts` for why both halves of
   * that ordering are load-bearing.
   *
   * Required rather than optional on purpose: `scripts/geo/lib/local-index.ts`
   * has to implement it too, or `gate-reverse.ts` measures thresholds against
   * code that never deploys.
   */
  nearby(
    lat: number,
    lng: number,
    radiusDeg: number,
    limit: number
  ): Promise<StreetRow[]>

  /**
   * Whether the index holds ANY street in this place.
   *
   * Not "is the address there" — "do we have the register at all". Houston
   * County, Minnesota publishes none, so every address in it is absent from the
   * index, and none of those absences means the address does not exist.
   */
  covers(state: string, zip: string | null, city: string | null): Promise<boolean>
}

export interface StreetSearchOptions {
  state?: string | null
  zip?: string | null
  city?: string | null
  limit?: number
}

export const supabaseStreetStore: StreetStore = {
  async covers(state, zip, city) {
    // The postcode first: it is the tighter question and the (state, zip) btree
    // answers it outright. The city is the fallback for the five percent of
    // rows whose source published no postcode.
    for (const [column, value] of [
      ['zip', zip],
      ['city', city],
    ] as const) {
      if (!value) continue
      const { count, error } = await supabaseAdmin
        .from('geo_street')
        .select('id', { count: 'exact' })
        .eq('state', state)
        .eq(column, value)
        .limit(0)

      // A failure here must not be read as "no coverage", which would make the
      // engine authoritative about a place it could not check.
      if (error) return false
      if ((count ?? 0) > 0) return true
    }
    return false
  },

  /**
   * The streets nearest a coordinate, for reverse geocoding.
   *
   * Reads a range of the cell table's primary key, which is why the migration
   * insists on an `EXPLAIN` in Miami as well as Bradenton: `(param is null or
   * column = param)` cost this project a factor of eleven once, and a plan that
   * looks fine on a quiet cell can still fall over on the densest one.
   *
   * Throws rather than returning nothing on error, unlike `covers`. An empty
   * answer here means "no register at this point", which the provider chain
   * treats as a reason to stop; a failed query must not be able to say that.
   */
  async nearby(lat, lng, radiusDeg, limit) {
    const { data, error } = await supabaseAdmin.rpc('geo_street_nearby', {
      q_lat: lat,
      q_lng: lng,
      q_radius_deg: radiusDeg,
      q_limit: limit,
    })

    if (error) throw new Error(`geo_street_nearby: ${error.message}`)
    return (data ?? []) as StreetRow[]
  },

  async search(query, options) {
    const { data, error } = await supabaseAdmin.rpc('geo_street_search', {
      q: query,
      q_state: options.state ?? null,
      q_zip: options.zip ?? null,
      q_city: options.city ? options.city.toUpperCase() : null,
      q_limit: options.limit ?? 50,
    })

    if (error) throw new Error(`geo_street_search: ${error.message}`)
    return (data ?? []) as StreetRow[]
  },

  /**
   * A primary-key read of a few hundred bytes per street, in one request.
   *
   * PostgREST returns bytea as Postgres' hex format: a backslash, an x, then
   * the bytes. `scripts/geo/load-index.ts` verifies that round trip against
   * the first row it writes, before writing the other 567,000.
   */
  async payloads(streetIds) {
    const out = new Map<number, Buffer>()
    if (streetIds.length === 0) return out

    const { data, error } = await supabaseAdmin
      .from('geo_street_points')
      .select('street_id, payload')
      .in('street_id', streetIds as number[])

    if (error || !data) return out

    for (const row of data as Array<{ street_id: number; payload: string }>) {
      out.set(row.street_id, Buffer.from(String(row.payload).replace(/^\\x/, ''), 'hex'))
    }
    return out
  },
}

/** Fetches candidates for a parsed address. */
export async function searchStreets(
  store: StreetStore,
  parsed: ParsedUsAddress,
  options: { state?: string | null; limit?: number } = {}
): Promise<StreetRow[]> {
  const query = fold(parsed.variants[0] ?? '')
  if (!query) return []

  return store.search(query, {
    state: options.state ?? parsed.state ?? null,
    zip: parsed.zip ?? null,
    city: parsed.city ?? null,
    limit: options.limit ?? 50,
  })
}

/**
 * Resolves one house number against each of several streets, in one round trip.
 *
 * Returns a map rather than an array so a street whose blob is missing is
 * absent rather than silently shifting the others along.
 */
export async function resolveNumbers(
  store: StreetStore,
  streetIds: readonly number[],
  number: number | null
): Promise<Map<number, NumberMatch>> {
  const payloads = await store.payloads(streetIds)
  const out = new Map<number, NumberMatch>()
  payloads.forEach((payload, id) => out.set(id, findNumber(payload, number)))
  return out
}
