/**
 * Geocodes the NPPES candidates and writes them to Supabase.
 *
 * Dry by default. `--apply` writes.
 *
 *     npx tsx scripts/nppes/push.ts --state=MN --limit=20
 *     npx tsx scripts/nppes/push.ts --apply
 *
 * Three decisions here are worth the words:
 *
 * **Geocode before insert, not after.** `clinics.lat` and `lng` are NOT NULL,
 * so inserting first and backfilling later means inserting a placeholder, and
 * the only placeholder available is (0, 0). That is the value
 * `hasRealCoordinates` filters off the map, the admin API rejects outright,
 * and an e2e spec exists to prove never renders. It would create hundreds of
 * rows that inflate every count and appear nowhere. A practice that cannot be
 * placed is not data, it is a to-do — it goes to `unresolved.json`.
 *
 * **The acceptance gate is the place, not the drift.** `backfill-geocode.ts`
 * compares a new coordinate against the old one and holds back long moves.
 * These rows have no old coordinate, so there is nothing to move from. What
 * they do have is a postcode and a city out of a federal register, so the
 * test is whether the geocoder landed in the right place.
 *
 * The ZIP alone is not enough of a test, and the reason is worth knowing:
 * some large organisations hold a UNIQUE postcode, assigned to them rather
 * than to an area. Mayo Clinic owns 55905. No geocoder can return it, because
 * it is not a place on a map — the self-hosted engine answered 55917 and
 * Geoapify answered 55902, and one of those two is correct. So the gate
 * accepts a matching ZIP or a matching city, and rejects the rest. It still
 * catches what it exists to catch: 55917 is Claremont, forty miles away.
 *
 * **The address stays NPPES's.** Coordinates, place id and precision come from
 * the geocoder; street, city, state and ZIP do not. The registry is
 * authoritative postal data, and letting a geocoder rewrite the address a
 * referral gets sent to — to gain nothing but tidier capitalisation — is a
 * trade with no upside.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { getProvider, getFallbackProvider } from '../../src/lib/geocoding'
import { mapboxPermanentForward } from '../../src/lib/geocoding/mapbox'
import { stripUnit } from '../../src/lib/address'
import type { GeocodeProvider } from '../../src/lib/geocoding'
import { validateCoordinates } from '../../src/lib/validation'
import type { Candidate, MergeInstruction } from './build-practices'

config({ path: '.env.local' })
config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const APPLY = process.argv.includes('--apply')
const SKIP_MERGES = process.argv.includes('--no-merges')
const STATE = process.argv.find((a) => a.startsWith('--state='))?.split('=')[1]
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]) || 0

const OUT_DIR = join(process.cwd(), 'data', 'nppes')
const BATCH = 200
const PACING_MS = getProvider().id === 'nominatim' ? 1100 : 120

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Loose enough that 'Saint Paul' and 'ST PAUL' are one city. */
const foldPlace = (value: string) =>
  value
    .toLowerCase()
    .replace(/^st[. ]/, 'saint ')
    .replace(/[^a-z]+/g, ' ')
    .trim()

/** Same shape as backfill-geocode's, so both paths resolve identically. */
async function resolveAddress(address: string, provider = getProvider()) {
  if (provider.id === 'mapbox') {
    return mapboxPermanentForward(address, { limit: 1, permanent: true })
  }
  const suggestions = await provider.autocomplete(address, { limit: 1, permanent: true })
  if (!suggestions.ok) return suggestions
  const first = suggestions.value[0]
  if (!first) return { ok: true as const, value: null }
  if (!first.needsResolve && first.lat !== null && first.lng !== null) {
    return { ok: true as const, value: first as never }
  }
  return provider.details(first.id, { limit: 1, permanent: true })
}

