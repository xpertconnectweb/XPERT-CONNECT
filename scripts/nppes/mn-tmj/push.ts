/**
 * Puts the Minnesota TMJ clinics and the oral surgeons who treat TMJ on the
 * platform, each with a clinic login.
 *
 * Dry by default. `--apply` writes, and needs `--credentials=<file.csv>`
 * OUTSIDE the repository: the passwords are generated here, the database keeps
 * only their bcrypt hashes, and that file is the one plaintext copy.
 *
 *     npx tsx scripts/nppes/mn-tmj/push.ts
 *     npx tsx scripts/nppes/mn-tmj/push.ts --apply --credentials=C:/somewhere/logins.csv
 *
 * The rows are exactly the client's TMJ Sheet (`xlsx.py --tmj-only`): the
 * "TMJ Clinics" tab plus the "Oral Surgeons (TMJ)" tab, less what is already
 * on Xpert, the older entries and anything the web check left Unverified.
 * Unverified means nobody could find the practice online, and a referral sent
 * to a clinic that may not exist costs the patient more than a missing pin.
 *
 * Coordinates come from the project's geocoder through the same ZIP-or-city
 * gate as `../push.ts`. When it finds nothing, the census point that
 * build.ts already has is used instead, as 'interpolated': the census places
 * an address along its block's number range, which is what that word means
 * in the precision vocabulary.
 *
 * Rollback: `pushed.json` lists every id written.
 *
 *     DELETE FROM users   WHERE clinic_id IN (...);
 *     DELETE FROM clinics WHERE id IN (...);
 */
import { createHash, randomBytes, randomInt } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { getFallbackProvider, getProvider } from '../../../src/lib/geocoding'
import type { GeocodeProvider } from '../../../src/lib/geocoding'
import { stripUnit } from '../../../src/lib/address'
import { validateCoordinates } from '../../../src/lib/validation'
import { normalizeWebsite } from '../../../src/lib/security/url'

config({ path: '.env.local' })
config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const APPLY = process.argv.includes('--apply')
const CREDENTIALS = process.argv.find((a) => a.startsWith('--credentials='))?.split('=')[1]

const LIST = join(process.cwd(), 'data', 'nppes', 'mn-specialists', 'clinics.json')
const PUSHED = join(process.cwd(), 'data', 'nppes', 'mn-tmj', 'pushed.json')
const PACING_MS = getProvider().id === 'nominatim' ? 1100 : 120

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface ListRow {
  name: string
  groups: string[]
  street: string
  suite: string
  city: string
  zip: string
  county: string | null
  region: string | null
  phone: string
  npis: string[]
  onPlatform: unknown
  recent: boolean
  lat: number | null
  lng: number | null
  website: string | null
  webCheck: string
  treatsTmj: boolean | null
}

const TMJ = 'TMJ Specialists'
const OMS = 'Oral Surgery'

/** The two tabs of the TMJ Sheet, as xlsx.py builds them. */
function inTmjSheet(r: ListRow): boolean {
  return r.groups.includes(TMJ) || (r.groups.includes(OMS) && r.treatsTmj === true)
}

/** '130' and 'Suite126' read as 'Ste 130' and 'Suite 126'; the rest as written. */
function suiteText(suite: string): string {
  const s = suite.trim().replace(/^suite(?=\d)/i, 'Suite ')
  return /^\d/.test(s) ? `Ste ${s}` : s
}

/**
 * Registry rows keep the n-<NPI> ids of the August import; web-only rows get
 * a stable hash.
 *
 * A group with several offices files them all under one organisation NPI
 * (Associated OMS has five rows on one number), so the first office takes
 * n-<NPI>, the next takes any other NPI it lists, and the rest add their ZIP
 * and street number. The list's order is fixed, so a re-run gives the same ids.
 */
function clinicId(r: ListRow, used: Set<string>): string {
  const options = r.npis.length > 0
    ? [
        ...r.npis.map((npi) => `n-${npi}`),
        `n-${r.npis[0]}-${r.zip}`,
        `n-${r.npis[0]}-${r.zip}-${/^\d+/.exec(r.street)?.[0] ?? '0'}`,
      ]
    : [`w-${createHash('sha1').update(`${r.name}|${r.street}|${r.zip}`.toLowerCase()).digest('hex').slice(0, 10)}`]
  const id = options.find((o) => !used.has(o))
  if (!id) throw new Error(`No free id for ${r.name}, ${r.street} ${r.zip}`)
  used.add(id)
  return id
}

