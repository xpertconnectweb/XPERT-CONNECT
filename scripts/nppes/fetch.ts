/**
 * Harvests orthopedic and neurosurgical providers from the NPPES registry.
 *
 * NPPES is the CMS National Plan and Provider Enumeration System — the federal
 * register every billing provider in the country appears in. It is public
 * domain, needs no key, and is the only free source that gives a practice
 * location and a phone number for a named organisation. It gives no website
 * and no email; those columns stay empty and are a later job.
 *
 * Four things about this API were established by probing it, and each one is
 * load-bearing:
 *
 *  1. `address_purpose=LOCATION` is not optional. Without it `state=MN` matches
 *     the MAILING address, and the first result is a surgeon in Scottsdale.
 *
 *  2. `taxonomy_description` takes the CLASSIFICATION name only. The
 *     subspecialty strings the API itself returns — "Orthopaedic Surgery, Hand
 *     Surgery" — are rejected as queries. Sending one returns error 14, which
 *     is easy to mistake for "there are none of those".
 *
 *  3. The parent query already contains every subspecialty. A search for
 *     "Orthopaedic Surgery" returns records whose taxonomy reads "Orthopaedic
 *     Surgery, Sports Medicine". So there is nothing to gain by splitting on
 *     subspecialty, and per 2 it would not work anyway.
 *
 *  4. `limit` caps at 200 and paging saturates at `skip=1200`: past that the
 *     API repeats the last page instead of ending. Detected here by watching
 *     for a page that adds no new NPI, never by trusting a count.
 *
 * Florida orthopaedics exceeds 1200, so it is partitioned by city. `city` is
 * the only axis that works: `postal_code` wildcards ignore `address_purpose`
 * and drag in California.
 *
 * This is a harvest, not a census, and it says so in its own output. The step
 * after it curates a few hundred practices from what lands here; a solo
 * practitioner in a town no query reached will not change that, but claiming
 * the coverage was total would.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

type State = 'FL' | 'MN'
type Enumeration = 'NPI-1' | 'NPI-2'

const TAXONOMIES = ['Orthopaedic Surgery', 'Neurological Surgery'] as const
const STATES: State[] = ['FL', 'MN']
const ENUMERATIONS: Enumeration[] = ['NPI-1', 'NPI-2']

const PAGE = 200
const MAX_SKIP = 1200
const PACE_MS = 120
const OUT_DIR = join(process.cwd(), 'data', 'nppes')
const PROVIDERS = join(OUT_DIR, 'providers.json')
const INDEX = join(OUT_DIR, '_index.json')

/**
 * Cities seeded so a metro cannot be missed just because the unpartitioned
 * harvest truncated before reaching it. Whatever the harvest discovers is
 * unioned on top, so the seed only has to be plausible, not complete.
 */
const SEED_CITIES: Record<State, string[]> = {
  FL: [
    'JACKSONVILLE', 'MIAMI', 'TAMPA', 'ORLANDO', 'ST PETERSBURG', 'SAINT PETERSBURG',
    'PORT ST LUCIE', 'CAPE CORAL', 'TALLAHASSEE', 'FORT LAUDERDALE', 'PEMBROKE PINES',
    'HOLLYWOOD', 'GAINESVILLE', 'MIRAMAR', 'CORAL SPRINGS', 'PALM BAY', 'WEST PALM BEACH',
    'LAKELAND', 'CLEARWATER', 'POMPANO BEACH', 'MIAMI GARDENS', 'BOCA RATON', 'DELTONA',
    'PALM COAST', 'LARGO', 'MELBOURNE', 'DEERFIELD BEACH', 'BOYNTON BEACH', 'SUNRISE',
    'PLANTATION', 'NAPLES', 'FORT MYERS', 'SARASOTA', 'BRADENTON', 'OCALA', 'KISSIMMEE',
    'PENSACOLA', 'DAYTONA BEACH', 'WINTER PARK', 'ALTAMONTE SPRINGS', 'BRANDON',
    'JUPITER', 'DELRAY BEACH', 'WELLINGTON', 'VERO BEACH', 'PORT CHARLOTTE', 'STUART',
    'THE VILLAGES', 'LEESBURG', 'PANAMA CITY', 'TAMARAC', 'AVENTURA', 'CORAL GABLES',
    'HIALEAH', 'DORAL', 'HOMESTEAD', 'WESTON', 'DAVIE', 'MARGATE', 'OVIEDO',
    'ORANGE CITY', 'SPRING HILL', 'NEW PORT RICHEY', 'TRINITY', 'WESLEY CHAPEL',
    'SAINT AUGUSTINE', 'ST AUGUSTINE', 'ORANGE PARK', 'FLEMING ISLAND', 'MIAMI BEACH',
  ],
  MN: [
    'MINNEAPOLIS', 'SAINT PAUL', 'ST PAUL', 'ROCHESTER', 'DULUTH', 'BLOOMINGTON',
    'BROOKLYN PARK', 'PLYMOUTH', 'WOODBURY', 'MAPLE GROVE', 'ST CLOUD', 'SAINT CLOUD',
    'EDEN PRAIRIE', 'EAGAN', 'COON RAPIDS', 'BURNSVILLE', 'BLAINE', 'LAKEVILLE',
    'MINNETONKA', 'APPLE VALLEY', 'EDINA', 'ST LOUIS PARK', 'SAINT LOUIS PARK',
    'MANKATO', 'MOORHEAD', 'SHAKOPEE', 'MAPLEWOOD', 'RICHFIELD', 'ROSEVILLE',
    'CHASKA', 'FRIDLEY', 'CRYSTAL', 'WINONA', 'ALEXANDRIA', 'BEMIDJI', 'BRAINERD',
    'WILLMAR', 'FERGUS FALLS', 'HIBBING', 'VIRGINIA', 'AUSTIN', 'FARIBAULT', 'OWATONNA',
    'STILLWATER', 'ANOKA', 'ELK RIVER', 'MONTICELLO', 'BUFFALO', 'HUTCHINSON',
    'NORTHFIELD', 'RED WING', 'MARSHALL', 'WORTHINGTON', 'DETROIT LAKES', 'CAMBRIDGE',
  ],
}

