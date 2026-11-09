/**
 * Merges every body-shop source into one list for the client's Sheet.
 *
 *   npx tsx scripts/bodyshops/build.ts
 *
 * Sources, in the order a field is trusted:
 *
 *   1. Chain locators (`web/chains.jsonl`) — the chain's own page for that shop.
 *   2. The web check (`web/<region>.jsonl`) — research agents' visits to each
 *      shop's site or listing, plus independents they found.
 *   3. FDACS (`fdacs/*.csv`, Florida only, not committed) — the state's
 *      motor-vehicle-repair registration: current, with a phone.
 *   4. OpenStreetMap (`osm.json`).
 *   5. EPA ECHO (`epa.json`) — the census of shops filed under NAICS 811121.
 *
 * Records that share a phone, a building or a name in the same ZIP are one
 * shop. A shop goes on its state's sheet when it has a phone and a current
 * source (1–3); the rest go to "Por verificar". A shop the EPA calls inactive
 * and nothing else has seen is dropped as closed.
 *
 * Also writes `todo/<region>.json`: the shops of each region still waiting for
 * a web check, which is what the research agents are handed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { formatPhone, titleCaseOrg, titleCaseStreet } from '../nppes/text'
import type { EpaFacility, OsmShop } from './fetch'

const addressKey = require('../lib/address-key') as { canonicalStreet: (s: string) => string }
const MN = require('../lib/mn-regions') as { COUNTY_REGION_MAP: Record<string, string> }
const FL = require('../lib/fl-regions') as {
  COUNTY_REGION_MAP: Record<string, string>
  countyBand: (county: string) => string | undefined
}

const DIR = join(process.cwd(), 'data', 'bodyshops')
const WEB = join(DIR, 'web')
const FDACS = join(DIR, 'fdacs')
const TODO = join(DIR, 'todo')
const OUT = join(DIR, 'bodyshops.json')
const REPORT = join(DIR, 'report.md')
const ZCTA = join(process.cwd(), 'data', 'nppes', 'mn-specialists', 'census', 'zcta_county_natl.txt')

type State = 'FL' | 'MN'
type Source = 'chain' | 'web' | 'fdacs' | 'osm' | 'epa'
const TRUST: Source[] = ['chain', 'web', 'fdacs', 'osm', 'epa']

// ---- text ------------------------------------------------------------------

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const LEGAL_SUFFIX = /\b(llc|pllc|pa|p a|pc|p c|ltd|inc|corp|corporation|co|company|llp|lp|chartered|chtd|sc|dba)\b/g
/** Words every body shop shares, so "Smith Collision" and "Smith Auto Body" stay one key. */
const TRADE = /\b(collision|collisions|auto|automotive|body|bodyshop|bodyworks|shop|center|centre|repair|repairs|and|paint|of|the)\b/g

const nameKey = (s: string) =>
  fold(s).replace(LEGAL_SUFFIX, ' ').replace(TRADE, ' ').replace(/\s+/g, ' ').trim()

const digits = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').slice(-10)