const foldPlace = (value: string) =>
  value
    .toLowerCase()
    .replace(/^st[. ]/, 'saint ')
    .replace(/[^a-z]+/g, ' ')
    .trim()

/** Same resolution as ../push.ts, including the retry without the unit. */
async function resolveAddress(address: string, provider: GeocodeProvider) {
  const suggestions = await provider.autocomplete(address, { limit: 1, permanent: true })
  if (!suggestions.ok) return suggestions
  const first = suggestions.value[0]
  if (!first) return { ok: true as const, value: null }
  if (!first.needsResolve && first.lat !== null && first.lng !== null) {
    return { ok: true as const, value: first as never }
  }
  return provider.details(first.id, { limit: 1, permanent: true })
}

async function attempt(address: string, zip: string, city: string, provider: GeocodeProvider) {
  let result = await resolveAddress(address, provider)
  await sleep(PACING_MS)
  if (!(result.ok && result.value)) {
    const stripped = stripUnit(address)
    if (stripped !== address) {
      result = await resolveAddress(stripped, provider)
      await sleep(PACING_MS)
    }
  }
  if (!result.ok || !result.value) return null
  const place = result.value
  const landedZip = (place.address?.postcode ?? '').slice(0, 5)
  const zipAgrees = !landedZip || landedZip === zip
  const cityAgrees = foldPlace(place.address?.city ?? '') === foldPlace(city)
  if (!zipAgrees && !cityAgrees) return null
  if (!validateCoordinates(place.lat, place.lng).ok) return null
  return place
}

/**
 * Every address where the geocoder and the census point were over a
 * kilometre apart, settled by hand on 2026-10-20 against a third source
 * (Nominatim, and the census geocoder run on the current address).
 *
 * Geoapify called all five 'rooftop'. Four were a point somewhere on the
 * right road, or not even that: Hastings landed in Rosemount, and 5000 W
 * 36th St came back with an Ohio ZIP. In Buffalo it is the census that is
 * wrong. It matched 215 Hwy 55 NW in Chatham Township, a different address.
 * Geoapify's point is on Hwy 55 E near number 1002 (the Country Inn), so it
 * keeps that point, demoted to 'street'.
 *
 * A disagreement not listed here stops --apply.
 */
const SETTLED: Record<string, 'census' | 'street'> = {
  '925 Highway 55 Ste 202, Hastings, MN 55033': 'census',
  '5000 W 36th St Ste 250, Minneapolis, MN 55416': 'census',
  '13875 Hwy 13 Frontage Rd Ste 50, Savage, MN 55378': 'census',
  '403 East First Avenue, Shakopee, MN 55379': 'census',
  '215 Highway 55 E, Buffalo, MN 55313': 'street',
}

/** Metres between two points; only used to flag a geocoder that disagrees with the census. */
function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

// ---- logins --------------------------------------------------------------------

/** Same shape as the 2026-09-29 usernames: name, then city, snake_case, at most 30. */
const LEGAL = /\b(pllc|pllp|llc|llp|ltd|inc|pa|pc|dds|dmd|ms|md)\b/g
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL, ' ')
    .trim()
    .split(/\s+/)
    .join('_')

