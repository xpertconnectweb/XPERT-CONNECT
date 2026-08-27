/**
 * Finds the name of a practice that the taxonomy search could not name.
 *
 * This exists because of the single most surprising thing in the NPPES data:
 * the best addresses have no name attached. `200 1ST ST SW, Rochester` has 277
 * orthopedic and neurosurgical providers at it and not one organisation
 * enumerated under an orthopedic taxonomy — because the organisation there is
 * Mayo Clinic, and Mayo is enumerated as a multi-specialty clinic. Roughly
 * half of the addresses worth having are in that position, and `clinics.name`
 * is NOT NULL, so without this step the import would drop exactly the practices
 * a referral is most likely to be worth sending.
 *
 * The fix is a second query that drops the taxonomy filter and asks who is
 * enumerated at that postcode. That returns everyone — including the
 * interpreter, the pharmacy and the medical-equipment supplier down the hall —
 * so the ranking below is doing real work, not tidying.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Provider } from './fetch'
import { titleCaseOrg } from './text'

const addressKey = require('../lib/address-key') as {
  practiceKey: (p: { line1: string; line2: string; city: string; zip5: string }) => string
  canonicalStreet: (line: string) => string
}

const OUT_DIR = join(process.cwd(), 'data', 'nppes')
const PROVIDERS = join(OUT_DIR, 'providers.json')
const NAMES = join(OUT_DIR, 'org-names.json')
/**
 * Postcode lookups cached on disk, not just in memory.
 *
 * The ranking below is the part most likely to need another pass, and
 * without this every tweak costs another few hundred requests to a public
 * federal API for answers already received once.
 */
const ZIP_CACHE = join(OUT_DIR, 'raw-byzip')

const PAGE = 200
const MAX_SKIP = 1200
const PACE_MS = 120

/**
 * Taxonomies that name a building, best first.
 *
 * A hospital's name is the right label for a hospital campus; a
 * multi-specialty clinic's name is right for a clinic building. An orthopedic
 * group is further down only because when one is present at an address, the
 * taxonomy search already found it and this script was never called.
 */
const NAME_PREFERENCE = [
  /^general acute care hospital/i,
  /^clinic\/center, multi-specialty/i,
  /^clinic\/center, ambulatory surgical/i,
  /^orthopaedic surgery/i,
  /^neurological surgery/i,
  /^clinic\/center/i,
  /^physical therapist/i,
  /^chiropractor/i,
]

/**
 * Taxonomies that are at the address but are not what the address is.
 *
 * Every one of these was observed sharing a postcode with a real practice
 * during the probe: an interpreter and a case-management outfit both sit at
 * Mayo's address, and a durable-medical-equipment supplier sits at Regions
 * Hospital's.
 */
const NAME_BLOCKLIST = [
  /interpreter/i,
  /pharmacy/i,
  /durable medical equipment/i,
  /counselor/i,
  /skilled nursing/i,
  /case management/i,
  /hospice/i,
  /transportation/i,
  /home health/i,
  /supplier/i,
  /laboratory/i,
]

interface RawAddress {
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
  basic: Record<string, string | undefined>
  addresses: RawAddress[]
  taxonomies: { code: string; desc: string; primary: boolean }[]
}

