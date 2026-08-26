/**
 * Re-ingests the county registers, writing only what changed.
 *
 * Phase 6, and the part that decides whether this engine stays good. Address
 * data is not a one-off cost: counties publish new subdivisions continuously,
 * and the reason the reported address was missing in the first place is that
 * OpenStreetMap had not caught up with Manatee County. An index nobody refreshes
 * becomes the same problem it was built to solve, only slower.
 *
 *   npx tsx scripts/geo/refresh-index.ts              # dry run, the default
 *   npx tsx scripts/geo/refresh-index.ts --apply
 *
 * Expects `scripts/geo/fetch-openaddresses.ts` and `scripts/geo/build-index.ts`
 * to have run first; the workflow chains all three.
 *
 * ── Why this is not just a reload ───────────────────────────────────────────
 *
 * Two reasons, and both cost real money if ignored.
 *
 * **Ids have to survive.** They are assigned by the indexer as a sequence, so a
 * rebuild renumbers everything and a straight reload rewrites all 567,000 rows
 * plus 100 MB of blobs to change a few hundred streets. So the existing keys
 * and their ids are read back first, and a street that was here before keeps
 * the id it had.
 *
 * **Comparison has to be cheap.** Diffing the payloads would mean pulling
 * 100 MB out of Supabase every quarter. The `checksum` column exists for this:
 * 567,000 integers, one comparison each.
 *
 * The gate this was built against: a re-ingest over unchanged data writes
 * nothing at all.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { payloadChecksum } from '../../src/lib/geocoding/payload-codec'
import type { LoadableStreet } from './build-index'

config({ path: '.env.local' })
config()

const MERGED = 'data/geo/index/merged.ndjson'
const APPLY = process.argv.includes('--apply')
const BATCH = 500
/** Rows per page when reading the existing index back. PostgREST caps a response. */
const PAGE = 10_000

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY\n')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

/** The unique key, exactly as `geo_street_key` defines it. */
const keyOf = (state: string, city: string, zip: string, nameNorm: string) =>
  `${state}\0${city}\0${zip}\0${nameNorm}`

interface Existing {
  id: number
  checksum: number
}

/**
 * Reads back every street's key, id and checksum.
 *
 * About 567,000 rows and 40 MB over the wire, which is the price of not
 * rewriting the whole table. Paged, because PostgREST caps a single response
 * and a silent truncation here would look like every unseen street had been
 * deleted.
 */
async function readExisting(): Promise<Map<string, Existing>> {
  const out = new Map<string, Existing>()

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('geo_street')
      .select('id, state, city, zip, name_norm, checksum')
      .order('id')
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`reading geo_street: ${error.message}`)
    const rows = (data ?? []) as Array<Record<string, unknown>>
    if (rows.length === 0) break

    for (const row of rows) {
      out.set(
        keyOf(String(row.state), String(row.city), String(row.zip ?? ''), String(row.name_norm)),
        { id: Number(row.id), checksum: Number(row.checksum) }
      )
    }

    process.stdout.write(`  read ${out.size.toLocaleString('en-US')} existing streets\r`)
    if (rows.length < PAGE) break
  }

  console.log(' '.repeat(50) + '\r')
  return out
}

const toBytea = (payload: Buffer) => `\\x${payload.toString('hex')}`

async function main() {
  console.log(`\n  ${APPLY ? 'Refreshing' : 'DRY RUN — nothing will be written'}\n`)

  const existing = await readExisting()
  console.log(`  ${existing.size.toLocaleString('en-US')} streets currently indexed\n`)

  // Ids for streets that are new. Continuing above the highest in use rather
  // than filling gaps: a reused id would point `geo_street_points` at a blob
  // belonging to a street that no longer exists.
  let nextId = 0
  existing.forEach((row) => {
    if (row.id >= nextId) nextId = row.id + 1
  })

  const seen = new Set<string>()
  let read = 0
  let unchanged = 0
  let changed = 0
  let added = 0

  let streetBatch: Array<Record<string, unknown>> = []
  let pointBatch: Array<{ street_id: number; payload: string }> = []

  const flush = async () => {
    if (streetBatch.length === 0) return
    if (APPLY) {
      const wrote = await supabase.from('geo_street').upsert(streetBatch, { onConflict: 'id' })
      if (wrote.error) throw new Error(`geo_street: ${wrote.error.message}`)

      const stored = await supabase.from('geo_street_points').upsert(pointBatch, { onConflict: 'street_id' })
      if (stored.error) throw new Error(`geo_street_points: ${stored.error.message}`)
    }
    streetBatch = []
    pointBatch = []
  }

  const lines = createInterface({ input: createReadStream(MERGED), crlfDelay: Infinity })

  for await (const line of lines) {
    if (!line) continue
    read++

    const street = JSON.parse(line) as LoadableStreet
    const payload = Buffer.from(street.p, 'base64')
    const checksum = payloadChecksum(payload, street.d)
    const composite = keyOf(street.s, street.c, street.z, street.n)

    seen.add(composite)

    const before = existing.get(composite)
    if (before && before.checksum === checksum) {
      unchanged++
      continue
    }

    // Keep the id it already had, so `geo_street_points` still points at it.
    const id = before ? before.id : nextId++
    if (before) changed++
    else added++

    streetBatch.push({
      id,
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
      checksum,
    })
    pointBatch.push({ street_id: id, payload: toBytea(payload) })

    if (streetBatch.length >= BATCH) await flush()
  }

  await flush()

  // Streets the registers no longer publish. Usually a county renaming a road,
  // occasionally a source that stopped publishing altogether -- which is why
  // the count is printed rather than the deletion being silent. `on delete
  // cascade` takes the blobs with them.
  const removed: number[] = []
  existing.forEach((row, composite) => {
    if (!seen.has(composite)) removed.push(row.id)
  })

  if (APPLY && removed.length > 0) {
    for (let i = 0; i < removed.length; i += BATCH) {
      const { error } = await supabase.from('geo_street').delete().in('id', removed.slice(i, i + BATCH))
      if (error) throw new Error(`removing streets: ${error.message}`)
    }
  }

  console.log(`${'─'.repeat(56)}`)
  console.log(`  streets in the new build  ${read.toLocaleString('en-US').padStart(10)}`)
  console.log(`  unchanged                 ${unchanged.toLocaleString('en-US').padStart(10)}`)
  console.log(`  changed                   ${changed.toLocaleString('en-US').padStart(10)}`)
  console.log(`  added                     ${added.toLocaleString('en-US').padStart(10)}`)
  console.log(`  removed                   ${removed.length.toLocaleString('en-US').padStart(10)}`)

  const writes = changed + added + removed.length
  console.log(`  ${'─'.repeat(38)}`)
  console.log(`  rows written              ${writes.toLocaleString('en-US').padStart(10)}`)

  if (!APPLY) console.log('\n  Nothing was written. Re-run with --apply.')

  // A refresh that rewrites most of the table has not diffed anything, and the
  // likeliest cause is that the ids were renumbered or the checksum changed
  // meaning. Better to say so than to quietly burn the write quota.
  if (existing.size > 0 && writes > existing.size * 0.25) {
    console.log(
      `\n  ⚠  ${((writes / existing.size) * 100).toFixed(0)}% of the index was rewritten. Counties do not change` +
        `\n     that fast — check whether the checksum or the key changed meaning.`
    )
  }
  console.log('')
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
