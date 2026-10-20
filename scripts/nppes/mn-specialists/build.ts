/**
 * Turns the Minnesota harvest into the client's list of specialist clinics.
 *
 *   npx tsx scripts/nppes/mn-specialists/build.ts [--offline]
 *
 * Reads `raw.json` (from `fetch.ts`) and, when present, the TMJ harvest in
 * `../mn-tmj/` (from `../mn-tmj/fetch.ts`, added 2026-10-19), and writes
 * `clinics.json` and `report.md`.
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
const TMJ_DIR = join(process.cwd(), 'data', 'nppes', 'mn-tmj')
/** The TMJ harvest. Fetched later, so it wins for an NPI the two share. */
const TMJ_RAW = join(TMJ_DIR, 'raw.json')
/**
 * What the web check of every TMJ and oral-surgery row found, from
 * `../mn-tmj/web.ts`. Optional: without it those rows are tiered by registry
 * date like every other row.
 */
const TMJ_WEB = join(TMJ_DIR, 'web.json')
const GEOCODE_CACHE = join(CENSUS, 'geocode-cache.json')
const PLATFORM_CACHE = join(CENSUS, 'platform-clinics.json')
const OUT = join(DIR, 'clinics.json')
const REPORT = join(DIR, 'report.md')

// ---- specialties -----------------------------------------------------------

export const GROUPS = [
  'Injury Physicians',
  'Chiropractic',
  'Physical Therapy',
  'Imaging',
  'TMJ Specialists',
  'Oral Surgery',
] as const
export type Group = (typeof GROUPS)[number]

/** The two groups the TMJ harvest adds. Their rows are the ones the web check covers. */
export const DENTAL_GROUPS: Group[] = ['TMJ Specialists', 'Oral Surgery']

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
  // The dental specialty that is TMJ disorders.
  'Orofacial Pain': 'TMJ Specialists',
  // A clinic whose name says it treats TMJ, whatever it registered as.
  'TMJ Clinic': 'TMJ Specialists',
  // A dentist the web check found treating TMJ as a service of its own.
  'TMJ Treatment': 'TMJ Specialists',
  'Oral & Maxillofacial Surgery': 'Oral Surgery',
}
const LABEL_ORDER = Object.keys(LABEL_GROUP)

/** Oral and maxillofacial surgery: the dentist and physician specializations, and the facility. */
const OMS = new Set(['1223S0112X', '204E00000X', '261QS0112X'])
/** A dental practice: any "Dentist, *" taxonomy, a dental clinic, or an oral-surgery one. */
const isDental = (r: NppesRecord) =>
  r.taxonomies.some((t) => t.code.startsWith('1223') || t.code === '261QD0000X' || OMS.has(t.code))
/**
 * A name that says TMJ. "Minnesota Head and Neck Pain Clinic" is the state's
 * largest TMJ practice; "Craniofacial Imaging" (radiology) and "Minnesota Head
 * and Neck Surgery" (ENT) are not TMJ clinics, so the words are specific.
 */
const TMJ_NAME = /\b(tmj|tmd)\b|orofacial|craniofacial (pain|center)|facial pain|head (and|&) neck pain/i

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
    // Anesthesiology, Pain Medicine. Not `207LP*`: that is also Pediatric
    // Anesthesiology, which filed a children's dental sedation practice here.
    code === '207LP2900X' ||
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
  if (code === '1223X2210X') out.push('Orofacial Pain')
  if (OMS.has(code)) out.push('Oral & Maxillofacial Surgery')
  return out
}

/** NPIs the web check confirmed treat TMJ, from web.json. Filled in `main`. */
const webTmj = new Set<string>()

const namesOf = (r: NppesRecord) => [r.basic.organization_name ?? '', ...r.otherNames.map((o) => o.name)]