/** Ask once, then once more without the unit — three in seven were recovered that way. */
async function resolveWithRetry(address: string, provider = getProvider()) {
  const first = await resolveAddress(address, provider)
  if (first.ok && first.value) return first
  const stripped = stripUnit(address)
  if (stripped === address || stripped.length < 6) return first
  await sleep(PACING_MS)
  return resolveAddress(stripped, provider)
}

/**
 * One attempt: resolve, then check it landed where the registry says.
 *
 * Accepts a matching postcode OR a matching city. Both, rather than just the
 * postcode, because a unique ZIP belongs to an organisation instead of to an
 * area and no geocoder can return one — see the note at the top of this file.
 * A different town still fails, which is the case worth catching.
 */
async function attempt(candidate: Candidate, provider: GeocodeProvider) {
  const result = await resolveWithRetry(candidate.address, provider)
  await sleep(PACING_MS)

  if (!result.ok || !result.value) return { place: null, reason: `${provider.id} found nothing` }

  const place = result.value
  const landedZip = (place.address?.postcode ?? '').slice(0, 5)
  const landedCity = foldPlace(place.address?.city ?? '')
  const zipAgrees = !landedZip || landedZip === candidate.zipCode
  const cityAgrees = Boolean(landedCity) && landedCity === foldPlace(candidate.city)

  if (!zipAgrees && !cityAgrees) {
    return {
      place: null,
      reason: `${provider.id} landed in ${place.address?.city ?? '?'} ${landedZip}, the registry says ${candidate.city} ${candidate.zipCode}`,
    }
  }

  const check = validateCoordinates(place.lat, place.lng)
  if (!check.ok) return { place: null, reason: `${provider.id}: ${check.reason}` }

  return { place, reason: null, onCityOnly: !zipAgrees }
}

interface Placed extends Candidate {
  lat: number
  lng: number
  placeId: string | null
  placeProvider: string | null
  precision: string
}

