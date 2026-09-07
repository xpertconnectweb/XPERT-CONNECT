/**
 * Turns researched law-firm records into a CSV a human can approve.
 *
 *   npx tsx scripts/directory-seed/prepare.ts
 *   npx tsx scripts/directory-seed/prepare.ts --no-geocode      (fast, for a format check)
 *   npx tsx scripts/directory-seed/prepare.ts --limit=25
 *
 * -- Why this stage exists ---------------------------------------------------
 *
 * The rows in `data/directory-seed/raw/*.json` were compiled by agents reading
 * firm websites. That is a good source and still not a trustworthy one: the
 * failure mode of automated research is a plausible phone number, and a
 * directory whose numbers ring the wrong office is worse than a small
 * directory.
 *
 * So nothing here writes to the database. This produces `review.csv` and a
 * `rejected.json` explaining every drop, and `push.ts` refuses to run until a
 * person has opened the CSV and saved it.
 *
 * Everything that can be checked mechanically is checked here: Florida area
 * code, Florida ZIP, practice areas against the canonical catalogue, duplicates
 * against both the live table and the rest of the batch, and — the expensive
 * one — that the address actually geocodes to the city it claims.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fold, normalizeZip } from '../../src/lib/search/text'
import { sanitizePracticeAreas } from '../../src/lib/practice-areas'
import { canonicalizeCounty } from '../../src/lib/counties'
import { validateCoordinates } from '../../src/lib/validation'
import { stripUnit } from '../../src/lib/address'
import { getProvider, getFallbackProvider } from '../../src/lib/geocoding'
import type { GeocodeProvider } from '../../src/lib/geocoding'

config({ path: '.env.local' })
config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const NO_GEOCODE = process.argv.includes('--no-geocode')
const LIMIT = Number(arg('limit')) || 0

const DIR = join(process.cwd(), 'data', 'directory-seed')
const RAW = join(DIR, 'raw')
const PACING_MS = getProvider().id === 'nominatim' ? 1100 : 120
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Every Florida area code. A number outside this set is not a Florida office. */
const FL_AREA_CODES = new Set([
  '239', '305', '321', '352', '386', '407', '448', '561', '656', '689',
  '727', '754', '772', '786', '813', '850', '863', '904', '941', '954',
])

interface Raw {
  name?: string
  phone?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  county?: string
  website?: string
  practiceAreas?: string[]
  sourceUrl?: string
}

interface Prepared {
  id: string
  name: string
  phone: string
  street: string
  city: string
  county: string
  zip: string
  address: string
  practiceAreas: string[]
  website: string
  lat: number
  lng: number
  sourceUrl: string
  notes: string
}

const rejected: { row: Raw; reason: string; file: string }[] = []
const reject = (row: Raw, file: string, reason: string) => rejected.push({ row, file, reason })

/** Digits only, so `(305) 555-0100` and `305-555-0100` are one number. */
const phoneDigits = (v: string) => v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')

const formatPhone = (v: string) => {
  const d = phoneDigits(v)
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : ''
}

/**
 * A firm's identity for dedupe purposes: the name with its entity suffix and
 * punctuation removed. "The Umansky Law Firm, P.A." and "Umansky Law Firm"
 * collapse to the same key.
 */