export interface ResolvedName {
  name: string
  npi: string
  taxonomy: string
  phone: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchPage(url: string, attempt = 0): Promise<RawRecord[]> {
  try {
    const res = await fetch(url)
    const json = (await res.json()) as { results?: RawRecord[]; Errors?: { description: string }[] }
    if (json.Errors?.length) return []
    return json.results ?? []
  } catch (err) {
    if (attempt >= 3) throw err
    await sleep(800 * (attempt + 1))
    return fetchPage(url, attempt + 1)
  }
}

/** Every NPI-2 enumerated at one postcode, paged to the ceiling. */
async function orgsAtPostcode(state: string, zip5: string): Promise<RawRecord[]> {
  const cached = join(ZIP_CACHE, `${state}-${zip5}.json`)
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as RawRecord[]
  const out: RawRecord[] = []
  const seen = new Set<string>()
  for (let skip = 0; skip <= MAX_SKIP; skip += PAGE) {
    const params = new URLSearchParams({
      version: '2.1',
      state,
      postal_code: zip5,
      address_purpose: 'LOCATION',
      enumeration_type: 'NPI-2',
      limit: String(PAGE),
      skip: String(skip),
    })
    const rows = await fetchPage(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`)
    let fresh = 0
    for (const r of rows) {
      if (seen.has(r.number)) continue
      seen.add(r.number)
      out.push(r)
      fresh++
    }
    await sleep(PACE_MS)
    if (rows.length < PAGE || fresh === 0) break
  }
  mkdirSync(ZIP_CACHE, { recursive: true })
  writeFileSync(cached, JSON.stringify(out))
  return out
}

function preferenceRank(desc: string): number {
  for (let i = 0; i < NAME_PREFERENCE.length; i++) {
    if (NAME_PREFERENCE[i].test(desc)) return i
  }
  return NAME_PREFERENCE.length
}

function isBlocked(descs: string[]): boolean {
  // Blocked only when NOTHING it does is worth naming a building after. A
  // hospital that also runs a pharmacy is still a hospital.
  return descs.every((d) => NAME_BLOCKLIST.some((re) => re.test(d)))
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  const providers = JSON.parse(readFileSync(PROVIDERS, 'utf8')) as Provider[]

  // Cluster exactly the way build-practices will, so the keys line up.
  const clusters = new Map<
    string,
    { state: string; zip5: string; line1: string; hasOrg: boolean; count: number }
  >()
  for (const p of providers) {
    const loc = p.location
    if (!loc || (loc.state !== 'FL' && loc.state !== 'MN')) continue
    if (p.status && p.status !== 'A') continue
    if (/^p\s*\.?\s*o\.?\s+box|^pmb\b|general delivery/i.test(loc.line1)) continue
    const key = addressKey.practiceKey(loc)
    const existing = clusters.get(key)
    if (existing) {
      existing.hasOrg = existing.hasOrg || (p.enumeration === 'NPI-2' && !!p.orgName)
      existing.count++
    } else {
      clusters.set(key, {
        state: loc.state,
        zip5: loc.zip5,
        line1: loc.line1,
        hasOrg: p.enumeration === 'NPI-2' && !!p.orgName,
        count: 1,
      })
    }
  }

  // Only addresses that have nobody to name them and enough providers to be
  // worth the round trip. A single unnamed provider is a solo office; the
  // curation step drops it anyway, so paying for a lookup would be waste.
  const needed = Array.from(clusters.entries())
    .filter(([, c]) => !c.hasOrg && c.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)

  const resolved: Record<string, ResolvedName> = existsSync(NAMES)
    ? JSON.parse(readFileSync(NAMES, 'utf8'))
    : {}

  const postcodeCache = new Map<string, RawRecord[]>()
  console.log(`${clusters.size} clustered addresses; ${needed.length} need a name.`)

  let found = 0
  let missing = 0
  for (const [key, cluster] of needed) {
    if (resolved[key]) continue
    const cacheKey = `${cluster.state}|${cluster.zip5}`
    if (!postcodeCache.has(cacheKey)) {
      postcodeCache.set(cacheKey, await orgsAtPostcode(cluster.state, cluster.zip5))
    }
    const candidates = postcodeCache.get(cacheKey) ?? []
    const wantStreet = addressKey.canonicalStreet(cluster.line1)
    const wantNumber = cluster.line1.split(/\s+/)[0]

    const scored = candidates
      .map((r) => {
        const loc = r.addresses?.find((a) => a.address_purpose === 'LOCATION')
        if (!loc?.address_1) return null
        const descs = r.taxonomies?.map((t) => t.desc) ?? []
        const street = addressKey.canonicalStreet(loc.address_1)
        // `canonicalStreet` is what makes "400 E 3RD ST" and "400 East Third
        // Street" the same address, which they are. The house-number fallback
        // below catches what it still cannot reconcile — a renamed street, a
        // building written by its name rather than its road.
        const exact = street === wantStreet
        const sameNumber = loc.address_1.split(/\s+/)[0] === wantNumber
        if (!exact && !sameNumber) return null
        if (!r.basic?.organization_name) return null
        if (isBlocked(descs)) return null
        // Which taxonomy wins, not just how good the best one was — the row
        // records why this name was chosen, and "Regions Hospital,
        // Psychiatric Unit" reads like a mistake even when the name is right.
        const ranks = descs.map(preferenceRank)
        const best = Math.min(...ranks)
        const bestIndex = ranks.indexOf(best)
        return {
          npi: r.number,
          name: r.basic.organization_name.trim(),
          taxonomy: descs[bestIndex] ?? descs[0] ?? '',
          phone: loc.telephone_number ?? '',
          rank: best,
          exact,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (scored.length === 0) {
      missing++
      continue
    }

    // Exact street match first, then how well the taxonomy names a building,
    // then the name that repeats most at this address — a campus with eight
    // entries under one name is that name.
    const nameFrequency = new Map<string, number>()
    for (const s of scored) nameFrequency.set(s.name, (nameFrequency.get(s.name) ?? 0) + 1)
    scored.sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        a.rank - b.rank ||
        (nameFrequency.get(b.name) ?? 0) - (nameFrequency.get(a.name) ?? 0)
    )

    const winner = scored[0]
    resolved[key] = {
      name: titleCaseOrg(winner.name),
      npi: winner.npi,
      taxonomy: winner.taxonomy,
      phone: winner.phone,
    }
    found++
    if (found % 20 === 0) {
      writeFileSync(NAMES, JSON.stringify(resolved, null, 2))
      console.log(`  ${found} named, ${missing} still anonymous…`)
    }
  }

  writeFileSync(NAMES, JSON.stringify(resolved, null, 2))
  console.log(`\nNamed ${found} addresses, ${missing} could not be named -> ${NAMES}`)
  console.log('Anonymous addresses are dropped by build-practices: clinics.name is NOT NULL,')
  console.log('and a row called "Unknown Practice" is worse than no row.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