function splitSuite(line: string): { street: string; suite: string } {
  const m = /\s+((?:ste|suite|unit|rm|room|bldg|building|#)\b.*|#.*)$/i.exec(line)
  if (m) return { street: line.slice(0, m.index), suite: m[1] }
  // A bare unit letter after the street type: "14060 E Colonial Dr A".
  const letter = /^(\d.*\b(?:dr|st|rd|ave|blvd|pkwy|ln|ct|way|trl|cir|pl|drive|street|road|avenue|boulevard|parkway|lane|court|trail|circle|place))\s+([a-z])$/i.exec(line)
  return letter ? { street: letter[1], suite: letter[2] } : { street: line, suite: '' }
}

/**
 * "380 7th St W" and "380 W 7th Street" are one building. Minnesota writes the
 * directional on either side of the street name, so the key always puts it in
 * front. Without this, CSN's page and the shop's own site listed one St. Paul
 * shop twice, and its phone, seen at "three buildings", looked like a head
 * office number and could not join them either.
 */
function frontDirectional(canonical: string): string {
  const m = /^(\d+[a-z]?) (.+) (n|s|e|w|ne|nw|se|sw)$/.exec(canonical)
  return m ? `${m[1]} ${m[3]} ${m[2]}` : canonical
}

const buildingKey = (street: string, zip: string) =>
  `${frontDirectional(addressKey.canonicalStreet(splitSuite(street).street))}|${zip}`

/** "ST PAUL", "SAINT PAUL" and "St. Paul" are one city. */
const tidyCity = (raw: string) => titleCaseOrg(raw.trim()).replace(/^(St\.?|Saint)\s+/i, 'St. ')

/** Misspellings on a chain's own pages (LaMettry's), corrected for the client. */
const TYPOS: [RegExp, string][] = [
  [/\bWesst\b/g, 'West'],
  [/\bNicolett\b/g, 'Nicollet'],
  [/\bInver Groves Heights\b/g, 'Inver Grove Heights'],
]
const fixTypos = (s: string) => TYPOS.reduce((t, [re, to]) => t.replace(re, to), s)

const tidyName = (raw: string) => {
  const t = raw.replace(/\s+/g, ' ').trim()
  // Registries write in capitals; the chains and shops' own sites do not.
  return t === t.toUpperCase() ? titleCaseOrg(t) : t
}

/** A shop the client should not call about a crash: glass, tint, detailing, boats... */
const NOT_A_BODY_SHOP =
  /\b(glass|tint|tinting|detail|detailing|upholster|upholstery|marine|boat|yacht|motorcycle|cycle|harley|rv|trailer|truck body|truck bodies|fleet|aviation|aircraft|wash|car wash|salvage|junk|recycl|towing only|interior)\b/i
/** ...unless the name also says it fixes crashed cars. */
const BODY_WORDS = /\b(collision|body|bodyshop|bodyworks|paint|refinish|carstar|maaco|caliber|gerber|crash)\b/i
const CHAIN_NAME = /\b(caliber|gerber collision|crash champions|service king|carstar|maaco|classic collision|abra auto|fix auto|csn collision|1collision|lamettry)/i
/** Body work, but not on cars: a truck-body builder or a bus shop says "body" too. */
const NOT_CARS = /\b(truck bod(y|ies)|bus|buses|coach|trailers?|rv|marine|boats?|yachts?|aircraft|aviation|motorcycles?)\b/i
const isExcluded = (name: string) => NOT_CARS.test(name) || (NOT_A_BODY_SHOP.test(name) && !BODY_WORDS.test(name))

// ---- geography -------------------------------------------------------------

const STATE_FIPS: Record<State, string> = { FL: '12', MN: '27' }

/** ZIP -> the county holding most of its land, from the Census 2020 relationship file. */
function readZipCounties(): Map<string, { state: State; county: string }> {
  const best = new Map<string, { state: State; county: string; land: number }>()
  for (const line of readFileSync(ZCTA, 'utf8').split(/\r?\n/).slice(1)) {
    const f = line.split('|')
    const zcta = f[1]
    const geoid = f[9] ?? ''
    const state = (Object.keys(STATE_FIPS) as State[]).find((s) => geoid.startsWith(STATE_FIPS[s]))
    if (!zcta || !state) continue
    const county = (f[10] ?? '').replace(/ County$/, '')
    const land = Number(f[16] ?? 0)
    const prev = best.get(zcta)
    if (!prev || land > prev.land) best.set(zcta, { state, county, land })
  }
  return new Map(Array.from(best, ([z, v]) => [z, { state: v.state, county: v.county }]))
}

/** "ST. LOUIS COUNTY", "Saint Louis", "Miami Dade", "De Soto" -> the map's spelling. */
function canonicalCounty(state: State, raw: string): string | null {
  const map = state === 'FL' ? FL.COUNTY_REGION_MAP : MN.COUNTY_REGION_MAP
  const key = (s: string) =>
    fold(s)
      .replace(/\bcounty\b/, '')
      .replace(/\bsaint\b/g, 'st')
      .replace(/\s+/g, '')
  const want = key(raw)
  return Object.keys(map).find((c) => key(c) === want) ?? null
}

const MN_BAND: Record<string, string> = {
  'Twin Cities Metro': 'TWIN CITIES METRO',
  'Central Minnesota': 'NORTHERN MINNESOTA',
  'Northeast Minnesota': 'NORTHERN MINNESOTA',
  'Northwest Minnesota': 'NORTHERN MINNESOTA',
  'West Central Minnesota': 'NORTHERN MINNESOTA',
  'South Central Minnesota': 'SOUTHERN MINNESOTA',
  'Southeast Minnesota': 'SOUTHERN MINNESOTA',
  'Southwest Minnesota': 'SOUTHERN MINNESOTA',
}

const ZIP_RANGE: Record<State, [number, number]> = { FL: [32003, 34997], MN: [55001, 56763] }
const AREA_CODES: Record<State, Set<string>> = {
  FL: new Set(['239', '305', '321', '352', '386', '407', '448', '561', '656', '689', '727', '754', '772', '786', '813', '850', '863', '904', '941', '954']),
  MN: new Set(['218', '320', '507', '612', '651', '763', '952']),
}

// ---- records ---------------------------------------------------------------

/** One sighting of a shop, from one source. */
interface Sighting {
  source: Source
  ref: string
  name: string
  altName?: string
  brand?: string
  street: string
  city: string
  state: State
  zip: string
  county?: string
  phone?: string
  phoneIsCorporate?: boolean
  website?: string
  sourceUrl?: string
  /** EPA: "Active"/"Inactive"/null. Web check: Confirmed/Moved/Closed/... */
  status?: string
  lat?: number | null
  lng?: number | null
}

/**
 * What a shop's phone and address rest on. The first four are the shop or the
 * state speaking; a directory listing (Birdeye, Yahoo Local, MapQuest) only
 * shows that the shop existed when someone last reviewed it. On 2026-11-05 the
 * client found a directory-only row he could not reproduce, so only the first
 * four put a shop on its state's sheet.
 */
export type Evidence = 'chain' | 'registry' | 'website' | 'association' | 'directory' | 'none'
const STRONG: Evidence[] = ['chain', 'registry', 'website', 'association']

export interface Shop {
  id: string
  name: string
  brand: string
  street: string
  city: string
  state: State
  zip: string
  county: string
  region: string
  band: string
  phone: string
  website: string
  confirmed: boolean
  /** The best evidence that the shop operates at this address with this phone. */
  evidence: Evidence
  /** A page the client can open to see that evidence. */
  evidenceUrl: string
  /** Why it is (or is not) on the state sheet, in a few words. */
  basis: string
  sources: Source[]
  sourceUrl: string
  lat: number | null
  lng: number | null
}

const STALE_NOTE = /\b(pre-20(0\d|1\d)|reviews? (from |in )?20(0\d|1\d)|last review 20(0\d|1\d))\b/i

interface WebRow {
  key?: string | null
  status: string
  name?: string
  brand?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  phone?: string
  phoneIsCorporate?: boolean
  website?: string
  sourceUrl?: string
  note?: string
}

function readJsonl(file: string): WebRow[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as WebRow]
      } catch {
        console.warn(`  skipped a bad line in ${file}`)
        return []
      }
    })
}

