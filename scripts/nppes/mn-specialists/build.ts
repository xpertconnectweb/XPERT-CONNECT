/**
 * Turns the Minnesota harvest into the client's list of specialist clinics.
 *
 *   npx tsx scripts/nppes/mn-specialists/build.ts [--offline]
 *
 * Reads `raw.json` (from `fetch.ts`) and writes `clinics.json` and `report.md`.
 * Never writes to the database: the client asked for a spreadsheet, and the
 * only thing read from production is the clinic list, to mark which of these
 * are already on Xpert Connect. `--offline` skips both network steps (the
 * Census geocoder and that read) and reuses whatever is cached.
 *
 * A row is a CLINIC, not a provider: an organisation (NPI-2) with its own
 * name, a street address in Minnesota and a phone. Individuals (NPI-1) are
 * never rows; they are only counted, per building, as the providers who work
 * there.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import type { Address } from '../api'
import { formatPhone, titleCaseOrg, titleCaseStreet } from '../text'
import type { NppesRecord } from './fetch'

config({ path: '.env.local' })
config()

const addressKey = require('../../lib/address-key') as {
  canonicalStreet: (line: string) => string
}
const { COUNTY_REGION_MAP } = require('../../lib/mn-regions') as {
  COUNTY_REGION_MAP: Record<string, string>
}

const OFFLINE = process.argv.includes('--offline')
/** Registry entries touched since this date make the main list; older ones go to a separate sheet. */
const RECENT_SINCE = '2022-01-01'
const DIR = join(process.cwd(), 'data', 'nppes', 'mn-specialists')
const CENSUS = join(DIR, 'census')
const RAW = join(DIR, 'raw.json')
const GEOCODE_CACHE = join(CENSUS, 'geocode-cache.json')
const PLATFORM_CACHE = join(CENSUS, 'platform-clinics.json')
const OUT = join(DIR, 'clinics.json')
const REPORT = join(DIR, 'report.md')

// ---- specialties -----------------------------------------------------------

export const GROUPS = ['Injury Physicians', 'Chiropractic', 'Physical Therapy', 'Imaging'] as const
export type Group = (typeof GROUPS)[number]

/** The label shown in the sheet -> the group it files under. */
const LABEL_GROUP: Record<string, Group> = {
  Orthopedics: 'Injury Physicians',
  Spine: 'Injury Physicians',
  'Sports Medicine': 'Injury Physicians',
  Neurosurgery: 'Injury Physicians',
  'Pain Management': 'Injury Physicians',
  'Physical Medicine & Rehabilitation': 'Injury Physicians',
  Neurology: 'Injury Physicians',
  Chiropractic: 'Chiropractic',
  'Physical Therapy': 'Physical Therapy',
  Radiology: 'Imaging',
  MRI: 'Imaging',
}
const LABEL_ORDER = Object.keys(LABEL_GROUP)

/** Neurology proper. `2084P*` is psychiatry and shares the classification. */
const NEUROLOGY = new Set(['2084N0400X', '2084N0402X', '2084N0600X', '2084N0008X', '2084V0102X'])
/** Under Radiology, but not imaging a patient can be referred to. */
const NOT_IMAGING = new Set(['2085R0001X', '2085R0203X', '2085H0002X', '2085R0205X'])

/**
 * Labels for one taxonomy, decided by CODE — a code cannot be spelled two
 * ways. The one exception is Sports Medicine, which is a specialization under
 * five classifications and is reliably named in the description.
 */
function labelsFor(code: string, desc: string): string[] {
  const out: string[] = []
  if (code.startsWith('207X')) {
    out.push('Orthopedics')
    if (/spine/i.test(desc)) out.push('Spine')
  }
  if (code.startsWith('207T')) out.push('Neurosurgery')
  if (
    code.startsWith('208V') ||
    code.startsWith('207LP') ||
    code === '2081P2900X' ||
    code === '2084P2900X' ||
    code === '261QP3300X'
  ) {
    out.push('Pain Management')
  }
  if (code.startsWith('2081')) out.push('Physical Medicine & Rehabilitation')
  if (NEUROLOGY.has(code)) out.push('Neurology')
  if (/sports medicine/i.test(desc ?? '')) out.push('Sports Medicine')
  if (code.startsWith('111N')) out.push('Chiropractic')
  if (code.startsWith('2251') || code === '261QP2000X') out.push('Physical Therapy')
  if ((code.startsWith('2085') && !NOT_IMAGING.has(code)) || code === '261QR0200X') {
    out.push('Radiology')
  }
  if (code === '261QM1200X') out.push('MRI')
  return out
}

