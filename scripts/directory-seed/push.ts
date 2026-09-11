/**
 * Writes the APPROVED directory rows into Supabase.
 *
 *   npx tsx scripts/directory-seed/push.ts                 (dry run — default)
 *   npx tsx scripts/directory-seed/push.ts --apply
 *   npx tsx scripts/directory-seed/push.ts --apply --from=400
 *
 * -- The review gate ---------------------------------------------------------
 *
 * This refuses to run unless `review.csv` has been modified since `prepare.ts`
 * wrote it. That is the whole point of the two-stage pipeline: these rows were
 * compiled by automated research, and the only thing standing between a
 * plausible-but-wrong phone number and a live public directory is a person
 * having actually looked at the file. `--no-review-check` exists for re-runs
 * of an already-approved file, not for skipping the review.
 *
 * Every row lands with `directory_public: true` — it is the flag the public
 * route filters on — and `available: true`, matching the 176 seeded firms
 * already in the table so the internal directory does not split into two
 * populations that sort differently.
 */
import { readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { revalidateDirectory } from '../revalidate-directory'

config({ path: '.env.local' })
config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const APPLY = process.argv.includes('--apply')
const SKIP_REVIEW_CHECK = process.argv.includes('--no-review-check')
const FROM = Number(arg('from')) || 0
const BATCH = 200

const DIR = join(process.cwd(), 'data', 'directory-seed')
const CSV = join(DIR, 'review.csv')

/** Minimal RFC-4180 reader: the CSV is ours, but a firm name may hold a comma. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(cell); cell = ''
    } else if (c === '\n') {
      row.push(cell); cell = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else if (c !== '\r') {
      cell += c
    }
  }
  row.push(cell)
  if (row.some((v) => v !== '')) rows.push(row)
  return rows
}

async function main() {
  if (!existsSync(CSV)) {
    console.error(`\n  No ${CSV}. Run prepare.ts first.\n`)
    process.exit(1)
  }

  if (!SKIP_REVIEW_CHECK) {
    const rejectedPath = join(DIR, 'rejected.json')
    if (existsSync(rejectedPath)) {
      const written = statSync(rejectedPath).mtimeMs
      const reviewed = statSync(CSV).mtimeMs
      if (reviewed <= written + 1000) {
        console.error(
          '\n  review.csv has not been touched since prepare.ts wrote it.\n' +
            '  These rows came from automated research: open the file, check it,\n' +
            '  delete anything you do not want, and save it.\n' +
            '  (--no-review-check re-runs an already-approved file.)\n'
        )
        process.exit(1)
      }
    }
  }

  const rows = parseCsv(readFileSync(CSV, 'utf8'))
  const header = rows.shift()
  if (!header) { console.error('  empty CSV'); process.exit(1) }
  const col = (name: string) => header.indexOf(name)

  /**
   * A row prepare.ts could not decide about is marked `review`, and this
   * refuses to run while any remain. They are the rows that share a phone
   * number with a firm already in the directory: either a second office of
   * the same firm, which should become `insert`, or the same office written
   * differently, which should become `skip`. Guessing would either lose a
   * real location or publish the same one twice.
   */
  const pending = rows.filter(
    (r) => (r[col('action')] ?? '').trim().toLowerCase() === 'review'
  )
  if (pending.length) {
    console.error(`\n  ${pending.length} rows are still marked "review". Open review.csv,`)
    console.error('  read the notes column, and set each one to insert or skip:\n')
    pending.slice(0, 10).forEach((r) => console.error(`    ${r[col('id')]}  ${r[col('name')]}`))
    console.error('')
    process.exit(1)
  }

  const records = rows
    .filter((r) => (r[col('action')] ?? 'insert').trim().toLowerCase() !== 'skip')
    .map((r) => ({
      id: r[col('id')].trim(),
      name: r[col('name')].trim(),
      address: r[col('address')].trim(),
      lat: Number(r[col('lat')]),
      lng: Number(r[col('lng')]),
      phone: r[col('phone')].trim(),
      practice_areas: r[col('practice_areas')].split(';').map((s) => s.trim()).filter(Boolean),
      email: '',
      website: r[col('website')].trim() || null,
      // `lawyers.region` holds a CITY name, not a region — verified across all
      // 176 existing rows, and src/lib/search/documents.ts indexes it as one.
      region: r[col('city')].trim(),
      county: r[col('county')].trim() || null,
      zip_code: r[col('zip')].trim(),
      street: r[col('street')].trim(),
      city: r[col('city')].trim(),
      state: 'FL',
      available: true,
      directory_public: true,
    }))

  const bad = records.filter(
    (r) => !r.id || !r.name || !r.address || !r.phone ||
      !Number.isFinite(r.lat) || !Number.isFinite(r.lng) ||
      (r.lat === 0 && r.lng === 0) || r.practice_areas.length === 0
  )
  if (bad.length) {
    console.error(`\n  ${bad.length} rows are incomplete or sit at (0,0). Fix or delete them:\n`)
    bad.slice(0, 10).forEach((r) => console.error(`    ${r.id} ${r.name}`))
    process.exit(1)
  }

  // An id already in the table would silently overwrite a real firm.
  const ids = records.map((r) => r.id)
  const { data: clash } = await supabase.from('lawyers').select('id').in('id', ids)
  if (clash?.length) {
    console.error(`\n  ${clash.length} ids already exist, starting with ${clash[0].id}.`)
    console.error('  Re-run prepare.ts so it allocates from the current high-water mark.\n')
    process.exit(1)
  }

  console.log(
    `\n  ${records.length} rows ready. ` +
      (APPLY ? `APPLYING from ${FROM}.` : 'Dry run — nothing will be written.')
  )
  const byArea: Record<string, number> = {}
  for (const r of records) for (const a of r.practice_areas) byArea[a] = (byArea[a] ?? 0) + 1
  console.log(`  by practice area: ${JSON.stringify(byArea)}\n`)

  if (!APPLY) {
    console.log('  Re-run with --apply to write.\n')
    return
  }

  let written = FROM
  for (let i = FROM; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH)
    const { error } = await supabase.from('lawyers').upsert(slice, { onConflict: 'id' })
    if (error) {
      console.error(`\n  Failed at row ${i}: ${error.message}`)
      console.error(`  The load is resumable — re-run with --from=${i}\n`)
      process.exit(1)
    }
    written += slice.length
    console.log(`  upserted ${written}/${records.length}`)

    // Verify the round trip on the first batch, before writing the rest.
    if (i === FROM) {
      const sample = slice.slice(0, 3)
      const { data: back } = await supabase
        .from('lawyers')
        .select('id, name, phone, lat, lng, directory_public')
        .in('id', sample.map((s) => s.id))
      for (const s of sample) {
        const got = back?.find((b) => b.id === s.id)
        if (!got || got.name !== s.name || got.phone !== s.phone || got.directory_public !== true) {
          console.error(`\n  Round-trip check failed for ${s.id}. Stopping before the rest.\n`)
          process.exit(1)
        }
      }
      console.log('  round-trip verified on the first batch')
    }
  }

  const { count } = await supabase
    .from('lawyers')
    .select('*', { count: 'exact', head: true })
    .eq('directory_public', true)
  console.log(`\n  Done. ${count} firms are now public.\n`)

  /**
   * Writing the rows is only half the job.
   *
   * This is a database-only change — no deploy, no request to the app —
   * so neither Next's data cache nor the CDN has any way to learn about
   * it. Without this call the previous payload keeps being served: when
   * these 451 rows landed, that meant visitors searching "Bradenton"
   * got nothing for a day, because the cached 176-firm payload had no
   * Bradenton in it.
   *
   * A failure here never fails the run. The rows are already written;
   * what is left is a stale cache, which a human can fix in one
   * command — so say so, loudly, rather than exiting non-zero and
   * implying the import did not work.
   */
  const purge = await revalidateDirectory()
  if (purge.ok) {
    console.log(`  Site cache purged (${purge.detail}).\n`)
  } else {
    console.warn(`\n  ⚠  the CDN was NOT purged — run: npm run directory:revalidate`)
    console.warn(`     reason: ${purge.detail}\n`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