const asState = (s: string | undefined): State | null => (s === 'FL' || s === 'MN' ? s : null)

function sightings(): { all: Sighting[]; checks: Map<string, WebRow> } {
  const all: Sighting[] = []

  for (const f of JSON.parse(readFileSync(join(DIR, 'epa.json'), 'utf8')) as EpaFacility[]) {
    const state = asState(f.state)
    if (!state || !f.street) continue
    all.push({
      source: 'epa',
      ref: `epa:${f.registryId}`,
      name: f.name,
      street: f.street,
      city: f.city,
      state,
      zip: f.zip,
      county: f.county,
      status: f.rcraStatus ? (f.rcraStatus.startsWith('Active') ? 'Active' : 'Inactive') : undefined,
    })
  }

  for (const o of JSON.parse(readFileSync(join(DIR, 'osm.json'), 'utf8')) as OsmShop[]) {
    const state = asState(o.state)
    if (!state || !o.street || !o.zip) continue
    all.push({
      source: 'osm',
      ref: `osm:${o.osmId}`,
      name: o.name,
      brand: o.tags.brand,
      street: o.street,
      city: o.city ?? '',
      state,
      zip: o.zip,
      phone: o.phone ?? undefined,
      website: o.website ?? undefined,
      lat: o.lat,
      lng: o.lng,
    })
  }

  if (existsSync(FDACS)) {
    for (const file of readdirSync(FDACS).filter((f) => f === 'fdacs.json')) {
      for (const r of JSON.parse(readFileSync(join(FDACS, file), 'utf8')) as Sighting[]) all.push({ ...r, source: 'fdacs' })
    }
  }

  // The pilot's checks name a shop by the id it had in that build; map those
  // ids back to the registry sighting they were built from. Later todo files
  // hand out the sighting's own ref, which does not change between builds.
  const legacy = new Map<string, string>()
  for (const s of all) if (s.source === 'epa' || s.source === 'osm') legacy.set(shopId(s), s.ref)
  const resolve = (key: string) => (/^(epa|osm|fdacs):/.test(key) ? key : legacy.get(key) ?? legacy.get(key.replace(/-\d+$/, '')) ?? key)

  const checks = new Map<string, WebRow>()
  if (existsSync(WEB)) {
    for (const file of readdirSync(WEB).filter((f) => f.endsWith('.jsonl'))) {
      const isChain = file === 'chains.jsonl'
      // An agent that found better evidence appends a correction; the last line for a key wins.
      const lines = readJsonl(join(WEB, file))
      const lastForKey = new Map(lines.map((w, i) => [w.key ?? `#${i}`, i]))
      lines.forEach((w, i) => {
        if (lastForKey.get(w.key ?? `#${i}`) !== i) return
        const ref = w.key ? resolve(w.key) : null
        if (ref) checks.set(ref, w)
        const state = asState(w.state)
        const usable = isChain || w.status === 'Confirmed' || w.status === 'Moved' || w.status === 'New'
        if (!state || !usable || !w.name || !w.street || !w.zip) return
        all.push({
          source: isChain ? 'chain' : 'web',
          ref: ref ?? `${file}:${i}`,
          name: w.name,
          brand: w.brand,
          street: w.street,
          city: w.city ?? '',
          state,
          zip: String(w.zip).slice(0, 5),
          phone: w.phone,
          phoneIsCorporate: w.phoneIsCorporate,
          website: w.website,
          sourceUrl: w.sourceUrl,
          // A shop found only through reviews that stopped years ago is listed, not confirmed.
          status: isChain ? 'Confirmed' : w.status === 'New' && STALE_NOTE.test(w.note ?? '') ? 'Unverified' : w.status,
        })
      })
    }
  }
  // A head-office number is no use for calling a shop: one with an out-of-state
  // area code ("Caliber Bodyworks of Florida" registers its Texas office), or
  // one a source gives for three or more buildings.
  const buildingsPerPhone = new Map<string, Set<string>>()
  for (const s of all) {
    const d = digits(s.phone)
    if (d.length !== 10) continue
    const k = `${s.source}|${d}`
    if (!buildingsPerPhone.has(k)) buildingsPerPhone.set(k, new Set())
    buildingsPerPhone.get(k)!.add(buildingKey(s.street, s.zip))
  }
  for (const s of all) {
    const d = digits(s.phone)
    if (d.length !== 10) continue
    if (!AREA_CODES[s.state].has(d.slice(0, 3)) || (buildingsPerPhone.get(`${s.source}|${d}`)?.size ?? 0) >= 3) s.phoneIsCorporate = true
  }
  return { all, checks }
}