function username(name: string, city: string, taken: Set<string>): string {
  const place = slug(city)
  let base = slug(name)
  if (!base.includes(place)) base = `${base}_${place}`
  base = base.slice(0, 30).replace(/_+$/, '')
  let candidate = base
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${base.slice(0, 30 - String(n).length - 1).replace(/_+$/, '')}_${n}`
  }
  taken.add(candidate)
  return candidate
}

/** 14 characters, none of the ones that get misread when typed off a sheet. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const password = () => Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) return out
  }
}

async function main(): Promise<void> {
  if (APPLY) {
    if (!CREDENTIALS) throw new Error('--apply needs --credentials=<file.csv> outside the repository')
    if (resolve(CREDENTIALS).toLowerCase().startsWith(process.cwd().toLowerCase())) {
      throw new Error('The credentials file must not be inside the repository: it is public.')
    }
  }

  const list = JSON.parse(readFileSync(LIST, 'utf8')) as ListRow[]
  const sheet = list.filter((r) => inTmjSheet(r) && r.recent && !r.onPlatform)
  const unverified = sheet.filter((r) => r.webCheck === 'Unverified')
  const chosen = sheet.filter((r) => r.webCheck !== 'Unverified')
  console.log(
    `${chosen.length} to load (${chosen.filter((r) => r.groups.includes(TMJ)).length} TMJ, ` +
      `${chosen.filter((r) => !r.groups.includes(TMJ)).length} oral surgeons); ` +
      `left out as Unverified: ${unverified.map((r) => r.name).join('; ') || 'none'}`
  )

  const clinics = await readAll<{ id: string }>('clinics', 'id')
  const users = await readAll<{ id: string; username: string; clinic_id: string | null }>(
    'users',
    'id, username, clinic_id'
  )
  const clinicIds = new Set(clinics.map((c) => c.id))
  const userIds = new Set(users.map((u) => u.id))
  const usernames = new Set(users.map((u) => u.username))
  const withLogin = new Set(users.map((u) => u.clinic_id).filter(Boolean))

  // ---- geocode -----------------------------------------------------------------
  const primary = getProvider()
  const fallback = getFallbackProvider(primary)
  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  const skipped: string[] = []
  const notes: string[] = []
  const unsettled: string[] = []

  // Ids taken by THIS batch. An id already in the table is not skipped past:
  // these rows were matched against the platform and are not on it, so a
  // clash means a second run, and that is reported rather than renamed.
  const used = new Set<string>()
  for (const r of chosen) {
    const id = clinicId(r, used)
    if (clinicIds.has(id)) {
      skipped.push(`${r.name} — ${id} is already in clinics`)
      continue
    }
    const street = r.suite ? `${r.street} ${suiteText(r.suite)}` : r.street
    const address = `${street}, ${r.city}, MN ${r.zip}`

    let place = await attempt(address, r.zip, r.city, primary)
    if (!place && fallback) place = await attempt(address, r.zip, r.city, fallback)

    let lat: number, lng: number
    let placeId: string | null = null
    let provider: string | null = null
    let precision: string
    const settled = SETTLED[address]
    if (settled === 'census' && r.lat !== null && r.lng !== null) {
      lat = r.lat
      lng = r.lng
      precision = 'interpolated'
      notes.push(`${r.name}, ${address}: census point, settled by hand`)
    } else if (place) {
      lat = place.lat
      lng = place.lng
      placeId = place.placeId ?? null
      provider = place.providerId ?? null
      precision = settled === 'street' ? 'street' : place.precision
      if (r.lat !== null && r.lng !== null && !settled) {
        const off = metres(lat, lng, r.lat, r.lng)
        if (off > 1000) {
          unsettled.push(
            `${r.name}, ${address}: ${provider} is ${Math.round(off)} m from the census point ` +
              `(${provider} ${lat.toFixed(5)},${lng.toFixed(5)} "${place.label}"; census ${r.lat.toFixed(5)},${r.lng.toFixed(5)})`
          )
        }
      }
    } else if (r.lat !== null && r.lng !== null) {
      lat = r.lat
      lng = r.lng
      precision = 'interpolated'
      notes.push(`${r.name}: geocoder found nothing, census point used`)
    } else {
      skipped.push(`${r.name} — ${address}: no coordinates from any source`)
      continue
    }

    // Identical key set on every row: PostgREST unions keys across a batch.
    rows.push({
      id,
      name: r.name,
      address,
      lat,
      lng,
      phone: r.phone ?? '',
      specialties: [
        ...(r.groups.includes(TMJ) || r.treatsTmj ? ['TMJ Treatment'] : []),
        ...(r.groups.includes(OMS) ? ['Oral Surgery'] : []),
      ],
      email: '',
      website: normalizeWebsite(r.website ?? '') || null,
      region: r.region,
      county: r.county,
      available: true,
      street,
      city: r.city,
      state: 'MN',
      zip_code: r.zip,
      place_id: placeId,
      place_provider: provider,
      geocode_precision: precision,
      geocoded_at: now,
    })
  }

  const byPrecision: Record<string, number> = {}
  for (const row of rows) {
    const key = `${row.geocode_precision}/${row.place_provider ?? 'census'}`
    byPrecision[key] = (byPrecision[key] ?? 0) + 1
  }
  console.log(`\n${rows.length} placed: ${JSON.stringify(byPrecision)}`)
  for (const line of notes) console.log(`  note: ${line}`)
  for (const line of unsettled) console.log(`  UNSETTLED: ${line}`)
  for (const line of skipped) console.log(`  skipped: ${line}`)
  for (const row of rows) {
    console.log(
      `  ${String(row.id).padEnd(13)} ${(row.specialties as string[]).join('+').padEnd(26)} ${row.name} | ${row.address}` +
        ` | ${(row.lat as number).toFixed(5)},${(row.lng as number).toFixed(5)} ${row.geocode_precision}`
    )
  }

  const logins = rows
    .filter((row) => !withLogin.has(row.id as string))
    .map((row) => {
      let id = `clinic-${randomBytes(4).toString('hex')}`
      while (userIds.has(id)) id = `clinic-${randomBytes(4).toString('hex')}`
      userIds.add(id)
      return {
        id,
        username: username(row.name as string, row.city as string, usernames),
        name: row.name as string,
        clinicId: row.id as string,
        city: row.city as string,
      }
    })
  console.log(`\n${logins.length} logins, e.g. ${logins.slice(0, 3).map((l) => l.username).join(', ')}`)

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply --credentials=<file.csv> to write.')
    return
  }
  if (unsettled.length > 0) {
    throw new Error(`${unsettled.length} placements disagree with the census by over 1 km; settle them in SETTLED first`)
  }

  // ---- backup, then write ----------------------------------------------------
  const backup = await readAll<unknown>('clinics', '*')
  mkdirSync(join(process.cwd(), 'data', 'backups'), { recursive: true })
  const stamp = now.replace(/[:.]/g, '-')
  writeFileSync(join(process.cwd(), 'data', 'backups', `clinics-${stamp}.json`), JSON.stringify(backup, null, 2))
  console.log(`\nBacked up ${backup.length} clinics`)

  // The plaintext goes to disk before any hash goes to the database, so a
  // failure between the two can never leave a login nobody can hand out.
  const secrets = logins.map((l) => ({ ...l, password: password() }))
  writeFileSync(
    CREDENTIALS!,
    '\uFEFF' +
      ['Clínica,Ciudad,Usuario,Contraseña,clinic_id', ...secrets.map((s) =>
        [s.name, s.city, s.username, s.password, s.clinicId].map(csvCell).join(','))].join('\r\n') +
      '\r\n'
  )
  console.log(`Wrote ${secrets.length} logins to the credentials file`)

  const { error: clinicError } = await supabase.from('clinics').insert(rows)
  if (clinicError) throw new Error(`clinics insert: ${clinicError.message}`)
  console.log(`Inserted ${rows.length} clinics`)

  const userRows = await Promise.all(
    secrets.map(async (s) => ({
      id: s.id,
      username: s.username,
      password: await bcrypt.hash(s.password, 10),
      name: s.name,
      role: 'clinic',
      clinic_id: s.clinicId,
      email: '',
    }))
  )
  const { error: userError } = await supabase.from('users').insert(userRows)
  if (userError) throw new Error(`users insert: ${userError.message}`)
  console.log(`Inserted ${userRows.length} clinic users`)

  const previous = existsSync(PUSHED) ? (JSON.parse(readFileSync(PUSHED, 'utf8')) as unknown[]) : []
  writeFileSync(
    PUSHED,
    JSON.stringify(
      [...previous, { at: now, clinics: rows.map((r) => r.id), users: userRows.map((u) => u.id) }],
      null,
      2
    ) + '\n'
  )
  console.log(`Ids recorded in ${PUSHED}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
