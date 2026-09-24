/**
 * The NPPES registry API, shared by every script that queries it.
 *
 * Its own module for the same reason as `text.ts`: importing a helper from
 * `fetch.ts` would run that script's `main()` as a side effect.
 *
 * What was established by probing the API is written up at the top of
 * `fetch.ts`. One more fact, found on 2026-09-24 for the Minnesota list:
 * `postal_code` takes a trailing wildcard (`553*`). With `state` and
 * `address_purpose=LOCATION` also set, ~98% of what comes back is located in
 * the state and the rest has a MAILING address there — so a ZIP-prefix
 * partition is a superset of the state, and the LOCATION check downstream
 * trims it. Without `state` it drags in the whole country, which is what
 * `fetch.ts` ran into.
 */

export type Enumeration = 'NPI-1' | 'NPI-2'

export const PAGE = 200
export const MAX_SKIP = 1200
export const PACE_MS = 120

export interface Taxonomy {
  code: string
  desc: string
  primary: boolean
}

export interface Address {
  address_purpose: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postal_code?: string
  telephone_number?: string
}

export interface RawRecord {
  number: string
  enumeration_type: Enumeration
  basic: Record<string, string | undefined>
  addresses: Address[]
  /** Secondary practice locations. Where a group lists its branches. */
  practiceLocations?: Address[]
  /** "Doing Business As" and former names. The DBA is the name on the door. */
  other_names?: { code?: string; type?: string; organization_name?: string }[]
  taxonomies: Taxonomy[]
}

export interface Query {
  taxonomy: string
  state: string
  enumeration: Enumeration
  city?: string
  /** Exact 5-digit ZIP, or a prefix of at least two digits ending in `*`. */
  postalCode?: string
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function apiUrl(query: Query, skip: number): string {
  const params = new URLSearchParams({
    version: '2.1',
    taxonomy_description: query.taxonomy,
    state: query.state,
    address_purpose: 'LOCATION',
    enumeration_type: query.enumeration,
    limit: String(PAGE),
    skip: String(skip),
  })
  if (query.city) params.set('city', query.city)
  if (query.postalCode) params.set('postal_code', query.postalCode)
  return `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`
}

export async function fetchPage(url: string, attempt = 0): Promise<RawRecord[]> {
  try {
    const res = await fetch(url)
    const json = (await res.json()) as {
      results?: RawRecord[]
      Errors?: { description: string }[]
    }
    if (json.Errors?.length) {
      // A rejected taxonomy string comes back as zero results plus an error
      // block. Treating that as "none found" is how a typo becomes a hole
      // nobody notices until the report is short.
      throw new Error(
        `NPPES rejected the query: ${json.Errors.map((e) => e.description).join('; ')}`
      )
    }
    return json.results ?? []
  } catch (err) {
    if (attempt >= 3) throw err
    await sleep(800 * (attempt + 1))
    return fetchPage(url, attempt + 1)
  }
}

/**
 * Walks ONE query to its end or to the paging ceiling, and says which.
 *
 * Saturation is judged against this query's own rows, not against everything
 * collected so far: a page whose NPIs were all found by an earlier, broader
 * query is not a ceiling, and stopping there would lose the pages after it.
 */
export async function walk(query: Query): Promise<{ rows: RawRecord[]; saturated: boolean }> {
  const seen = new Map<string, RawRecord>()
  for (let skip = 0; skip <= MAX_SKIP; skip += PAGE) {
    const rows = await fetchPage(apiUrl(query, skip))
    await sleep(PACE_MS)
    let fresh = 0
    for (const row of rows) {
      if (seen.has(row.number)) continue
      seen.set(row.number, row)
      fresh++
    }
    // A short page is a genuine end. A full page that adds nothing is the API
    // repeating itself past its ceiling.
    if (rows.length < PAGE) return { rows: Array.from(seen.values()), saturated: false }
    if (fresh === 0) return { rows: Array.from(seen.values()), saturated: true }
  }
  // Every page up to MAX_SKIP came back full: there are more than we can reach.
  return { rows: Array.from(seen.values()), saturated: true }
}