// ---- clustering ------------------------------------------------------------

function cluster(all: Sighting[]): Sighting[][] {
  const parent = all.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }

  // A number shared by shops in several buildings is a head office, not a key.
  const phoneBuildings = new Map<string, Set<string>>()
  all.forEach((s) => {
    const d = digits(s.phone)
    if (d.length !== 10 || s.phoneIsCorporate) return
    if (!phoneBuildings.has(d)) phoneBuildings.set(d, new Set())
    phoneBuildings.get(d)!.add(buildingKey(s.street, s.zip))
  })

  const first = new Map<string, number>()
  const link = (key: string, i: number) => {
    const j = first.get(key)
    if (j === undefined) first.set(key, i)
    else union(i, j)
  }
  all.forEach((s, i) => {
    const b = buildingKey(s.street, s.zip)
    const n = nameKey(s.name)
    // Same building and a name in common, or the same name in the same ZIP.
    if (n) link(`b|${b}|${n}`, i)
    // Not for a chain: Crash Champions has two Jacksonville shops in one ZIP.
    if (n.length >= 4 && s.source !== 'chain') link(`n|${n}|${s.zip}`, i)
    if (s.altName) {
      const a = nameKey(s.altName)
      if (a) link(`b|${b}|${a}`, i)
    }
    const d = digits(s.phone)
    if (d.length === 10 && !s.phoneIsCorporate && (phoneBuildings.get(d)?.size ?? 0) <= 2) link(`p|${d}`, i)
    // A web check of a registry row carries that row's ref, even when the shop moved.
    link(`r|${s.ref}`, i)
  })

  // A building with only one shop in every source is one shop, whatever the
  // names say ("A & J Autobody" in the EPA is "A&J Collision" on its site).
  const byBuilding = new Map<string, number[]>()
  all.forEach((s, i) => {
    const b = buildingKey(s.street, s.zip)
    if (!byBuilding.has(b)) byBuilding.set(b, [])
    byBuilding.get(b)!.push(i)
  })
  for (const members of Array.from(byBuilding.values())) {
    const roots = new Set(members.map(find))
    const sourcesPerRoot = Array.from(roots, (r) => new Set(members.filter((m) => find(m) === r).map((m) => all[m].source)))
    const overlap = sourcesPerRoot.some((a, i) => sourcesPerRoot.some((b, j) => i < j && Array.from(a).some((x) => b.has(x))))
    if (roots.size > 1 && !overlap) members.forEach((m) => union(m, members[0]))
  }

  const groups = new Map<number, Sighting[]>()
  all.forEach((s, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(s)
  })
  return Array.from(groups.values())
}