const nameKey = (name: string) =>
  fold(name)
    .replace(/\b(pa|pl|plc|pllc|llc|llp|lp|inc|co|law firm|law offices?|attorneys? at law|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function readRaw(): { row: Raw; file: string }[] {
  if (!existsSync(RAW)) {
    console.error(`\n  No ${RAW}. Nothing to prepare.\n`)
    process.exit(1)
  }
  const out: { row: Raw; file: string }[] = []
  for (const file of readdirSync(RAW).filter((f) => f.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(RAW, file), 'utf8'))
    if (!Array.isArray(parsed)) {
      console.log(`  ${file}: not an array, skipped`)
      continue
    }
    for (const row of parsed) out.push({ row, file })
  }
  return out
}

/** Mechanical checks. Everything here is cheap and certain. */
function normalize(row: Raw, file: string): Omit<Prepared, 'id' | 'lat' | 'lng'> | null {
  const name = (row.name ?? '').trim()
  if (name.length < 4) return reject(row, file, 'name missing or too short'), null

  const phone = formatPhone(row.phone ?? '')
  if (!phone) return reject(row, file, 'phone missing or not 10 digits'), null
  if (!FL_AREA_CODES.has(phoneDigits(phone).slice(0, 3))) {
    return reject(row, file, `area code ${phoneDigits(phone).slice(0, 3)} is not Florida`), null
  }

  const street = (row.street ?? '').trim()
  const city = (row.city ?? '').trim()
  const zip = normalizeZip(row.zip)
  if (!street) return reject(row, file, 'street missing'), null
  if (!city) return reject(row, file, 'city missing'), null
  if (!zip) return reject(row, file, 'zip missing or malformed'), null

  // Florida ZIPs run 32003-34997. Anything else is another state's office.
  const zipNum = Number(zip)
  if (zipNum < 32003 || zipNum > 34997) {
    return reject(row, file, `zip ${zip} is outside Florida`), null
  }

  const practiceAreas = sanitizePracticeAreas(row.practiceAreas)
  if (practiceAreas.length === 0) {
    return reject(row, file, 'no recognised practice area'), null
  }

  const sourceUrl = (row.sourceUrl ?? '').trim()
  if (!/^https?:\/\//.test(sourceUrl)) {
    return reject(row, file, 'no source URL — unverifiable, so not admissible'), null
  }

  // Stored bare, rendered with the suffix. See src/lib/counties.ts.
  const county = canonicalizeCounty(row.county) ?? ''

  return {
    name,
    phone,
    street,
    city,
    county,
    zip,
    // The format `parseAddress` round-trips, so `decorateLawyer` derives the
    // same city/state/zip for these rows as it does for the existing 176.
    address: `${street}, ${city}, FL ${zip}`,
    practiceAreas,
    website: (row.website ?? '').trim(),
    sourceUrl,
    notes: '',
  }
}

async function loadExisting() {
  const { data, error } = await supabase.from('lawyers').select('id, name, phone, address')
  if (error) {
    console.error('  Could not read the lawyers table:', error.message)
    process.exit(1)
  }
  const byPhone = new Set<string>()
  const byPhoneOnly = new Set<string>()
  const byName = new Set<string>()
  let maxId = 0
  for (const r of data ?? []) {
    if (r.phone) {
      byPhone.add(phoneDigits(r.phone) + '|' + fold((r.address ?? '').slice(0, 24)))
      byPhoneOnly.add(phoneDigits(r.phone))
    }
    byName.add(nameKey(r.name ?? '') + '|' + fold((r.address ?? '').slice(0, 24)))
    const m = /^l-(\d+)$/.exec(r.id ?? '')
    if (m) maxId = Math.max(maxId, Number(m[1]))
  }
  return { byPhone, byPhoneOnly, byName, maxId }
}

async function geocode(address: string, city: string, zip: string, provider: GeocodeProvider) {
  const tryOnce = async (value: string) => {
    const s = await provider.autocomplete(value, { limit: 1, permanent: true })
    if (!s.ok || !s.value[0]) return null
    const first = s.value[0]
    if (!first.needsResolve && first.lat !== null && first.lng !== null) return first
    const d = await provider.details(first.id, { limit: 1, permanent: true })
    return d.ok ? d.value : null
  }

  let place = await tryOnce(address)
  await sleep(PACING_MS)
  if (!place) {
    // Ask again without the unit — the same recovery the NPPES import uses.
    const stripped = stripUnit(address)
    if (stripped !== address && stripped.length > 6) {
      place = await tryOnce(stripped)
      await sleep(PACING_MS)
    }
  }
  if (!place || place.lat === null || place.lng === null) return null

  const landedZip = (place.address?.postcode ?? '').slice(0, 5)
  const landedCity = fold(place.address?.city ?? '')
  const zipAgrees = !landedZip || landedZip === zip
  const cityAgrees = Boolean(landedCity) && landedCity === fold(city)
  // A unique ZIP belongs to an organisation, not an area, and no geocoder
  // returns one — so either signal agreeing is enough. Landing in a different
  // town is the case worth catching.
  if (!zipAgrees && !cityAgrees) return null

  const check = validateCoordinates(place.lat, place.lng)
  if (!check.ok) return null

  return { lat: place.lat, lng: place.lng }
}

const csvCell = (v: string) => `"${String(v).replace(/"/g, '""')}"`

async function main() {
  mkdirSync(DIR, { recursive: true })

  const raw = readRaw()
  console.log(`\n  ${raw.length} researched rows across ${readdirSync(RAW).filter((f) => f.endsWith('.json')).length} files\n`)

  const { byPhone, byPhoneOnly, byName, maxId } = await loadExisting()
  console.log(`  live table: ${byPhone.size} phones on record, highest id l-${maxId}`)

  const seenPhone = new Set<string>()
  const seenName = new Set<string>()
  const normalized: Omit<Prepared, 'id' | 'lat' | 'lng'>[] = []

  for (const { row, file } of raw) {
    const n = normalize(row, file)
    if (!n) continue

    /**
     * An office is identified by its phone AND its street, never by phone
     * alone.
     *
     * Multi-office firms routinely publish one main line for every branch —
     * Ansbacher lists the same number for three Northeast Florida offices
     * because its site has no per-branch numbers. Keying on the phone by
     * itself threw away fifteen genuine locations in the first batch: for
     * someone looking for the nearest office, three cities behind one
     * switchboard is three useful listings, not a duplicate.
     */
    const pk = phoneDigits(n.phone) + '|' + fold(n.street.slice(0, 24))
    const nk = nameKey(n.name) + '|' + fold(n.street.slice(0, 24))

    if (byPhone.has(pk)) { reject(row, file, 'already in the directory (same phone and street)'); continue }
    if (byName.has(nk)) { reject(row, file, 'already in the directory (same firm and street)'); continue }
    if (seenPhone.has(pk)) { reject(row, file, 'duplicate within this batch (same phone and street)'); continue }
    if (seenName.has(nk)) { reject(row, file, 'duplicate within this batch (same firm and street)'); continue }

    if (byPhoneOnly.has(phoneDigits(n.phone))) {
      n.notes = 'shares a phone with a firm already in the directory — confirm this is a different office'
    }

    seenPhone.add(pk)
    seenName.add(nk)
    normalized.push(n)
  }

  const slice = LIMIT ? normalized.slice(0, LIMIT) : normalized
  console.log(`  ${slice.length} survive the mechanical checks, ${rejected.length} rejected\n`)

  /**
   * Geocode BEFORE anything is written, never after. `lat`/`lng` are NOT NULL
   * and (0,0) is the only placeholder, which `hasRealCoordinates` hides from
   * every map and list. A firm that cannot be placed is a to-do, not a row.
   */
  const prepared: Prepared[] = []
  const unresolved: { name: string; address: string; sourceUrl: string }[] = []
  let next = maxId + 1

  if (NO_GEOCODE) {
    console.log('  --no-geocode: coordinates left at 0 and the CSV is for format review only.\n')
  } else {
    console.log(`  geocoding ${slice.length} addresses via ${getProvider().id}...\n`)
  }

  for (let i = 0; i < slice.length; i++) {
    const n = slice[i]
    let coords: { lat: number; lng: number } | null = NO_GEOCODE ? { lat: 0, lng: 0 } : null

    if (!NO_GEOCODE) {
      const primary = getProvider()
      coords = await geocode(n.address, n.city, n.zip, primary)
      if (!coords) {
        // Geoapify is the load-bearing fallback here, not a nicety: the
        // self-hosted engine only knows streets it has points for.
        const fb = getFallbackProvider(primary)
        if (fb) coords = await geocode(n.address, n.city, n.zip, fb)
      }
    }

    if (!coords) {
      unresolved.push({ name: n.name, address: n.address, sourceUrl: n.sourceUrl })
      continue
    }

    prepared.push({ ...n, id: `l-${String(next++).padStart(4, '0')}`, ...coords })
    if ((i + 1) % 25 === 0) console.log(`    ${i + 1}/${slice.length}`)
  }

  const header = [
    'id', 'name', 'phone', 'street', 'city', 'county', 'zip', 'address',
    'practice_areas', 'website', 'lat', 'lng', 'source_url', 'notes', 'action',
  ]
  const lines = [header.join(',')]
  for (const p of prepared) {
    lines.push([
      p.id, p.name, p.phone, p.street, p.city, p.county, p.zip, p.address,
      p.practiceAreas.join('; '), p.website, String(p.lat), String(p.lng),
      p.sourceUrl, p.notes, p.notes ? 'review' : 'insert',
    ].map(csvCell).join(','))
  }

  writeFileSync(join(DIR, 'review.csv'), lines.join('\r\n') + '\r\n', 'utf8')
  writeFileSync(join(DIR, 'rejected.json'), JSON.stringify(rejected, null, 1))
  writeFileSync(join(DIR, 'unresolved.json'), JSON.stringify(unresolved, null, 1))

  const byArea: Record<string, number> = {}
  for (const p of prepared) for (const a of p.practiceAreas) byArea[a] = (byArea[a] ?? 0) + 1

  console.log(`\n  review.csv       ${prepared.length} rows, ids l-${String(maxId + 1).padStart(4, '0')} upward`)
  console.log(`  rejected.json    ${rejected.length}`)
  console.log(`  unresolved.json  ${unresolved.length} (address would not geocode)`)
  console.log(`\n  by practice area: ${JSON.stringify(byArea)}`)
  console.log(`\n  Open review.csv, delete or fix any row you do not want, save it,`)
  console.log(`  then: npx tsx scripts/directory-seed/push.ts --apply\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
