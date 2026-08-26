/**
 * Loads the built index into Supabase.
 *
 * Phase 2. Reads `data/geo/index/merged.ndjson`, which
 * `scripts/geo/build-index.ts` produced, and writes 589,000 street rows plus
 * their packed coordinate blobs.
 *
 *   npx tsx scripts/geo/load-index.ts                    # dry run, the default
 *   npx tsx scripts/geo/load-index.ts --apply
 *   npx tsx scripts/geo/load-index.ts --apply --truncate # start clean
 *   npx tsx scripts/geo/load-index.ts --apply --from=250000
 *
 * Dry by default, following `scripts/backfill-geocode.ts`. A script that
 * rewrites six hundred thousand rows should never do it because someone typed
 * the command to see what it did.
 *
 * ── The one thing that has to be verified before the other 589,000 ──────────
 *
 * The payloads are `bytea`, and PostgREST carries binary as a hex string. If
 * that round trip is lossy in either direction the load still "succeeds" and
 * every coordinate in the database is quietly wrong. So the first batch is read
 * back and compared byte for byte before the second one is sent.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { countPoints, payloadChecksum } from '../../src/lib/geocoding/payload-codec'
import type { LoadableStreet } from './build-index'

config({ path: '.env.local' })
config()

const MERGED = 'data/geo/index/merged.ndjson'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const APPLY = process.argv.includes('--apply')
const TRUNCATE = process.argv.includes('--truncate')
const FROM = Number(arg('from')) || 0

/**
 * Rows per request.
 *
 * A street row plus its hex-encoded payload averages around 900 bytes on the
 * wire, so five hundred is roughly half a megabyte — comfortably inside
 * PostgREST's limits with room for the outliers, and few enough requests that
 * the whole load is a matter of tens of minutes rather than hours.
 */
const BATCH = 500

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

interface StreetRow {
  id: number
  name_norm: string
  name_display: string
  city: string
  state: string
  zip: string
  num_min: number
  num_max: number
  lat_min: number
  lat_max: number
  lng_min: number
  lng_max: number
  point_count: number
  checksum: number
}

function toStreetRow(street: LoadableStreet, payload: Buffer): StreetRow {
  return {
    id: street.i,
    name_norm: street.n,
    name_display: street.d,
    city: street.c,
    state: street.s,
    zip: street.z,
    num_min: street.n0,
    num_max: street.n1,
    lat_min: street.y0,
    lat_max: street.y1,
    lng_min: street.x0,
    lng_max: street.x1,
    point_count: street.k,
    // Stored so the quarterly refresh can tell in one integer comparison
    // whether this street changed, instead of reading 100 MB of payloads back.
    checksum: payloadChecksum(payload, street.d),
  }
}

/** Postgres' hex input format for bytea: a literal backslash, an x, then hex. */
const toBytea = (payload: Buffer) => `\\x${payload.toString('hex')}`

/** And back, for the round-trip check. */
const fromBytea = (value: string) => Buffer.from(value.replace(/^\\x/, ''), 'hex')

async function writeBatch(streets: StreetRow[], points: Array<{ street_id: number; payload: string }>) {
  // Streets first: the points table has a foreign key onto it, so the reverse
  // order fails the whole batch on the first row.
  const inserted = await supabase.from('geo_street').upsert(streets, { onConflict: 'id' })
  if (inserted.error) throw new Error(`geo_street: ${inserted.error.message}`)

  const stored = await supabase.from('geo_street_points').upsert(points, { onConflict: 'street_id' })
  if (stored.error) throw new Error(`geo_street_points: ${stored.error.message}`)
}

/**
 * Reads one payload back and compares it to what was sent.
 *
 * Run once, after the first batch. A silent encoding fault here would put
 * plausible-looking coordinates on every street in the database, and nothing
 * downstream would flag it -- the pins would simply be in the wrong places.
 */
async function verifyRoundTrip(streetId: number, sent: Buffer) {
  const { data, error } = await supabase
    .from('geo_street_points')
    .select('payload')
    .eq('street_id', streetId)
    .single()

  if (error) throw new Error(`round-trip check could not read street ${streetId}: ${error.message}`)

  const back = fromBytea(String((data as { payload: string }).payload))
  if (!back.equals(sent)) {
    throw new Error(
      `bytea round trip is lossy: sent ${sent.length} bytes, read back ${back.length}. ` +
        'Stopping before the remaining rows are written with the same fault.'
    )
  }

  console.log(`  ✓ bytea round trip verified on street ${streetId} (${countPoints(back)} points)\n`)
}

async function truncate() {
  console.log('  Clearing both tables…')
  // PostgREST refuses an unfiltered delete on purpose. `gte(id, 0)` is the
  // filter that means "all of them" for a table whose ids start at zero.
  const points = await supabase.from('geo_street_points').delete().gte('street_id', 0)
  if (points.error) throw new Error(`clearing geo_street_points: ${points.error.message}`)

  const streets = await supabase.from('geo_street').delete().gte('id', 0)
  if (streets.error) throw new Error(`clearing geo_street: ${streets.error.message}`)
}

async function main() {
  console.log(`\n  ${APPLY ? 'Loading' : 'DRY RUN — nothing will be written'}  ${MERGED}`)
  if (FROM > 0) console.log(`  resuming from row ${FROM.toLocaleString('en-US')}`)
  console.log('')

  if (APPLY && TRUNCATE) await truncate()

  const lines = createInterface({ input: createReadStream(MERGED), crlfDelay: Infinity })

  let read = 0
  let written = 0
  let points = 0
  let verified = !APPLY
  const started = Date.now()

  let streetBatch: StreetRow[] = []
  let pointBatch: Array<{ street_id: number; payload: string }> = []

  const flush = async () => {
    if (streetBatch.length === 0) return

    if (APPLY) {
      await writeBatch(streetBatch, pointBatch)

      if (!verified) {
        const first = streetBatch[0]
        await verifyRoundTrip(first.id, fromBytea(pointBatch[0].payload))
        verified = true
      }
    }

    written += streetBatch.length
    const elapsed = (Date.now() - started) / 1000
    const rate = written / Math.max(elapsed, 0.001)
    process.stdout.write(
      `  ${written.toLocaleString('en-US').padStart(9)} streets   ` +
        `${points.toLocaleString('en-US').padStart(12)} points   ` +
        `${rate.toFixed(0).padStart(5)} rows/s\r`
    )

    streetBatch = []
    pointBatch = []
  }

  for await (const line of lines) {
    if (!line) continue
    read++
    if (read <= FROM) continue

    const street = JSON.parse(line) as LoadableStreet
    const payload = Buffer.from(street.p, 'base64')

    streetBatch.push(toStreetRow(street, payload))
    pointBatch.push({ street_id: street.i, payload: toBytea(payload) })
    points += street.k

    if (streetBatch.length >= BATCH) await flush()
  }

  await flush()

  const elapsed = (Date.now() - started) / 1000
  console.log(' '.repeat(70) + '\r')
  console.log(
    `  ${written.toLocaleString('en-US')} streets, ${points.toLocaleString('en-US')} address points` +
      ` in ${(elapsed / 60).toFixed(1)} min`
  )

  if (!APPLY) {
    console.log('\n  Nothing was written. Re-run with --apply.\n')
    return
  }

  console.log('\n  Next: run PART 2 of scripts/migrations/2026-09-geo-index.sql')
  console.log('  (the trigram index, deliberately built after the load)\n')
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`)
  if (APPLY) {
    console.error('  The load is resumable — re-run with --from=<the last row count printed>.\n')
  }
  process.exit(1)
})