function labelsOf(r: NppesRecord): string[] {
  const set = new Set<string>()
  for (const t of r.taxonomies) for (const l of labelsFor(t.code, t.desc ?? '')) set.add(l)
  if (r.enumeration_type === 'NPI-2' && namesOf(r).some((n) => TMJ_NAME.test(n))) set.add('TMJ Clinic')
  if (webTmj.has(r.number)) set.add('TMJ Treatment')
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

/** The University of Minnesota School of Dentistry runs the state's TMD clinic: a school that IS a door. */
const notAClinic = (name: string) => EXCLUDED_NAME.test(name.replace(/school of dentistry/i, ''))

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
  /**
   * Individual TMJ (orofacial pain) specialists and oral surgeons registered
   * at this building with this phone, by name. Only individuals whose own
   * entry was updated since RECENT_SINCE: a name from 2015 is often someone
   * who has left.
   */
  orofacial: string[]
  surgeons: string[]
  /** From the web check (dental groups only). Empty when the row was not checked. */
  website: string
  webCheck: WebStatus | ''
  webNote: string
  /** The practice's own site offers TMJ treatment; null when there was no site to read. */
  treatsTmj: boolean | null
  /** Not in the registry under a TMJ name or code: found on the web. */
  source: 'registry' | 'web'
}

export type WebStatus = 'Confirmed' | 'Moved' | 'Closed' | 'Unverified'

/** One row's web check, keyed by `${first NPI}|${ZIP}` — what `rowKey` returns. */
export interface WebCheck {
  status: WebStatus
  /** The practice presents TMJ / jaw pain treatment as a service of its own. */
  tmj: boolean | null
  website: string
  /** The name on the door, when it differs from the registry's. */
  practice?: string
  /** The phone the practice gives today. The registry's is often an old one. */
  phone?: string
  /** Who the web says practises there, replacing the registry's names: Mayo's registered TMJ dentist has left. */
  specialists?: string[]
  /**
   * The only groups the row belongs in. The University's School of Dentistry
   * registers PT and oral surgery under the same NPI as its TMD clinic; the
   * row the web check found is the TMD clinic.
   */
  only?: Group[]
  /**
   * Why the row is not what its registry code says: a family dentist that
   * registered an oral-surgery code, a clinic that stopped offering it. The
   * row leaves the TMJ and Oral Surgery groups.
   */
  exclude?: string
  /** Where it is now, for a practice that moved: street, city, ZIP. */
  moved?: { street: string; suite?: string; city: string; zip: string; phone?: string }
  note?: string
}

/** A TMJ practice the web found that the registry does not name as one. */
export interface WebFind {
  name: string
  street: string
  suite?: string
  city: string
  zip: string
  phone: string
  website: string
  /** When it IS in the registry, under a general-dentistry code: its NPI, so the row is that record. */
  npi?: string
  /** The TMJ dentist who practises there, when the site names one. */
  dentist?: string
  note?: string
}

export const rowKey = (npi: string, zip: string) => `${npi}|${zip.slice(0, 5)}`

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
  source: 'registry' | 'web'
  orofacial?: string[]
  surgeons?: string[]
  check?: WebCheck
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
const tidyName = (s: string) =>
  s
    .replace(/\b(\d+)(ST|ND|RD|TH)\b/g, (_, n, suffix) => n + suffix.toLowerCase())
    .replace(/\b(tmj|tmd|oms)\b/gi, (w) => w.toUpperCase())
    .replace(/\bHealthpartners\b/g, 'HealthPartners')

/** "JACK BOTROS" + "D.D.S., M.S." -> "Jack Botros, DDS, MS": an individual specialist, as the sheet names one. */
function personName(r: NppesRecord): string {
  const name = titleCaseOrg(`${r.basic.first_name ?? ''} ${r.basic.last_name ?? ''}`)
  const cred = (r.basic.credential ?? '').replace(/\./g, '').replace(/\s*,\s*/g, ', ').trim().toUpperCase()
  return cred ? `${name}, ${cred}` : name
}