function labelsOf(r: NppesRecord): string[] {
  const set = new Set<string>()
  for (const t of r.taxonomies) for (const l of labelsFor(t.code, t.desc ?? '')) set.add(l)
  return LABEL_ORDER.filter((l) => set.has(l))
}

// ---- what is not a clinic --------------------------------------------------

/**
 * Primary taxonomies of organisations that are not a place to send a patient:
 * agencies (home health, hospice, school districts as a Local Education
 * Agency), nursing and residential facilities, labs, suppliers, transport.
 *
 * `17*` ("Other Service Providers") is deliberately NOT here: it holds
 * "Specialist" and "Acupuncturist", which is what a spine-and-pain group and a
 * chiropractic clinic that also does acupuncture put as their primary.
 */
const EXCLUDED_PRIMARY = /^(25|29|30|31|32|33|34|38)/

/**
 * Names of the same kinds of place, for when the primary taxonomy is PT or
 * chiropractic but the organisation is a school district that employs a
 * therapist, or a home-care company that sends one out.
 *
 * Aegis and Optage (Presbyterian Homes) are contract therapy inside nursing
 * homes and senior communities — 60 "clinics" in the first build, none of them
 * a door a patient walks in from the street.
 */
const EXCLUDED_NAME =
  /\b(school|schools|isd|school district|public schools|academy|nursing|senior|assisted living|memory care|transitional care|homes?|manor|home care|homecare|home health|in[- ]home|at home|house ?calls?|mobile|hospice|staffing|travel|billing|pharmacy|medical supply|supplies|equipment|dme|aegis|optage|augustana|animal|equine|veterinary|paws|canine)\b/i

/** Hospital, or general medicine: a system whose branches are not all specialist clinics. */
const HEALTH_SYSTEM = /^(282N|207Q00000X|207R00000X|208D00000X)/

/**
 * An organisation of radiologists is usually a reading group: it bills for
 * interpreting scans taken somewhere else, and has an office no patient visits.
 * Of 20 imaging rows checked on 2026-09-24, every teleradiology firm, reading
 * group and radiologist's personal LLC was one of these. It is an imaging SITE
 * when it is registered as a radiology or MRI facility, when it is a hospital
 * or clinic system, or when its name says it is one.
 */
const IMAGING_FACILITY = new Set(['261QR0200X', '261QM1200X'])
const IMAGING_NAME = /\b(imaging|mri|x-?ray|rayus|diagnostic|scan)\b/i
function isImagingSite(r: NppesRecord): boolean {
  if (r.taxonomies.some((t) => IMAGING_FACILITY.has(t.code) || HEALTH_SYSTEM.test(t.code))) return true
  const names = [r.basic.organization_name ?? '', ...r.otherNames.map((o) => o.name)]
  return names.some((n) => IMAGING_NAME.test(n))
}

/** The codes that put an organisation in one of the four groups. */
const hasLabels = (t: { code: string; desc: string }) => labelsFor(t.code, t.desc ?? '').length > 0

// ---- text ------------------------------------------------------------------

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const LEGAL_SUFFIX = /\b(llc|pllc|pa|p a|pc|p c|ltd|inc|corp|corporation|co|company|llp|lp|chartered|chtd|sc)\b/g

/** A name with its legal form and punctuation removed, for deduplication. */
const nameKey = (s: string) =>
  fold(s)
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Splits "4123 RADIO DR STE 200" into the street and the suite. NPPES puts the
 * suite on line 1 about as often as on line 2.
 */