async function main(): Promise<void> {
  const candidatesPath = join(OUT_DIR, 'candidates.json')
  if (!existsSync(candidatesPath)) {
    console.error('No candidates.json — run scripts/nppes/build-practices.ts first.')
    process.exit(1)
  }

  let candidates = JSON.parse(readFileSync(candidatesPath, 'utf8')) as Candidate[]
  const merges = existsSync(join(OUT_DIR, 'merges.json'))
    ? (JSON.parse(readFileSync(join(OUT_DIR, 'merges.json'), 'utf8')) as MergeInstruction[])
    : []

  if (STATE) candidates = candidates.filter((c) => c.state === STATE)
  if (LIMIT) candidates = candidates.slice(0, LIMIT)

  console.log(
    `${candidates.length} candidates, ${merges.length} merges. Provider: ${getProvider().id}. ` +
      (APPLY ? 'APPLYING.' : 'Dry run — nothing will be written.')
  )

  // ---- backup --------------------------------------------------------------
  if (APPLY) {
    const { data, error } = await supabase.from('clinics').select('*').limit(5000)
    if (error) throw new Error(`Backup failed, refusing to write: ${error.message}`)
    mkdirSync(join(process.cwd(), 'data', 'backups'), { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = join(process.cwd(), 'data', 'backups', `clinics-${stamp}.json`)
    writeFileSync(path, JSON.stringify(data, null, 2))
    console.log(`Backed up ${data?.length ?? 0} clinics -> ${path}`)
  }

  // ---- geocode -------------------------------------------------------------
  const placed: Placed[] = []
  const unresolved: { candidate: Candidate; reason: string }[] = []
  const byPrecision = new Map<string, number>()
  const cityOnly: string[] = []

  const primary = getProvider()
  const fallback = getFallbackProvider(primary)
  let rescued = 0

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]

    const first = await attempt(candidate, primary)
    let place = first.place
    let reason = first.reason
    let onCityOnly = Boolean(first.onCityOnly)

    // The fallback is not decoration. The self-hosted engine put the main
    // Mayo Clinic campus in Claremont's postcode — the single most valuable
    // row in the import — and Geoapify placed it correctly. Whichever
    // engine answers, the ZIP check is what it has to get past.
    if (!place && fallback) {
      const second = await attempt(candidate, fallback)
      if (second.place) {
        place = second.place
        reason = null
        onCityOnly = Boolean(second.onCityOnly)
        rescued++
      } else {
        reason = `${reason}; ${second.reason}`
      }
    }

    if (!place) {
      unresolved.push({ candidate, reason: reason ?? 'unresolved' })
      continue
    }

    if (onCityOnly) cityOnly.push(`${candidate.name} — ${candidate.address}`)
    byPrecision.set(place.precision, (byPrecision.get(place.precision) ?? 0) + 1)
    placed.push({
      ...candidate,
      lat: place.lat,
      lng: place.lng,
      placeId: place.placeId ?? null,
      placeProvider: place.providerId ?? null,
      precision: place.precision,
    })

    if ((i + 1) % 25 === 0) {
      console.log(`  ${i + 1}/${candidates.length} geocoded, ${unresolved.length} unresolved`)
    }
  }

  writeFileSync(join(OUT_DIR, 'unresolved.json'), JSON.stringify(unresolved, null, 2))
  console.log(`\n  placed:     ${placed.length}`)
  if (fallback) console.log(`  rescued by ${fallback.id}: ${rescued}`)
  if (cityOnly.length) {
    console.log(`  accepted on city, ZIP disagreed: ${cityOnly.length}`)
    for (const line of cityOnly.slice(0, 10)) console.log(`      ${line}`)
  }
  console.log(`  unresolved: ${unresolved.length} -> data/nppes/unresolved.json (NOT inserted)`)
  console.log(`  precision:  ${JSON.stringify(Object.fromEntries(byPrecision))}`)

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  // ---- insert --------------------------------------------------------------
  const now = new Date().toISOString()
  // Every row in a batch carries the identical key set on purpose: PostgREST
  // unions the keys across a batch and NULLs whatever a row is missing, so one
  // row without `website` would blank it for the whole batch.
  const rows = placed.map((p) => ({
    id: p.id,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    phone: p.phone,
    specialties: p.specialties,
    email: p.email,
    website: p.website,
    region: p.region,
    county: p.county,
    street: p.street,
    city: p.city,
    state: p.state,
    zip_code: p.zipCode,
    place_id: p.placeId,
    place_provider: p.placeProvider,
    geocode_precision: p.precision,
    geocoded_at: now,
    available: p.available,
  }))

  let written = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const { error } = await supabase.from('clinics').upsert(slice, { onConflict: 'id' })
    if (error) throw new Error(`Upsert failed at row ${i}: ${error.message}`)
    written += slice.length
    console.log(`  upserted ${written}/${rows.length}`)
  }

  // ---- merge tags into rows already here -----------------------------------
  // `merges.json` covers both states and is not sliced by --state or --limit,
  // so a run that only meant to load a Minnesota sample would silently patch
  // every Florida row too. Slicing means rehearsing; rehearsing must not write
  // outside the slice.
  const sliced = Boolean(STATE || LIMIT)
  if (sliced && merges.length > 0) {
    console.log(`  skipping ${merges.length} tag merges: this run is a slice`)
  }
  if (!SKIP_MERGES && !sliced && merges.length > 0) {
    let merged = 0
    for (const m of merges) {
      const next = Array.from(new Set([...m.previousTags, ...m.addTags]))
      const { error } = await supabase.from('clinics').update({ specialties: next }).eq('id', m.id)
      if (error) {
        console.error(`  ✗ merge ${m.id}: ${error.message}`)
        continue
      }
      merged++
    }
    console.log(`  merged tags into ${merged}/${merges.length} existing clinics`)
  }

  console.log('\nDone. Rollback:')
  console.log("  DELETE FROM clinics WHERE id LIKE 'n-%';")
  console.log('  ...and data/nppes/merges.json holds each merged row\'s previous tags.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