const digitsOf = (phone: string | undefined) => (phone ?? '').replace(/\D/g, '').slice(-10)

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
  // "6-440 MOOS HEALTH SCIENCES TOWER, 515 DELAWARE ST. SE": a room number
  // first, then the street. "33-57 HARRISON ST" has no second number and stays.
  if (/^\d+-\d+\s+[A-Za-z]/.test(line)) {
    const m = /\b(\d{1,6}\s+[A-Za-z].*)$/.exec(line.replace(/^\d+-\d+\s+/, ''))
    if (m) return m[1]
  }
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
  const byNpi = new Map<string, NppesRecord>()
  for (const file of [RAW, TMJ_RAW]) {
    if (!existsSync(file)) continue
    for (const r of JSON.parse(readFileSync(file, 'utf8')) as NppesRecord[]) byNpi.set(r.number, r)
  }
  const records = Array.from(byNpi.values())
  console.log(`${records.length} registry records.`)

  // `tmjNpis`, not every check with `tmj: true`: most oral surgeons list TMJ
  // surgery, and filing them all under TMJ would bury the specialists. For
  // them it is a column of the Oral Surgery sheet instead.
  const web: { checks: Record<string, WebCheck>; finds: WebFind[]; tmjNpis: string[] } = existsSync(TMJ_WEB)
    ? JSON.parse(readFileSync(TMJ_WEB, 'utf8'))
    : { checks: {}, finds: [], tmjNpis: [] }
  for (const n of web.tmjNpis) webTmj.add(n)

  // Individuals, counted per building and per label.
  const providersAt = new Map<string, Map<string, Set<string>>>()
  /**
   * Recently updated TMJ specialists and oral surgeons, by building and the
   * phone they answer. Same building AND same phone is the same practice; a
   * medical office building like Southdale's holds a dozen dental practices,
   * so the building alone would hand the specialty to all of them.
   */
  const specialistsAt = new Map<string, { label: string; phone: string; name: string; npi: string }[]>()
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
      if ((r.basic.last_updated ?? '') < RECENT_SINCE) continue
      const b = buildingKey(streetFromLine(loc.address_1 ?? ''), (loc.postal_code ?? '').slice(0, 5))
      for (const label of labels.filter((l) => l === 'Orofacial Pain' || l === 'Oral & Maxillofacial Surgery')) {
        if (!specialistsAt.has(b)) specialistsAt.set(b, [])
        specialistsAt.get(b)!.push({ label, phone: digitsOf(loc.telephone_number), name: personName(r), npi: r.number })
      }
    }
  }
  const specialistsHere = (building: string, phones: string[], label: string) => {
    const want = new Set(phones.map(digitsOf))
    return (specialistsAt.get(building) ?? []).filter((s) => s.label === label && want.has(s.phone))
  }

  // Organisations, one draft per (name, building).
  const drafts = new Map<string, Draft>()
  const addDraft = (d: Omit<Draft, 'key'>) => {
    const key = `${nameKey(d.name)}|${d.building}`
    const prior = drafts.get(key)
    if (!prior) {
      drafts.set(key, { ...d, key })
      return
    }
    d.labels.forEach((l) => prior.labels.add(l))
    d.primaryLabels.forEach((l) => prior.primaryLabels.add(l))
    prior.phones.push(...d.phones)
    for (const n of d.npis) if (!prior.npis.includes(n)) prior.npis.push(n)
    if (d.updated > prior.updated) prior.updated = d.updated
  }
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
    // A dental practice with no TMJ code or name of its own can still be where
    // a TMJ specialist works; that is decided per location, below.
    const dental = isDental(r)
    if (!labels.length && !dental) {
      reject('no taxonomy in the groups', `${tag}: ${r.taxonomies.map((t) => t.code).join(' ')}`)
      continue
    }
    const primary = r.taxonomies.find((t) => t.primary) ?? r.taxonomies[0]
    // Dental sleep practices register as suppliers of the oral appliance they
    // make (332B). One the web found treating TMJ is still a clinic.
    if (primary && EXCLUDED_PRIMARY.test(primary.code) && !webTmj.has(r.number)) {
      reject('agency, facility or supplier (primary taxonomy)', `${tag}: ${primary.code} ${primary.desc}`)
      continue
    }
    if (notAClinic(legalName)) {
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
    // The name is what the business says it is: a TMJ clinic registered under
    // a generic code files under TMJ first.
    if (labels.includes('TMJ Clinic')) primaryLabels.add('TMJ Clinic')
    const updated = r.basic.last_updated ?? r.basic.enumeration_date ?? ''

    for (const loc of locations) {
      const line1 = streetFromLine(loc.address_1 ?? '')
      const line2 = (loc.address_2 ?? '').trim()
      const name = displayName(r, loc.city ?? '')
      const where = `${name} (${r.number}) @ ${line1} ${line2}, ${loc.city}`
      const zip5 = (loc.postal_code ?? '').slice(0, 5)
      const building = buildingKey(line1, zip5)
      let here = labels
      if (dental && !here.includes('Orofacial Pain')) {
        const ofp = specialistsHere(building, [loc.telephone_number || mainPhone], 'Orofacial Pain')
        if (ofp.length) here = LABEL_ORDER.filter((l) => l === 'Orofacial Pain' || here.includes(l))
      }
      if (!here.length) {
        reject('dental practice with no TMJ code, name or specialist', where)
        continue
      }
      if (notAClinic(name)) {
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
      const providerCount = new Set(
        here.flatMap((l) => Array.from(providersAt.get(building)?.get(l) ?? []))
      ).size
      if (/\b(apt|apartment)\b/i.test(`${line1} ${line2}`) && providerCount < 2) {
        reject('home address (apartment, fewer than 2 providers)', where)
        continue
      }
      addDraft({
        building,
        name,
        legalName,
        labels: new Set(here),
        primaryLabels: new Set(primaryLabels),
        line1,
        line2,
        city: loc.city ?? '',
        zip5,
        phones: [phone],
        npis: [r.number],
        updated,
        source: 'registry',
      })
    }
  }
  console.log(`${orgs} organisations -> ${drafts.size} clinic locations after gates and dedup.`)

  // A TMJ specialist whose practice is not in the registry as a TMJ clinic
  // gets a row of their own: there are two dozen in the state, and each is the
  // person the list exists to find. The web check names the practice.
  //
  // A TMJ clinic in the same building is enough to fold them in, phone or not:
  // the University's TMD clinic answers on one number and its faculty
  // registered another.
  const isTmjDraft = (d: Draft) => d.labels.has('Orofacial Pain') || d.labels.has('TMJ Clinic')
  const tmjHere = (building: string, phone: string) =>
    Array.from(drafts.values()).some(
      (d) => d.building === building && (isTmjDraft(d) || d.phones.some((p) => digitsOf(p) === phone))
    )
  for (const r of records) {
    if (r.enumeration_type !== 'NPI-1' || (r.basic.status && r.basic.status !== 'A')) continue
    if (!r.taxonomies.some((t) => t.code === '1223X2210X')) continue
    for (const loc of mnLocations(r)) {
      const line1 = streetFromLine(loc.address_1 ?? '')
      const line2 = (loc.address_2 ?? '').trim()
      const zip5 = (loc.postal_code ?? '').slice(0, 5)
      const building = buildingKey(line1, zip5)
      const name = personName(r)
      const phone = formatPhone(loc.telephone_number ?? '')
      const where = `${name} (${r.number}) @ ${line1} ${line2}, ${loc.city}`
      if (tmjHere(building, digitsOf(phone))) continue
      if (!/^\d/.test(line1) || !phone) {
        reject('TMJ specialist with no usable practice address', where)
        continue
      }
      addDraft({
        building,
        name,
        legalName: name,
        labels: new Set(['Orofacial Pain']),
        primaryLabels: new Set(['Orofacial Pain']),
        line1,
        line2,
        city: loc.city ?? '',
        zip5,
        phones: [phone],
        npis: [r.number],
        updated: r.basic.last_updated ?? r.basic.enumeration_date ?? '',
        source: 'registry',
      })
    }
  }

  // TMJ practices the web found where the registry has no row: not in it at
  // all, or a branch of a record whose row is elsewhere. The Facial Pain
  // Center's Blaine, Minnetonka and Woodbury offices are practice locations of
  // its Roseville NPI, whose branches `orgLocations` does not take (it has no
  // TMJ code to judge them by).
  for (const f of web.finds) {
    const zip5 = f.zip.slice(0, 5)
    if (f.npi && Array.from(drafts.values()).some((d) => d.npis.includes(f.npi!) && d.zip5 === zip5)) continue
    const line1 = f.street
    const record = f.npi ? byNpi.get(f.npi) : undefined
    addDraft({
      building: buildingKey(line1, f.zip),
      name: f.name,
      legalName: record ? tidyName(titleCaseOrg(record.basic.organization_name ?? '')) : f.name,
      labels: new Set(['TMJ Treatment']),
      primaryLabels: new Set(['TMJ Treatment']),
      line1,
      line2: f.suite ?? '',
      city: f.city,
      zip5,
      phones: [formatPhone(f.phone)],
      npis: record ? [record.number] : [],
      updated: record?.basic.last_updated ?? '',
      source: record ? 'registry' : 'web',
      check: {
        status: 'Confirmed',
        tmj: true,
        website: f.website,
        note: f.note,
        ...(f.dentist ? { specialists: f.dentist.split('; ') } : {}),
      },
    })
  }

  // Who works there, then what the web check found — before anything is
  // geocoded, because a practice that moved is geocoded where it is now.
  for (const d of Array.from(drafts.values())) {
    const strict = (label: string) => specialistsHere(d.building, d.phones, label)
    const all = (label: string) => (specialistsAt.get(d.building) ?? []).filter((s) => s.label === label)
    const names = (xs: { name: string }[]) => Array.from(new Set(xs.map((x) => x.name))).sort()
    // Same building is enough for a clinic that is TMJ by its own code or name;
    // anything else must share the phone. Surgeons always must: Southdale holds
    // three oral-surgery practices.
    d.orofacial = d.labels.has('Orofacial Pain') || d.labels.has('TMJ Clinic')
      ? names(isTmjDraft(d) && d.source === 'registry' ? all('Orofacial Pain') : strict('Orofacial Pain'))
      : []
    d.surgeons = d.labels.has('Oral & Maxillofacial Surgery') ? names(strict('Oral & Maxillofacial Surgery')) : []

    const check = d.check ?? (d.npis.length ? web.checks[rowKey(d.npis[0], d.zip5)] : undefined)
    if (!check) continue
    d.check = check
    if (check.status === 'Closed') {
      reject('closed (web check)', `${d.name} (${d.npis.join(', ')}) @ ${d.line1}, ${d.city}${check.note ? ` — ${check.note}` : ''}`)
      drafts.delete(d.key)
      continue
    }
    if (check.exclude) {
      for (const l of Array.from(d.labels)) if (DENTAL_GROUPS.includes(LABEL_GROUP[l])) d.labels.delete(l)
      reject('not TMJ or oral surgery after all (web check)', `${d.name} (${d.npis.join(', ')}) @ ${d.line1}, ${d.city} — ${check.exclude}`)
      if (!d.labels.size) {
        drafts.delete(d.key)
        continue
      }
      delete d.check
      continue
    }
    if (check.practice) d.name = check.practice
    if (check.specialists) d.orofacial = check.specialists
    if (check.only) {
      for (const l of Array.from(d.labels)) if (!check.only.includes(LABEL_GROUP[l])) d.labels.delete(l)
      for (const l of Array.from(d.primaryLabels)) if (!d.labels.has(l)) d.primaryLabels.delete(l)
    }
    if (formatPhone(check.phone ?? '')) d.phones = [formatPhone(check.phone!)]
    if (check.status === 'Moved' && check.moved) {
      const m = check.moved
      d.line1 = m.street
      d.line2 = m.suite ?? ''
      d.city = m.city
      d.zip5 = m.zip.slice(0, 5)
      d.building = buildingKey(m.street, d.zip5)
      if (formatPhone(m.phone ?? '')) d.phones = [formatPhone(m.phone!)]
    }
  }

  // A practice that moved can land on a row it already has: Associated OMS
  // left Fridley for its Coon Rapids office, which is a row of its own. Same
  // building and the same phone or web page is one practice. The row seen open
  // where the registry has it is the one kept.
  //
  // The page, not the domain: HealthPartners runs a TMD clinic and a dental
  // specialty center in one Lake Elmo building, both on healthpartners.com.
  const page = (url: string) =>
    url.split('//').pop()!.split(/[?#]/)[0].replace(/^www\./, '').replace(/\/+$/, '').toLowerCase()
  const checked = Array.from(drafts.values())
    .filter((d) => d.check)
    .sort((a, b) => Number(a.check!.status === 'Moved') - Number(b.check!.status === 'Moved'))
  const kept = new Map<string, Draft>()
  for (const d of checked) {
    const ids = [`${d.building}|${digitsOf(d.phones[0])}`]
    if (d.check!.website) ids.push(`${d.building}|${page(d.check!.website)}`)
    const into = ids.map((id) => kept.get(id)).find(Boolean)
    if (!into) {
      for (const id of ids) kept.set(id, d)
      continue
    }
    d.labels.forEach((l) => into.labels.add(l))
    d.primaryLabels.forEach((l) => into.primaryLabels.add(l))
    for (const n of d.npis) if (!into.npis.includes(n)) into.npis.push(n)
    into.orofacial = Array.from(new Set([...(into.orofacial ?? []), ...(d.orofacial ?? [])])).sort()
    into.surgeons = Array.from(new Set([...(into.surgeons ?? []), ...(d.surgeons ?? [])])).sort()
    if (d.updated > into.updated) into.updated = d.updated
    if (into.check!.tmj === null) into.check!.tmj = d.check!.tmj
    reject('same practice as another row once the web check moved it', `${d.name} (${d.npis.join(', ')}) -> ${into.name} @ ${into.line1}, ${into.city}`)
    drafts.delete(d.key)
  }

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
    // A dental school or clinic whose primary code is no group's ("Clinic/Center,
    // Dental") files under TMJ when it is in TMJ, not under the PT it also lists.
    const primaryGroup =
      GROUPS.find((g) => Array.from(d.primaryLabels).some((l) => LABEL_GROUP[l] === g)) ??
      (groups.includes('TMJ Specialists') ? 'TMJ Specialists' : groups[0])
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
    // A clinic in TMJ by its name or the web has no TMJ code to count by; its
    // providers are the orofacial-pain specialists in the building.
    const counted = groups.includes('TMJ Specialists') ? [...labels, 'Orofacial Pain'] : labels
    const providers = new Set(
      counted.flatMap((l) => Array.from(providersAt.get(d.building)?.get(l) ?? []))
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
      // Seen open on the web is better evidence than a registry date.
      recent: d.check?.status === 'Confirmed' || (d.check?.status === 'Moved' && !!d.check.moved) || d.updated >= RECENT_SINCE,
      lat: hit?.lat ?? null,
      lng: hit?.lng ?? null,
      orofacial: d.orofacial ?? [],
      surgeons: d.surgeons ?? [],
      website: d.check?.website ?? '',
      webCheck: d.check?.status ?? '',
      webNote: d.check?.note ?? '',
      treatsTmj: d.check?.tmj ?? null,
      source: d.source,
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

  const dental = rows.filter((r) => r.groups.some((g) => DENTAL_GROUPS.includes(g)))
  push('', '## TMJ and oral surgery (added 2026-10-19)', '')
  push(`- Web check: ${count(dental, (r) => r.webCheck || 'not checked').map(([s, n]) => `${s} ${n}`).join(', ')}.`)
  push(`- From the web, not the registry: ${dental.filter((r) => r.source === 'web').length}.`)
  push(`- Closed per the web check, left out: ${rejects.get('closed (web check)')?.length ?? 0}.`, '')
  push('| TMJ Specialists | City | Tier | Web | Specialists |', '|---|---|---|---|---|')
  for (const r of dental.filter((x) => x.groups.includes('TMJ Specialists'))) {
    push(`| ${r.name} | ${r.city} | ${r.recent ? 'main' : 'older'} | ${r.webCheck || '—'} | ${r.orofacial.join('; ')} |`)
  }

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