function splitSuite(line1: string, line2: string): { street: string; suite: string } {
  const m = /\s+((?:ste|suite|unit|rm|room|bldg|building|fl|floor|#)\b.*|#.*)$/i.exec(line1)
  const street = m ? line1.slice(0, m.index) : line1
  const suite = [m ? m[1] : '', line2].map((s) => s.trim()).filter(Boolean).join(', ')
  return { street: street.trim(), suite }
}

function tidySuite(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[.,]/g, '')
      if (/^(ste|suite)$/i.test(bare)) return 'Ste' + (w.endsWith(',') ? ',' : '')
      if (/^\d/.test(w) || /^#/.test(w) || bare.length <= 2) return w.toUpperCase()
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/** "ST PAUL", "SAINT PAUL" and "St. Paul" are one city; write it one way. */
function tidyCity(raw: string): string {
  const t = titleCaseOrg(raw)
  return t.replace(/^(St\.?|Saint)\s+/i, 'St. ')
}

/**
 * The building, without its suite: the unit a phone book would list. Cut with
 * `splitSuite` first, because `canonicalStreet` keeps "FL 1" and that made one
 * Summit Orthopedics building into two.
 */
const buildingKey = (line1: string, zip5: string) =>
  `${addressKey.canonicalStreet(splitSuite(line1, '').street)}|${zip5}`

// ---- rows ------------------------------------------------------------------

export interface ClinicRow {
  name: string
  legalName: string
  group: Group
  groups: Group[]
  specialties: string[]
  street: string
  suite: string
  city: string
  zip: string
  county: string
  region: string
  phone: string
  /** Individual providers of the same specialties registered at this building. */
  providers: number
  onPlatform: { id: string; name: string } | null
  npis: string[]
  /** The newest `last_updated` among the row's NPIs (YYYY-MM-DD). */
  updated: string
  /**
   * Updated in the registry since RECENT_SINCE. The sample check on 2026-09-24
   * confirmed 25 of 33 such rows at their address and 11 of 47 older ones —
   * old entries are where the moved and closed practices are.
   */
  recent: boolean
  census: 'Match' | 'Tie' | 'No_Match' | 'skipped'
  countySource: 'census' | 'zcta' | 'city' | ''
  lat: number | null
  lng: number | null
}

interface Draft {
  key: string
  building: string
  name: string
  legalName: string
  labels: Set<string>
  primaryLabels: Set<string>
  line1: string
  line2: string
  city: string
  zip5: string
  phones: string[]
  npis: string[]
  updated: string
}

const rejects = new Map<string, string[]>()
const reject = (reason: string, detail: string) => {
  if (!rejects.has(reason)) rejects.set(reason, [])
  rejects.get(reason)!.push(detail)
}

/** The locations a record claims in Minnesota: its primary one, then its branches. */
function mnLocations(r: NppesRecord): Address[] {
  const all = [r.location, ...(r.practiceLocations ?? [])].filter(Boolean) as Address[]
  return all.filter((a) => (a.state ?? '').toUpperCase() === 'MN')
}

/**
 * The locations an ORGANISATION row is made from.
 *
 * Branches only for a practice that is mostly what the list is about. A
 * hospital system files one NPI for a whole region: Sanford Health of Northern
 * Minnesota lists 24 branches under one set of taxonomies, and taking them
 * would stamp "Orthopedics" on every primary-care clinic it runs. For such a
 * system the main address is kept and the branches are not.
 */
function orgLocations(r: NppesRecord): Address[] {
  const relevant = r.taxonomies.filter(hasLabels).length / Math.max(1, r.taxonomies.length)
  const system = r.taxonomies.some((t) => HEALTH_SYSTEM.test(t.code))
  const branches = relevant >= 0.25 && !system ? r.practiceLocations ?? [] : []
  const all = [r.location, ...branches].filter(Boolean) as Address[]
  return all.filter((a) => (a.state ?? '').toUpperCase() === 'MN')
}

/**
 * The name on the door at one location.
 *
 * One DBA is the name. Several — Sanford Medical Center files 68 — belong to
 * different branches, and the first one is a wrong name for all the others
 * (it put "Thief River Falls Eye Center" on 25 clinics in Bemidji). Then the
 * DBA that names this location's city is used, or else the legal name.
 */
/** "7TH AVENUE CHIROPRACTIC" comes out of titleCaseOrg as "7TH Avenue"; ordinals go lower. */
const tidyName = (s: string) => s.replace(/\b(\d+)(ST|ND|RD|TH)\b/g, (_, n, suffix) => n + suffix.toLowerCase())

function displayName(r: NppesRecord, city: string): string {
  const legal = r.basic.organization_name ?? ''
  const dbas = r.otherNames.filter((o) => /doing business as/i.test(o.type ?? '')).map((o) => o.name)
  if (dbas.length === 1) return tidyName(titleCaseOrg(dbas[0]))
  const here = fold(city).replace(/^(st|saint) /, '')
  const local = here ? dbas.find((d) => ` ${fold(d)} `.includes(` ${here} `)) : undefined
  return tidyName(titleCaseOrg(local || legal))
}

/**
 * A street line with a building name in front of the number — "LAKE POINTE
 * CORPORATE CENTRE 3100 W. LAKE ST." — is cut to the number. "ONE WEST LAKE
 * STREET" becomes "1 WEST LAKE STREET". A number that follows "HWY" is a route,
 * not a house number, and is left alone.
 */
function streetFromLine(raw: string): string {
  const line = raw.trim()
  if (/^\d/.test(line)) return line
  if (/^one\s/i.test(line)) return line.replace(/^one\s/i, '1 ')
  const m = /\b(\d{1,6}\s+[A-Za-z].*)$/.exec(line)
  if (!m) return line
  const before = line.slice(0, m.index)
  if (/\b(hwy|highway|route|rte|road|rd|county|cr|csah|state|us|interstate|i)\.?\s*$/i.test(before)) return line
  return m[1]
}

// ---- county ----------------------------------------------------------------

interface GeocodeHit {
  match: 'Match' | 'Tie' | 'No_Match'
  countyFips: string | null
  lat: number | null
  lng: number | null
}

function readCountyNames(): Map<string, string> {
  const names = new Map<string, string>()
  const text = readFileSync(join(CENSUS, 'st27_mn_cou2020.txt'), 'utf8')
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [, statefp, countyfp, , name] = line.split('|')
    if (statefp && countyfp && name) names.set(countyfp, name.replace(/ County$/, ''))
  }
  return names
}

/** ZIP -> the county holding most of its land, from the Census 2020 relationship file. */
function readZctaCounties(countyNames: Map<string, string>): Map<string, string> {
  const best = new Map<string, { county: string; land: number }>()
  const text = readFileSync(join(CENSUS, 'zcta_county_natl.txt'), 'utf8')
  for (const line of text.split(/\r?\n/).slice(1)) {
    const f = line.split('|')
    const zcta = f[1]
    const geoid = f[9] ?? ''
    const land = Number(f[16] ?? 0)
    if (!zcta || !geoid.startsWith('27')) continue
    const county = countyNames.get(geoid.slice(2))
    if (!county) continue
    const prev = best.get(zcta)
    if (!prev || land > prev.land) best.set(zcta, { county, land })
  }
  return new Map(Array.from(best, ([z, v]) => [z, v.county]))
}

/** One CSV line of the Census batch response. Fields are quoted; some contain commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

const addressId = (line1: string, city: string, zip5: string) =>
  `${line1.toUpperCase()}|${city.toUpperCase()}|${zip5}`

/**
 * Geocodes through the Census batch endpoint, 1000 addresses per upload, and
 * caches every answer — a No_Match included, so a rerun asks only for what is
 * new. Free, keyless, and it answers with the county FIPS directly.
 */
async function censusGeocode(
  addresses: { id: string; line1: string; city: string; zip5: string }[],
  cache: Record<string, GeocodeHit>
): Promise<void> {
  const todo = addresses.filter((a) => !(a.id in cache))
  if (todo.length === 0 || OFFLINE) return
  console.log(`Census geocoder: ${todo.length} addresses to resolve (${addresses.length - todo.length} cached).`)
  const BATCH = 1000
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH)
    const csv = slice
      .map((a, n) => [String(n), a.line1, a.city, 'MN', a.zip5].map((v) => `"${v.replace(/"/g, '')}"`).join(','))
      .join('\n')
    const form = new FormData()
    form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv')
    form.append('benchmark', 'Public_AR_Current')
    form.append('vintage', 'Current_Current')
    let text = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('https://geocoding.geo.census.gov/geocoder/geographies/addressbatch', {
          method: 'POST',
          body: form,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        text = await res.text()
        break
      } catch (err) {
        if (attempt === 2) throw err
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
      }
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      const f = parseCsvLine(line)
      const a = slice[Number(f[0])]
      if (!a) continue
      const match = (f[2] as GeocodeHit['match']) || 'No_Match'
      const [lng, lat] = (f[5] ?? '').split(',').map(Number)
      cache[a.id] = {
        match,
        countyFips: match === 'Match' && f[8] === '27' ? f[9] ?? null : null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      }
    }
    // An address the response left out is recorded as unmatched, not retried
    // forever.
    for (const a of slice) if (!(a.id in cache)) cache[a.id] = { match: 'No_Match', countyFips: null, lat: null, lng: null }
    writeFileSync(GEOCODE_CACHE, JSON.stringify(cache))
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`)
  }
}

// ---- what is already on the platform ---------------------------------------

interface PlatformClinic {
  id: string
  name: string
  address: string | null
  street: string | null
  city: string | null
  state: string | null
  zip_code: string | null
}

async function readPlatform(): Promise<PlatformClinic[]> {
  if (OFFLINE && existsSync(PLATFORM_CACHE)) return JSON.parse(readFileSync(PLATFORM_CACHE, 'utf8'))
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  // Paged: PostgREST stops at 1000 rows without saying so.
  const rows: PlatformClinic[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('clinics')
      .select('id, name, address, street, city, state, zip_code')
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(`Could not read clinics: ${error.message}`)
    rows.push(...((data ?? []) as PlatformClinic[]))
    if ((data ?? []).length < 1000) break
  }
  writeFileSync(PLATFORM_CACHE, JSON.stringify(rows))
  return rows
}

/** Words that say what kind of place it is, not which one. */
const GENERIC = new Set(
  (
    'the of and at in on clinic clinics center centre health healthcare care medical medicine ' +
    'services service group associates physicians physician specialists specialty chiropractic ' +
    'chiropractor physical therapy therapist rehab rehabilitation sports spine orthopedic orthopedics ' +
    'orthopaedic orthopaedics pain management imaging radiology mri neurology neurosurgery wellness ' +
    'family institute minnesota mn inc llc pa pc ltd pllc one'
  ).split(' ')
)
/** The city is not distinctive: "PDR Burnsville" is not "Burnsville Physical Therapy". */
const distinctive = (name: string, city: string) => {
  const place = new Set(fold(city).split(' '))
  return new Set(nameKey(name).split(' ').filter((w) => w && !GENERIC.has(w) && !place.has(w)))
}

/**
 * Same clinic when it is in the same building AND shares a distinctive word
 * of its name ("Summit" in "Summit Orthopedics Physical Therapy"), or has the
 * same name in the same ZIP. Same building alone is not enough: a medical
 * office building holds a dozen unrelated practices.
 */
function platformMatcher(rows: PlatformClinic[]) {
  const mn = rows.filter((r) => r.state === 'MN' || /,\s*MN\b/.test(r.address ?? ''))
  const byBuilding = new Map<string, PlatformClinic[]>()
  const byNameZip = new Map<string, PlatformClinic>()
  for (const r of mn) {
    const zip = (r.zip_code ?? /\b(\d{5})(?:-\d{4})?\s*$/.exec(r.address ?? '')?.[1] ?? '').slice(0, 5)
    const street = r.street ?? (r.address ?? '').split(',')[0] ?? ''
    if (zip && street) {
      const k = buildingKey(street, zip)
      if (!byBuilding.has(k)) byBuilding.set(k, [])
      byBuilding.get(k)!.push(r)
    }
    if (zip) byNameZip.set(`${nameKey(r.name)}|${zip}`, r)
  }
  return {
    count: mn.length,
    find(d: { name: string; legalName: string; building: string; zip5: string; city: string }) {
      const exact = byNameZip.get(`${nameKey(d.name)}|${d.zip5}`) ?? byNameZip.get(`${nameKey(d.legalName)}|${d.zip5}`)
      if (exact) return exact
      const words = new Set([
        ...Array.from(distinctive(d.name, d.city)),
        ...Array.from(distinctive(d.legalName, d.city)),
      ])
      for (const r of byBuilding.get(d.building) ?? []) {
        if (Array.from(distinctive(r.name, d.city)).some((w) => words.has(w))) return r
      }
      return null
    },
  }
}

// ---- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const records = JSON.parse(readFileSync(RAW, 'utf8')) as NppesRecord[]
  console.log(`${records.length} registry records.`)

  // Individuals, counted per building and per label.
  const providersAt = new Map<string, Map<string, Set<string>>>()
  for (const r of records) {
    if (r.enumeration_type !== 'NPI-1' || (r.basic.status && r.basic.status !== 'A')) continue
    const labels = labelsOf(r)
    if (!labels.length) continue
    for (const loc of mnLocations(r)) {
      const k = buildingKey(loc.address_1 ?? '', (loc.postal_code ?? '').slice(0, 5))
      if (!providersAt.has(k)) providersAt.set(k, new Map())
      const m = providersAt.get(k)!
      for (const l of labels) {
        if (!m.has(l)) m.set(l, new Set())
        m.get(l)!.add(r.number)
      }
    }
  }

  // Organisations, one draft per (name, building).
  const drafts = new Map<string, Draft>()
  let orgs = 0
  for (const r of records) {
    if (r.enumeration_type !== 'NPI-2') continue
    orgs++
    const legalName = tidyName(titleCaseOrg(r.basic.organization_name ?? ''))
    const tag = `${legalName} (${r.number})`
    if (r.basic.status && r.basic.status !== 'A') {
      reject('deactivated NPI', tag)
      continue
    }
    let labels = labelsOf(r)
    if (labels.includes('Radiology') && !isImagingSite(r)) {
      labels = labels.filter((l) => l !== 'Radiology')
      if (!labels.length) {
        reject('radiologists who read scans, not an imaging site', tag)
        continue
      }
    }
    if (!labels.length) {
      reject('no taxonomy in the four groups', `${tag}: ${r.taxonomies.map((t) => t.code).join(' ')}`)
      continue
    }
    const primary = r.taxonomies.find((t) => t.primary) ?? r.taxonomies[0]
    if (primary && EXCLUDED_PRIMARY.test(primary.code)) {
      reject('agency, facility or supplier (primary taxonomy)', `${tag}: ${primary.code} ${primary.desc}`)
      continue
    }
    if (EXCLUDED_NAME.test(legalName)) {
      reject('not a clinic (name)', tag)
      continue
    }
    const locations = orgLocations(r)
    if (!locations.length) {
      reject('practice is outside Minnesota', `${tag}: ${r.location?.state}`)
      continue
    }
    const mainPhone = r.location?.telephone_number ?? ''
    const primaryLabels = new Set(primary ? labelsFor(primary.code, primary.desc ?? '') : [])
    const updated = r.basic.last_updated ?? r.basic.enumeration_date ?? ''

    for (const loc of locations) {
      const line1 = streetFromLine(loc.address_1 ?? '')
      const line2 = (loc.address_2 ?? '').trim()
      const name = displayName(r, loc.city ?? '')
      const where = `${name} (${r.number}) @ ${line1} ${line2}, ${loc.city}`
      if (EXCLUDED_NAME.test(name)) {
        reject('not a clinic (name)', where)
        continue
      }
      if (/^p\s*\.?\s*o\.?\s+box|^pmb\b|general delivery/i.test(line1)) {
        reject('PO Box', where)
        continue
      }
      if (!/^\d/.test(line1)) {
        reject('no street number', where)
        continue
      }
      const phone = formatPhone(loc.telephone_number || mainPhone)
      if (!phone) {
        reject('no phone', where)
        continue
      }
      const zip5 = (loc.postal_code ?? '').slice(0, 5)
      const building = buildingKey(line1, zip5)
      const providerCount = new Set(
        labels.flatMap((l) => Array.from(providersAt.get(building)?.get(l) ?? []))
      ).size
      if (/\b(apt|apartment)\b/i.test(`${line1} ${line2}`) && providerCount < 2) {
        reject('home address (apartment, fewer than 2 providers)', where)
        continue
      }
      const key = `${nameKey(name)}|${building}`
      const d = drafts.get(key)
      if (d) {
        labels.forEach((l) => d.labels.add(l))
        primaryLabels.forEach((l) => d.primaryLabels.add(l))
        d.phones.push(phone)
        if (!d.npis.includes(r.number)) d.npis.push(r.number)
        if (updated > d.updated) d.updated = updated
        continue
      }
      drafts.set(key, {
        key,
        building,
        name,
        legalName,
        labels: new Set(labels),
        primaryLabels,
        line1,
        line2,
        city: loc.city ?? '',
        zip5,
        phones: [phone],
        npis: [r.number],
        updated,
      })
    }
  }
  console.log(`${orgs} organisations -> ${drafts.size} clinic locations after gates and dedup.`)

  // County.
  const countyNames = readCountyNames()
  const zctaCounty = readZctaCounties(countyNames)
  const cache: Record<string, GeocodeHit> = existsSync(GEOCODE_CACHE)
    ? JSON.parse(readFileSync(GEOCODE_CACHE, 'utf8'))
    : {}
  const list = Array.from(drafts.values())
  const addresses = new Map<string, { id: string; line1: string; city: string; zip5: string }>()
  for (const d of list) {
    const id = addressId(d.line1, d.city, d.zip5)
    addresses.set(id, { id, line1: d.line1, city: d.city, zip5: d.zip5 })
  }
  await censusGeocode(Array.from(addresses.values()), cache)

  // City vote, from the addresses the Census placed: the fallback for a ZIP
  // with no ZCTA, which is what a single-organisation ZIP like Mayo's is.
  const cityVotes = new Map<string, Map<string, number>>()
  for (const d of list) {
    const hit = cache[addressId(d.line1, d.city, d.zip5)]
    const county = hit?.countyFips ? countyNames.get(hit.countyFips) : undefined
    if (!county) continue
    const c = tidyCity(d.city)
    if (!cityVotes.has(c)) cityVotes.set(c, new Map())
    cityVotes.get(c)!.set(county, (cityVotes.get(c)!.get(county) ?? 0) + 1)
  }
  const voteCity = (city: string): string | null => {
    const m = cityVotes.get(city)
    if (!m) return null
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
    const [best, n] = Array.from(m).sort((a, b) => b[1] - a[1])[0]
    return n / total >= 2 / 3 ? best : null
  }

  // Already on Xpert Connect.
  const platform = OFFLINE && !existsSync(PLATFORM_CACHE) ? null : platformMatcher(await readPlatform())

  const rows: ClinicRow[] = list.map((d) => {
    const labels = LABEL_ORDER.filter((l) => d.labels.has(l))
    const groups = GROUPS.filter((g) => labels.some((l) => LABEL_GROUP[l] === g))
    const primaryGroup =
      GROUPS.find((g) => Array.from(d.primaryLabels).some((l) => LABEL_GROUP[l] === g)) ?? groups[0]
    const { street, suite } = splitSuite(d.line1, d.line2)
    const city = tidyCity(d.city)
    const hit = cache[addressId(d.line1, d.city, d.zip5)]
    let county = hit?.countyFips ? countyNames.get(hit.countyFips) ?? '' : ''
    let countySource: ClinicRow['countySource'] = county ? 'census' : ''
    if (!county && zctaCounty.has(d.zip5)) {
      county = zctaCounty.get(d.zip5)!
      countySource = 'zcta'
    }
    if (!county) {
      const voted = voteCity(city)
      if (voted) {
        county = voted
        countySource = 'city'
      }
    }
    const providers = new Set(
      labels.flatMap((l) => Array.from(providersAt.get(d.building)?.get(l) ?? []))
    ).size
    const phoneCounts = new Map<string, number>()
    for (const p of d.phones) phoneCounts.set(p, (phoneCounts.get(p) ?? 0) + 1)
    const phone = Array.from(phoneCounts).sort((a, b) => b[1] - a[1])[0][0]
    const onPlatform = platform?.find({
      name: d.name,
      legalName: d.legalName,
      building: d.building,
      zip5: d.zip5,
      city: d.city,
    })
    return {
      name: d.name,
      legalName: d.legalName,
      group: primaryGroup,
      groups,
      specialties: labels,
      street: titleCaseStreet(street),
      suite: tidySuite(suite),
      city,
      zip: d.zip5,
      county,
      region: COUNTY_REGION_MAP[county] ?? '',
      phone,
      providers,
      onPlatform: onPlatform ? { id: onPlatform.id, name: onPlatform.name } : null,
      npis: d.npis,
      census: OFFLINE && !hit ? 'skipped' : hit?.match ?? 'skipped',
      countySource,
      updated: d.updated,
      recent: d.updated >= RECENT_SINCE,
      lat: hit?.lat ?? null,
      lng: hit?.lng ?? null,
    }
  })

  const regionRank = (r: string) => {
    const i = [
      'Twin Cities Metro', 'Central Minnesota', 'Northeast Minnesota', 'Northwest Minnesota',
      'West Central Minnesota', 'South Central Minnesota', 'Southeast Minnesota', 'Southwest Minnesota',
    ].indexOf(r)
    return i < 0 ? 99 : i
  }
  rows.sort(
    (a, b) =>
      regionRank(a.region) - regionRank(b.region) ||
      a.county.localeCompare(b.county) ||
      a.city.localeCompare(b.city) ||
      a.name.localeCompare(b.name)
  )
  writeFileSync(OUT, JSON.stringify(rows, null, 1))
  writeFileSync(REPORT, report(rows, platform?.count ?? null, countyNames))
  console.log(`${rows.length} clinics -> ${OUT}`)
  console.log(`Report -> ${REPORT}`)
}

// ---- report ----------------------------------------------------------------

function report(rows: ClinicRow[], platformCount: number | null, countyNames: Map<string, string>): string {
  const count = <T,>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
    return Array.from(m).sort((a, b) => b[1] - a[1])
  }
  const lines: string[] = []
  const push = (...s: string[]) => lines.push(...s)
  push('# Minnesota specialist clinics — build report', '')
  push(`**${rows.length} clinic locations.** Source: NPPES (CMS NPI Registry), organisations only.`, '')
  push(
    `- Registry entry updated since ${RECENT_SINCE} (main list): **${rows.filter((r) => r.recent).length}**`,
    `- Older entries (separate sheet, confirm before contacting): ${rows.filter((r) => !r.recent).length}`,
    ''
  )
  push('| Group | Main list | Older |', '|---|---:|---:|')
  for (const g of GROUPS) {
    const inG = rows.filter((r) => r.groups.includes(g))
    push(`| ${g} | ${inG.filter((r) => r.recent).length} | ${inG.filter((r) => !r.recent).length} |`)
  }
  push('')

  push('## By group (a clinic in two groups counts in both)', '', '| Group | Clinics | Primary group |', '|---|---:|---:|')
  for (const g of GROUPS) {
    push(`| ${g} | ${rows.filter((r) => r.groups.includes(g)).length} | ${rows.filter((r) => r.group === g).length} |`)
  }
  push('', '## By specialty', '', '| Specialty | Clinics |', '|---|---:|')
  for (const [s, n] of count(rows.flatMap((r) => r.specialties.map((x) => ({ x }))), (o) => o.x)) push(`| ${s} | ${n} |`)

  push('', '## By region', '', '| Region | Clinics |', '|---|---:|')
  for (const [r, n] of count(rows, (r) => r.region || '(unknown)')) push(`| ${r} | ${n} |`)

  const byCounty = new Map(count(rows, (r) => r.county || '(unknown)'))
  const empty = Array.from(countyNames.values()).filter((c) => !byCounty.has(c))
  push('', `## By county — ${byCounty.size - (byCounty.has('(unknown)') ? 1 : 0)} of 87 have at least one`, '')
  push(empty.length ? `Counties with none: ${empty.join(', ')}.` : 'Every county has at least one.', '')
  push('| County | Clinics |', '|---|---:|')
  for (const [c, n] of Array.from(byCounty).sort((a, b) => b[1] - a[1])) push(`| ${c} | ${n} |`)

  push('', '## Data quality', '')
  const bySource = count(rows, (r) => r.countySource || 'none')
  push(`- County from: ${bySource.map(([s, n]) => `${s} ${n}`).join(', ')}.`)
  push(`- Census geocoder: ${count(rows, (r) => r.census).map(([s, n]) => `${s} ${n}`).join(', ')}.`)
  push(`- Rows with no phone: ${rows.filter((r) => !r.phone).length}; no ZIP: ${rows.filter((r) => !r.zip).length}; no county: ${rows.filter((r) => !r.county).length}.`)
  const twins = count(rows, (r) => `${nameKey(r.name)}|${buildingKey(r.street, r.zip)}`).filter(([, n]) => n > 1)
  push(`- Duplicate (name, building) pairs: ${twins.length}.`)
  push(
    `- Already on Xpert Connect: ${
      platformCount === null ? 'not checked (offline)' : `${rows.filter((r) => r.onPlatform).length} (of ${platformCount} MN clinics on the platform)`
    }; new: ${rows.filter((r) => !r.onPlatform).length}.`
  )

  push('', '## Buildings with the most rows', '', 'Several organisations in one building is normal for a medical office building; a long list of one system’s names at one address is worth a look.', '')
  for (const [b, n] of count(rows, (r) => `${r.street}, ${r.city}`).slice(0, 12)) push(`- ${n} × ${b}`)

  push('', '## Rejected', '')
  for (const [reason, items] of Array.from(rejects).sort((a, b) => b[1].length - a[1].length)) {
    push(`### ${reason} — ${items.length}`, '')
    for (const it of items.slice(0, 15)) push(`- ${it}`)
    if (items.length > 15) push(`- … ${items.length - 15} more`)
    push('')
  }
  return lines.join('\n') + '\n'
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