// ---- merge -----------------------------------------------------------------

const rank = (s: Sighting) => TRUST.indexOf(s.source)
const best = <T>(group: Sighting[], pick: (s: Sighting) => T | undefined | null | '') => {
  for (const s of [...group].sort((a, b) => rank(a) - rank(b))) {
    const v = pick(s)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

function normalizeWebsite(raw: string | undefined): string {
  if (!raw) return ''
  const t = raw.trim()
  if (!/^https?:\/\//i.test(t) && !/^[\w-]+(\.[\w-]+)+/.test(t)) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

const shopId = (s: { state: State; zip: string; street: string; name: string }) =>
  `${s.state.toLowerCase()}-${s.zip}-${fold(splitSuite(s.street).street).replace(/\s+/g, '-').slice(0, 24)}-${nameKey(s.name).replace(/\s+/g, '-').slice(0, 20)}`

const hostOf = (url: string | undefined) => {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
/** A page a person can open: not a store-locator API or an AJAX endpoint. */
const browsable = (url: string | undefined) => !!url && /^https?:/.test(url) && !/\/api\/|admin-ajax|\?action=/.test(url)

const SITECHECK = join(DIR, 'sitecheck.json')
const siteChecks: Record<string, { phones: string[]; status: number | 'error' }> = existsSync(SITECHECK)
  ? JSON.parse(readFileSync(SITECHECK, 'utf8'))
  : {}
/** A site that no longer answers, or answers "not found": no link is better than a dead one. */
const deadSite = (url: string) => {
  const st = siteChecks[url]?.status
  return st === 'error' || (typeof st === 'number' && st >= 404 && st !== 429)
}
const registeredPhones = new Set<string>(
  existsSync(join(FDACS, 'phones.json')) ? (JSON.parse(readFileSync(join(FDACS, 'phones.json'), 'utf8')) as string[]) : []
)

function evidenceFor(group: Sighting[], phone: string, website: string, current: boolean): { kind: Evidence; url: string } {
  const chain = group.find((s) => s.source === 'chain')
  if (chain) return { kind: 'chain', url: browsable(chain.website) ? chain.website! : browsable(chain.sourceUrl) ? chain.sourceUrl! : '' }
  if (group.some((s) => s.source === 'fdacs') || (phone && registeredPhones.has(phone)))
    return { kind: 'registry', url: 'https://consumercompliance.fdacs.gov/Business-Search/' }
  if (website && phone && siteChecks[website]?.phones.includes(phone)) return { kind: 'website', url: website }
  const web = group.filter((s) => s.source === 'web' && s.status !== 'Unverified')
  const own = web.find((s) => s.sourceUrl && website && hostOf(s.sourceUrl) === hostOf(website))
  if (own) return { kind: 'website', url: own.sourceUrl! }
  const assoc = web.find((s) => /aaspmn\.org/.test(s.sourceUrl ?? ''))
  if (assoc) return { kind: 'association', url: assoc.sourceUrl! }
  if (current && web.length) return { kind: 'directory', url: web.find((s) => browsable(s.sourceUrl))?.sourceUrl ?? '' }
  return { kind: 'none', url: '' }
}

function main(): void {
  const zipCounty = readZipCounties()
  const cityCounty = new Map<string, string>()
  for (const f of JSON.parse(readFileSync(join(DIR, 'epa.json'), 'utf8')) as EpaFacility[]) {
    const state = asState(f.state)
    const county = state && canonicalCounty(state, f.county)
    if (state && county && !cityCounty.has(`${state}|${fold(f.city)}`)) cityCounty.set(`${state}|${fold(f.city)}`, county)
  }
  const { all, checks } = sightings()
  const excluded: string[] = []
  const kept = all.filter((s) => {
    if (isExcluded(s.name)) {
      excluded.push(`${s.source}: ${s.name} (${s.city})`)
      return false
    }
    return true
  })

  // A shop the web check found closed or not a body shop takes its sightings with it.
  const dead = new Set(
    Array.from(checks.entries())
      .filter(([, w]) => w.status === 'Closed' || w.status === 'NotBodyShop')
      .map(([k]) => k)
  )

  const shops: Shop[] = []
  /** The registry ref a research agent is handed, and whether one already looked. */
  const pending = new Map<Shop, { key: string; checked: boolean }>()
  const dropped: string[] = []
  for (const group of cluster(kept)) {
    if (group.some((s) => dead.has(s.ref)) && !group.some((s) => s.source === 'chain' || s.source === 'fdacs')) {
      dropped.push(`${group[0].name} (${group[0].city}): web check says ${checks.get(group.find((s) => dead.has(s.ref))!.ref)!.status}`)
      continue
    }
    const sources = Array.from(new Set(group.map((s) => s.source))).sort((a, b) => TRUST.indexOf(a) - TRUST.indexOf(b))
    const current = group.some((s) => s.source === 'chain' || (s.source === 'web' && s.status !== 'Unverified') || s.source === 'fdacs')
    const epaOnly = sources.every((s) => s === 'epa')
    if (epaOnly && group.every((s) => s.status === 'Inactive')) {
      dropped.push(`${group[0].name} (${group[0].city}): EPA inactive, seen nowhere else`)
      continue
    }

    const lead = [...group].sort((a, b) => rank(a) - rank(b))[0]
    const state = lead.state
    const zip = lead.zip
    const zc = zipCounty.get(zip)
    const county =
      canonicalCounty(state, best(group, (s) => s.county) ?? '') ??
      (zc && zc.state === state ? canonicalCounty(state, zc.county) : null) ??
      // A ZIP the Census has no area for (a P.O. box ZIP): the county the EPA gives that city.
      cityCounty.get(`${state}|${fold(lead.city)}`) ??
      null
    const region = county ? (state === 'FL' ? FL.COUNTY_REGION_MAP[county] : MN.COUNTY_REGION_MAP[county]) : ''
    const band = county ? (state === 'FL' ? FL.countyBand(county) ?? '' : MN_BAND[region] ?? '') : ''
    // Only the shop's own line: a head-office number does not count as a phone.
    const phone = best(group, (s) => (s.phone && !s.phoneIsCorporate && digits(s.phone).length === 10 ? s.phone : undefined)) ?? ''
    const brand = best(group, (s) => s.brand) ?? ''
    const street = fixTypos(titleCaseStreet(lead.street.replace(/\s+/g, ' ').trim()))
    // FDACS has no name for a sole proprietor without a DBA: take the next source's.
    const name = tidyName(best(group, (s) => s.name) ?? '')
    if (!name) {
      dropped.push(`(no name) ${lead.street}, ${lead.city}: only an owner's registration`)
      continue
    }

    const listed = normalizeWebsite(best(group, (s) => s.website))
    const website = listed && !deadSite(listed) ? listed : ''
    const evidence = evidenceFor(group, digits(phone), website, current)

    const shop: Shop = {
      id: shopId({ state, zip, street, name }),
      name,
      brand,
      street,
      city: fixTypos(tidyCity(lead.city || best(group, (s) => s.city) || '')),
      state,
      zip,
      county: county ?? '',
      region,
      band,
      phone: phone ? formatPhone(digits(phone)) : '',
      website,
      confirmed: STRONG.includes(evidence.kind) && phone !== '',
      evidence: evidence.kind,
      evidenceUrl: evidence.url,
      basis: current ? sources.filter((s) => s !== 'epa' && s !== 'osm').join('+') : sources.join('+'),
      sources,
      sourceUrl: best(group, (s) => s.sourceUrl) ?? '',
      lat: best(group, (s) => s.lat) ?? null,
      lng: best(group, (s) => s.lng) ?? null,
    }
    // The chains publish every shop they run. A registry row with a chain's
    // name that the chain does not list is an old address, not a lead.
    if (!shop.confirmed && !group.some((s) => s.source === 'chain') && CHAIN_NAME.test(name)) {
      dropped.push(`${name} (${shop.city}): chain name, not on the chain's own site`)
      continue
    }
    shops.push(shop)
    const registry = group.find((s) => s.source === 'osm') ?? group.find((s) => s.source === 'epa') ?? group.find((s) => s.source === 'fdacs')
    if (registry) pending.set(shop, { key: registry.ref, checked: group.some((s) => checks.has(s.ref)) })
  }

  // Ids must be unique; a collision means two shops in one building with one name key.
  const seen = new Map<string, number>()
  for (const s of shops) {
    const n = seen.get(s.id) ?? 0
    seen.set(s.id, n + 1)
    if (n > 0) s.id = `${s.id}-${n + 1}`
  }

  shops.sort((a, b) =>
    [a.state, a.band, a.county, a.city, a.name].join('|').localeCompare([b.state, b.band, b.county, b.city, b.name].join('|'))
  )
  writeFileSync(OUT, JSON.stringify(shops, null, 1))

  // ---- what the web check still has to look at ------------------------------
  mkdirSync(TODO, { recursive: true })
  const todo = new Map<string, unknown[]>()
  for (const s of shops.filter((x) => !x.confirmed)) {
    const p = pending.get(s)
    if (!p || p.checked) continue
    const k = `${s.state}-${(s.region || 'unknown').toLowerCase().replace(/[^a-z]+/g, '-')}`
    if (!todo.has(k)) todo.set(k, [])
    todo.get(k)!.push({ key: p.key, name: s.name, street: s.street, city: s.city, zip: s.zip, county: s.county, phone: s.phone || undefined, website: s.website || undefined, seenIn: s.sources })
  }
  for (const [k, rows] of Array.from(todo)) writeFileSync(join(TODO, `${k}.json`), JSON.stringify(rows, null, 1))

  // ---- report ----------------------------------------------------------------
  const lines: string[] = ['# Body shops: build report', '', `Built ${new Date().toISOString().slice(0, 10)}.`, '']
  for (const state of ['FL', 'MN'] as State[]) {
    const rows = shops.filter((s) => s.state === state)
    const conf = rows.filter((s) => s.confirmed)
    lines.push(`## ${state}`, '', `- Shops: ${rows.length}; confirmed (on the state sheet): ${conf.length}; por verificar: ${rows.length - conf.length}.`)
    const by = (f: (s: Shop) => string, list: Shop[]) =>
      Object.entries(list.reduce<Record<string, number>>((a, s) => ((a[f(s) || '(none)'] = (a[f(s) || '(none)'] ?? 0) + 1), a), {}))
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')
    lines.push(`- Confirmed by basis: ${by((s) => s.basis, conf)}.`)
    lines.push(`- Evidence, all rows: ${by((s) => s.evidence, rows)}.`)
    lines.push(`- Confirmed by band: ${by((s) => s.band, conf)}.`)
    lines.push(`- Confirmed by brand: ${by((s) => s.brand || 'Independent', conf)}.`)
    const badZip = rows.filter((s) => +s.zip < ZIP_RANGE[state][0] || +s.zip > ZIP_RANGE[state][1])
    const badArea = conf.filter((s) => !AREA_CODES[state].has(digits(s.phone).slice(0, 3)))
    const noCounty = rows.filter((s) => !s.region)
    lines.push(`- ZIP outside the state: ${badZip.length}${badZip.length ? ' — ' + badZip.slice(0, 8).map((s) => `${s.name} ${s.zip}`).join('; ') : ''}.`)
    lines.push(`- Confirmed with an out-of-state area code: ${badArea.length}${badArea.length ? ' — ' + badArea.slice(0, 8).map((s) => `${s.name} ${s.phone}`).join('; ') : ''}.`)
    lines.push(`- No county/region: ${noCounty.length}${noCounty.length ? ' — ' + noCounty.slice(0, 8).map((s) => `${s.name} ${s.zip}`).join('; ') : ''}.`, '')
  }
  const pairs = new Map<string, number>()
  shops.forEach((s) => pairs.set(`${nameKey(s.name)}|${buildingKey(s.street, s.zip)}`, (pairs.get(`${nameKey(s.name)}|${buildingKey(s.street, s.zip)}`) ?? 0) + 1))
  lines.push(`Duplicate (name, building) pairs: ${Array.from(pairs.values()).filter((v) => v > 1).length}.`, '')
  lines.push(`Sightings: ${all.length} (${TRUST.map((t) => `${t} ${all.filter((s) => s.source === t).length}`).join(', ')}).`)
  lines.push(`Excluded as not body shops: ${excluded.length}. Dropped: ${dropped.length}.`, '')
  lines.push('## Dropped', '', ...dropped.slice(0, 400).map((d) => `- ${d}`), '', '## Excluded', '', ...excluded.slice(0, 400).map((d) => `- ${d}`), '')
  writeFileSync(REPORT, lines.join('\n'))

  for (const state of ['FL', 'MN']) {
    const rows = shops.filter((s) => s.state === state)
    console.log(`${state}: ${rows.length} shops, ${rows.filter((s) => s.confirmed).length} confirmed`)
  }
  console.log(`todo: ${Array.from(todo, ([k, v]) => `${k} ${v.length}`).join(', ')}`)
}

main()
