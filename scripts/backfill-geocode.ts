/**
 * Re-resolve coordinates, place ids and precision for clinics and firms.
 *
 * NOT PART OF THE CURRENT DEPLOY. It is written, tested and ready, and it
 * should not be run until a real geocoding provider is configured.
 *
 * Running it against Nominatim would be pointless work: every record in the
 * table was imported by `scripts/import-clinics-json.js`, which already asked
 * Nominatim, so it would spend an hour re-deriving the coordinates the rows
 * already have. The value only appears with a provider that has US residential
 * address coverage — which is the entire reason `src/lib/geocoding` exists as
 * an adapter layer rather than a rewrite.
 *
 * The day a key is set:
 *
 *   GEOCODER_PROVIDER=mapbox npx tsx scripts/backfill-geocode.ts
 *   GEOCODER_PROVIDER=mapbox npx tsx scripts/backfill-geocode.ts --apply
 *
 * Roughly 880 records. One-off cost: about $4.40 on Mapbox permanent
 * geocoding, nothing on Google's free tier — but see the note on storage below
 * before choosing Google for this path.
 *
 * Flags:
 *   --apply           write (default is a dry run)
 *   --table=clinics   one table only
 *   --limit=50        stop after N rows; the run is resumable
 *   --force           accept a result that moves a record more than 2 miles
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { getProvider } from '../src/lib/geocoding'
import { mapboxPermanentForward } from '../src/lib/geocoding/mapbox'
import { haversineDistance } from '../src/lib/map/geo'
import { stripUnit } from '../src/lib/address'

config({ path: '.env.local' })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')
const TABLE_ARG = process.argv.find((a) => a.startsWith('--table='))?.split('=')[1]
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]) || 0
const TABLES = TABLE_ARG ? [TABLE_ARG] : ['clinics', 'lawyers']

/**
 * How far a new point may move an existing record before a human has to look.
 *
 * A geocoder that quietly relocates a real clinic forty miles is worse than one
 * that finds nothing: nothing is visible, a wrong pin is not. Two miles is
 * wide enough to absorb a genuine correction from a ZIP centroid to a rooftop,
 * and narrow enough that a different-city match trips it.
 */
const MAX_DRIFT_MILES = 2

/** Nominatim asks for one request per second; paid providers do not. */
const PACING_MS = getProvider().id === 'nominatim' ? 1100 : 120

interface Row {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  zip_code: string | null
}

/**
 * Is a long move a CORRECTION rather than a different place?
 *
 * Distance alone turned out to be the wrong question. On a sample of 50 clinics
 * this guard held back 15, and inspecting them showed the same pattern every
 * time: identical street, identical city, identical ZIP, three to five miles
 * apart. For example `3214 Fordham Pkwy, Gulf Breeze, FL 32563` came back as
 * `3214 Fordham Parkway, Gulf Breeze, FL 32563` — 4.5 miles from the stored
 * point. Those are not misidentifications. They are the stored coordinate being
 * wrong, because Nominatim matched the street without its directional suffix
 * and landed somewhere else on it.
 *
 * So the ZIP is the better signal. If the provider agrees with the postcode
 * already on the record, it found the same address and simply knows where it is
 * more precisely — distance is not evidence of anything. A ZIP mismatch is what
 * actually means "different place", and that still faces the distance guard.
 */
