/**
 * Fill in `street`, `city`, `state` and `zip_code` from the free-text address
 * already stored on each clinic and firm.
 *
 * Why it matters: those columns did not exist until
 * `2026-08-structured-addresses.sql`. Every read path re-derived city, state
 * and ZIP by running `parseAddress` over the address string — on every request,
 * for every record — and the state filter had to be
 * `ILIKE '%FL%'` with a JS pass behind it, because there was no column to
 * index. This turns that work into a one-off.
 *
 * IT DOES NOT GEOCODE. No provider is called and no coordinate is touched. The
 * parse is the same `parseAddress` the read path uses, so a row this script
 * fills in produces exactly the values the app was already showing. That is the
 * point: it is a safe, reversible move of existing behaviour from read time to
 * write time.
 *
 * Re-resolving coordinates is `scripts/backfill-geocode.ts`, and it is a
 * different decision with a different risk profile.
 *
 * Dry run by default — nothing is written without `--apply`:
 *
 *   npx tsx scripts/backfill-structured-addresses.ts
 *   npx tsx scripts/backfill-structured-addresses.ts --apply
 *   npx tsx scripts/backfill-structured-addresses.ts --apply --table=lawyers
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseAddress } from '../src/lib/address'

config({ path: '.env.local' })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')
const TABLE_ARG = process.argv.find((a) => a.startsWith('--table='))?.split('=')[1]
const TABLES = TABLE_ARG ? [TABLE_ARG] : ['clinics', 'lawyers']

interface Row {
  id: string
  name: string
  address: string
  city: string | null
  state: string | null
  zip_code?: string | null
}

async function backfillTable(table: string) {
  // `lawyers.zip_code` predates this migration and is populated on most rows;
  // `clinics.zip_code` is new. Selecting it from both keeps one code path.
  const { data, error } = await supabase
    .from(table)
    .select('id, name, address, city, state, zip_code')
    .is('city', null)
    .order('id')

  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`)
    return
  }

  const rows = (data ?? []) as Row[]
  console.log(`\n${table}: ${rows.length} row(s) with no structured city`)

  let filled = 0
  let unparsed = 0

  for (const row of rows) {
    const parts = parseAddress(row.address)

    // ALL OR NOTHING, and `confident` is the gate.
    //
    // Two reasons, and they compound. First, `parseAddress` says so itself:
    // callers that need trustworthy geography — state scoping, ZIP search —
    // must treat a low-confidence parse as unknown rather than as data, because
    // its loose scan will read "Ct" in "Court" as Connecticut. A wrong `state`
    // does not look wrong; the record simply stops appearing on a Florida
    // user's map.
    //
    // Second, the read path decides whether a row is backfilled by looking for
    // a non-null city or state. Writing one without the other would leave a row
    // that is neither structured nor eligible for the fallback, and it would
    // lose the state the old read path used to derive for it.
    if (!parts.confident || !parts.city || !parts.state) {
      unparsed += 1
      console.log(`  ? ${row.id}  ${row.name}`)
      console.log(
        `      ${parts.confident ? 'incomplete' : 'low confidence'}: ${row.address}`
      )
      continue
    }

    const update: Record<string, unknown> = {
      street: parts.street ?? null,
      city: parts.city ?? null,
      state: parts.state ?? null,
    }
    // Never overwrite a ZIP the table already holds — on `lawyers` it is
    // authoritative and the parsed one is only ever a fallback.
    if (!row.zip_code && parts.zip) update.zip_code = parts.zip

    if (APPLY) {
      const { error: writeError } = await supabase.from(table).update(update).eq('id', row.id)
      if (writeError) {
        console.error(`  ✗ ${row.id}: ${writeError.message}`)
        continue
      }
    }

    filled += 1
    console.log(
      `  ${APPLY ? '✓' : '·'} ${row.id}  ${parts.street ?? '—'} / ${parts.city ?? '—'} / ${parts.state ?? '—'} ${update.zip_code ?? row.zip_code ?? ''}`
    )
  }

  console.log(`  ${filled} filled, ${unparsed} left for a human`)

  if (unparsed > 0) {
    console.log(
      `  Those ${unparsed} keep working: a NULL city means the read path falls\n` +
        '  back to parseAddress exactly as it did before this migration.'
    )
  }
}

async function main() {
  console.log(APPLY ? 'APPLYING changes' : 'DRY RUN — pass --apply to write')

  for (const table of TABLES) {
    await backfillTable(table)
  }

  console.log(
    '\nVerify before and after, per state:\n' +
      "  SELECT count(*) FROM clinics WHERE address ILIKE '%FL%';\n" +
      "  SELECT count(*) FROM clinics WHERE state = 'FL';\n" +
      'The second must not be smaller. If it is, addresses are going unparsed\n' +
      'and those clinics would disappear from a state-scoped map.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