interface Taxonomy {
  code: string
  desc: string
  primary: boolean
}

interface Address {
  address_purpose: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postal_code?: string
  telephone_number?: string
}

interface RawRecord {
  number: string
  enumeration_type: Enumeration
  basic: Record<string, string | undefined>
  addresses: Address[]
  taxonomies: Taxonomy[]
}

/** What we keep. The rest of the NPPES payload is not used downstream. */
export interface Provider {
  npi: string
  enumeration: Enumeration
  status: string
  orgName: string | null
  personName: string | null
  credential: string | null
  location: {
    line1: string
    line2: string
    city: string
    state: string
    zip5: string
    phone: string
  } | null
  taxonomies: Taxonomy[]
  /** Which query surfaced it first, so a thin partition stays traceable. */
  via: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function apiUrl(
  taxonomy: string,
  state: State,
  enumeration: Enumeration,
  skip: number,
  city?: string
): string {
  const params = new URLSearchParams({
    version: '2.1',
    taxonomy_description: taxonomy,
    state,
    address_purpose: 'LOCATION',
    enumeration_type: enumeration,
    limit: String(PAGE),
    skip: String(skip),
  })
  if (city) params.set('city', city)
  return `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`
}

async function fetchPage(url: string, attempt = 0): Promise<RawRecord[]> {
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

function toProvider(record: RawRecord, via: string): Provider {
  const loc = record.addresses?.find((a) => a.address_purpose === 'LOCATION') ?? null
  const basic = record.basic ?? {}
  const person = [basic.first_name, basic.last_name].filter(Boolean).join(' ').trim()
  return {
    npi: record.number,
    enumeration: record.enumeration_type,
    status: basic.status ?? '',
    orgName: basic.organization_name?.trim() || null,
    personName: person || null,
    credential: basic.credential?.trim() || null,
    location: loc
      ? {
          line1: (loc.address_1 ?? '').trim(),
          line2: (loc.address_2 ?? '').trim(),
          city: (loc.city ?? '').trim(),
          state: (loc.state ?? '').trim(),
          zip5: (loc.postal_code ?? '').slice(0, 5),
          phone: (loc.telephone_number ?? '').trim(),
        }
      : null,
    taxonomies: (record.taxonomies ?? []).map((t) => ({
      code: t.code,
      desc: t.desc,
      primary: Boolean(t.primary),
    })),
    via,
  }
}

/**
 * Walks one query to its end or to the paging ceiling.
 *
 * Stops on a page that adds no new NPI. That is the saturation signature: past
 * skip=1200 the API keeps answering with 200 rows, and they are the same 200
 * every time.
 */
async function harvest(
  taxonomy: string,
  state: State,
  enumeration: Enumeration,
  sink: Map<string, Provider>,
  city?: string
): Promise<{ added: number; saturated: boolean }> {
  const via = `${taxonomy}|${state}|${enumeration}${city ? `|${city}` : ''}`
  let added = 0
  let lastPageSize = 0
  let skip = 0
  let exhausted = false

  for (; skip <= MAX_SKIP; skip += PAGE) {
    const rows = await fetchPage(apiUrl(taxonomy, state, enumeration, skip, city))
    lastPageSize = rows.length
    if (rows.length === 0) break

    let fresh = 0
    for (const row of rows) {
      if (sink.has(row.number)) continue
      sink.set(row.number, toProvider(row, via))
      fresh++
      added++
    }
    await sleep(PACE_MS)

    // A full page that adds nothing new IS the ceiling: the API has run out
    // of paging and is handing back the same 200 rows. A short page is a
    // genuine end. Distinguishing the two is the whole game — conflating them
    // is how you conclude Florida has exactly 1200 orthopedic practices.
    if (fresh === 0 && skip > 0) {
      exhausted = rows.length === PAGE
      break
    }
    if (rows.length < PAGE) break
  }

  return { added, saturated: exhausted || (skip > MAX_SKIP && lastPageSize === PAGE) }
}

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh')
  mkdirSync(OUT_DIR, { recursive: true })

  const sink = new Map<string, Provider>()
  let done: string[] = []

  if (!refresh && existsSync(PROVIDERS) && existsSync(INDEX)) {
    for (const p of JSON.parse(readFileSync(PROVIDERS, 'utf8')) as Provider[]) sink.set(p.npi, p)
    done = (JSON.parse(readFileSync(INDEX, 'utf8')).completed as string[]) ?? []
    console.log(`Resuming: ${sink.size} providers on disk, ${done.length} queries already done.`)
  }

  const save = () => {
    writeFileSync(PROVIDERS, JSON.stringify(Array.from(sink.values())))
    writeFileSync(INDEX, JSON.stringify({ completed: done, providers: sink.size }, null, 2))
  }

  const saturated: { taxonomy: string; state: State; enumeration: Enumeration }[] = []

  /**
   * A resumed run skips pass 1 entirely, so it would never learn which queries
   * hit the ceiling. Recover that from the data already on disk: a base query
   * that contributed MAX_SKIP records is a query that ran out of paging.
   */
  const contributed = (key: string) => {
    let n = 0
    for (const p of Array.from(sink.values())) if (p.via === key) n++
    return n
  }

  console.log('Pass 1 — unpartitioned queries')
  for (const taxonomy of TAXONOMIES) {
    for (const state of STATES) {
      for (const enumeration of ENUMERATIONS) {
        const key = `${taxonomy}|${state}|${enumeration}`
        if (done.includes(key)) {
          if (contributed(key) >= MAX_SKIP) saturated.push({ taxonomy, state, enumeration })
          continue
        }
        const result = await harvest(taxonomy, state, enumeration, sink)
        done.push(key)
        console.log(
          `  ${key.padEnd(40)} +${String(result.added).padStart(5)}` +
            (result.saturated ? '   [saturated -> splitting by city]' : '')
        )
        if (result.saturated) saturated.push({ taxonomy, state, enumeration })
        save()
      }
    }
  }

  for (const target of saturated) {
    const discovered = new Set<string>()
    for (const p of Array.from(sink.values())) {
      if (p.location?.state === target.state && p.location.city) {
        discovered.add(p.location.city.toUpperCase())
      }
    }
    const cities = Array.from(new Set([...SEED_CITIES[target.state], ...Array.from(discovered)])).sort()
    console.log(
      `\nPass 2 — ${target.taxonomy} / ${target.state} / ${target.enumeration} across ${cities.length} cities`
    )
    for (const city of cities) {
      const key = `${target.taxonomy}|${target.state}|${target.enumeration}|${city}`
      if (done.includes(key)) continue
      const result = await harvest(target.taxonomy, target.state, target.enumeration, sink, city)
      done.push(key)
      if (result.added > 0) console.log(`    ${city.padEnd(26)} +${result.added}`)
      if (done.length % 25 === 0) save()
    }
    save()
  }

  save()

  const byState: Record<string, number> = {}
  const byEnum: Record<string, number> = {}
  for (const p of Array.from(sink.values())) {
    const key = p.location?.state ?? '(none)'
    byState[key] = (byState[key] ?? 0) + 1
    byEnum[p.enumeration] = (byEnum[p.enumeration] ?? 0) + 1
  }

  console.log(`\n${sink.size} distinct providers -> ${PROVIDERS}`)
  console.log(`  by LOCATION state: ${JSON.stringify(byState)}`)
  console.log(`  by type:           ${JSON.stringify(byEnum)}`)
  console.log(
    '\nA harvest, not a census: Florida orthopaedics exceeds what the API will\n' +
      'page through, so its coverage is whatever the city split reached.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