function isSameAddress(row: Row, resolvedZip: string | null): boolean {
  if (!row.zip_code || !resolvedZip) return false
  return row.zip_code.slice(0, 5) === resolvedZip.slice(0, 5)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Ask once, then once more without the unit designator.
 *
 * The interactive search box deliberately does NOT do this: Geoapify parses
 * "#200" and "Ste A" perfectly well, so a blanket retry would double the credit
 * cost of every keystroke to rescue a rare case. In a one-off batch the
 * arithmetic reverses — a second request costs one credit and recovers a record
 * that would otherwise need a human.
 *
 * Measured on this corpus: of seven clinics the first pass could not resolve,
 * three came back on the retry. `1531 SE 17th St Unit 101/102, Ocala, FL 34471`
 * returns nothing; `1531 SE 17th St, Ocala, FL 34471` is a rooftop match.
 */
async function resolveWithRetry(address: string) {
  const first = await resolveAddress(address)
  if (first.ok && first.value) return first

  const stripped = stripUnit(address)
  if (stripped === address || stripped.length < 6) return first

  await sleep(PACING_MS)
  const second = await resolveAddress(stripped)
  if (second.ok && second.value) {
    console.log(`      (recovered by dropping the unit: "${stripped}")`)
  }
  return second
}

async function resolveAddress(address: string) {
  const provider = getProvider()

  // `permanent: true` is what makes storing the coordinate legal rather than
  // merely possible. On Mapbox it switches to Geocoding v6, which is billed at
  // the permanent rate and returns geometry directly, with no session and no
  // second round trip — the right shape for a batch job.
  //
  // On Google it is a WARNING rather than a switch: Google permits storing the
  // place id indefinitely but requires any coordinate to be deleted within 30
  // days, so using it here signs the project up to a nightly refresh job in
  // perpetuity. Mapbox permanent has no such obligation. That asymmetry is the
  // strongest argument for a hybrid — Google for the interactive search box if
  // it wins on coverage, Mapbox for anything written to the database.
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

async function backfillTable(table: string) {
  const query = supabase
    .from(table)
    .select('id, name, address, lat, lng, zip_code')
    .is('geocoded_at', null)
    .order('id')

  const { data, error } = LIMIT ? await query.limit(LIMIT) : await query
  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`)
    return
  }

  const rows = (data ?? []) as Row[]
  console.log(`\n${table}: ${rows.length} row(s) never geocoded`)

  const byPrecision = new Map<string, number>()
  let written = 0
  let failed = 0
  let heldBack = 0

  for (const row of rows) {
    await sleep(PACING_MS)
    const result = await resolveWithRetry(row.address)

    if (!result.ok || !result.value) {
      failed += 1
      byPrecision.set('failed', (byPrecision.get('failed') ?? 0) + 1)
      console.log(`  ✗ ${row.id}  ${row.name}`)
      console.log(`      no match: ${row.address}`)
      // Dated with precision 'unknown' so the run is resumable and this row is
      // not retried forever — and so it can be LISTED for a human. It must not
      // silently keep sitting at (0, 0).
      if (APPLY) {
        await supabase
          .from(table)
          .update({ geocode_precision: 'unknown', geocoded_at: new Date().toISOString() })
          .eq('id', row.id)
      }
      continue
    }

    const place = result.value
    const drift =
      row.lat !== 0 || row.lng !== 0
        ? haversineDistance(row.lat, row.lng, place.lat, place.lng)
        : 0

    const sameAddress = isSameAddress(row, place.address?.postcode ?? null)

    if (drift > MAX_DRIFT_MILES && !sameAddress && !FORCE) {
      heldBack += 1
      console.log(`  ⚠ ${row.id}  ${row.name}`)
      console.log(
        `      moves ${drift.toFixed(1)} mi AND lands in a different ZIP — held back, --force to accept`
      )
      console.log(`      ${row.lat},${row.lng}  ->  ${place.lat},${place.lng}`)
      console.log(`      ${row.address}`)
      console.log(`      ${place.fullLabel}`)
      continue
    }

    // A long move the ZIP agrees with is worth saying out loud: it means the
    // stored coordinate was wrong, not that the provider found somewhere else.
    if (drift > MAX_DRIFT_MILES) {
      console.log(`  ↻ ${row.id}  corrects a ${drift.toFixed(1)} mi error (same ZIP ${row.zip_code})`)
    }

    byPrecision.set(place.precision, (byPrecision.get(place.precision) ?? 0) + 1)

    if (APPLY) {
      const { error: writeError } = await supabase
        .from(table)
        .update({
          lat: place.lat,
          lng: place.lng,
          street: place.address?.street ?? null,
          city: place.address?.city ?? null,
          state: place.address?.state ?? null,
          zip_code: place.address?.postcode ?? null,
          place_id: place.placeId,
          place_provider: place.providerId,
          geocode_precision: place.precision,
          geocoded_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      if (writeError) {
        console.error(`  ✗ ${row.id}: ${writeError.message}`)
        continue
      }
    }

    written += 1
    console.log(`  ${APPLY ? '✓' : '·'} ${row.id}  ${place.precision.padEnd(12)} ${place.fullLabel}`)
  }

  console.log(`\n  ${written} written, ${failed} unresolved, ${heldBack} held back`)
  console.log('  by precision:')
  // Array.from rather than a spread: tsconfig sets no `target`, so it defaults
  // low and spreading a Map iterator needs --downlevelIteration.
  for (const [precision, count] of Array.from(byPrecision.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${precision.padEnd(14)} ${count}`)
  }
  // This table is the conversation with the client. "How many of our records
  // are actually on the right building" has never had an answer before.
}

async function main() {
  const provider = getProvider()
  console.log(`provider: ${provider.id}`)
  if (provider.id === 'nominatim') {
    console.log(
      'WARNING: every record in these tables was already imported using Nominatim.\n' +
        '  Running against it will spend an hour re-deriving the coordinates the\n' +
        '  rows already have. Set GEOCODER_PROVIDER to a provider with real US\n' +
        '  address coverage first.'
    )
  }
  console.log(APPLY ? 'APPLYING changes' : 'DRY RUN — pass --apply to write')

  for (const table of TABLES) {
    await backfillTable(table)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
