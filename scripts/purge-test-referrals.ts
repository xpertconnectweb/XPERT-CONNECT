/**
 * Deletes the manual test cases from the two referral tables.
 *
 *   npx tsx scripts/purge-test-referrals.ts          # dry run
 *   npx tsx scripts/purge-test-referrals.ts --apply  # delete
 *
 * WHY AN EXPLICIT ID LIST, and not a `LIKE '%test%'` sweep: these tables hold
 * production data. There is no `is_test` column, no `deleted_at`, and no soft
 * delete anywhere in the schema — a delete here is final. A pattern would also
 * match any future real client whose name happens to contain it. So every row
 * is named by primary key, paired with the name it is expected to still have,
 * and the script ABORTS if a single pair disagrees rather than deleting
 * something that changed underneath it.
 *
 * The Playwright suite's own `e2e-` rows are NOT listed: those are swept by
 * e2e/global.teardown.ts and `npm run e2e:sweep`. This script is only for the
 * junk left behind by hand-testing the app.
 *
 * DELIBERATELY KEPT — two rows that look like real client cases, confirmed
 * with the project owner before this list was written. Identified by id only,
 * and deliberately not by name: this repository is public, and keeping
 * production client data off the remote is the same reason the backup file
 * this script writes is gitignored.
 *   referrals          ref-ad6a1767-…   real clinic and real firm, plus a
 *                      treatment note nobody types while testing
 *   referrer_referrals rref-8fa03131-…  real contact details, and it was still
 *                      being edited the day before the purge ran
 *
 * Only referral rows are touched. Accounts (`users`), `clinics` and `lawyers`
 * are left alone entirely — nothing in the schema references a referral, so
 * removing these rows cannot cascade and cannot be blocked.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

config({ path: '.env.local' })
config()

const apply = process.argv.includes('--apply')

/** [primary key, the name that row must still have] */
const REFERRALS: Array<[string, string]> = [
  ['2b42f413-1630-481e-b6bd-b546fe97041b', 'John Smith'],
  ['ref-1f8512db-e397-4890-948d-43df020df826', 'aaa'],
  ['ref-ff2cbd36-6620-4875-a874-51afc57fe19b', 'sss'],
  ['ref-e70b1287-a02b-46d9-b51b-e3a02b396548', 'test'],
  ['ref-e97a6363-2061-4ac7-8369-8ad450be15b9', 'test 2'],
  ['ref-6f5be113-5e04-4389-b13e-31bf66479256', 'testt'],
  ['ref-9bd83eb8-2463-42b0-b701-aa420f2a9f8d', 'TEST'],
  ['ref-b415316b-ab7c-4f5e-a7ff-737a1e358718', 'fefe'],
  ['ref-c993f10f-51eb-42d7-94c0-b8a30ad7c8e4', 'maria prueb'],
  ['ref-2c027d94-4368-48e6-9112-aa69bf244254', 'Probando RE'],
  ['ref-549067ef-2347-42cb-9852-798ac5860b2b', 'Probando'],
]

const REFERRER_REFERRALS: Array<[string, string]> = [
  ['rref-61c78298-0ee9-4e26-836b-a46ba1552ce8', 'Both name'],
  ['rref-91eed3de-a3da-40a2-bb3e-23d3f3db4966', 'Clinic'],
  ['rref-ba38a7c0-ca85-47a6-966c-2a92add1158f', 'Attorney'],
  ['rref-1f688a75-5f51-4525-a036-d0139d0b0e2c', 'mat'],
  ['rref-51ff2983-e084-4ea8-8409-7bd8bb815caf', 'Marxon'],
  ['rref-ef335b46-614e-45ee-9c0d-6a9a8925ee11', 'prueba'],
  ['95fb2577-1829-4682-9eff-28ab15f26f73', 'grgr'],
]

const TABLES = [
  { table: 'referrals', nameCol: 'patient_name', rows: REFERRALS },
  { table: 'referrer_referrals', nameCol: 'client_name', rows: REFERRER_REFERRALS },
] as const

const c = {
  green: (s: string) => '\x1b[32m' + s + '\x1b[0m',
  red: (s: string) => '\x1b[31m' + s + '\x1b[0m',
  yellow: (s: string) => '\x1b[33m' + s + '\x1b[0m',
  bold: (s: string) => '\x1b[1m' + s + '\x1b[0m',
  dim: (s: string) => '\x1b[2m' + s + '\x1b[0m',
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(c.red('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'))
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

/** How many rows the table will still hold once the listed ids are gone. */
async function remaining(table: string, listed: number): Promise<number> {
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
  return Math.max(0, (count ?? 0) - listed)
}

async function main() {
  const expected = REFERRALS.length + REFERRER_REFERRALS.length
  console.log(c.bold('\nPurge of hand-made test referrals'))
  console.log(
    c.dim(apply ? 'Mode: APPLY (deleting rows)\n' : 'Mode: DRY RUN — pass --apply to actually delete\n')
  )

  const backup: Record<string, unknown[]> = {}
  let found = 0

  // Pass 1 — read everything and verify every id/name pair BEFORE deleting
  // anything, so a mismatch in the second table cannot leave the first one
  // half-purged.
  for (const { table, nameCol, rows } of TABLES) {
    const ids = rows.map(([id]) => id)
    const { data, error } = await supabase.from(table).select('*').in('id', ids)
    if (error) {
      console.error(c.red('x reading ' + table + ': ' + error.message))
      process.exit(1)
    }
    backup[table] = data ?? []

    console.log(c.bold(table + ' — ' + (data?.length ?? 0) + ' of ' + ids.length + ' still present'))
    const byId = new Map((data ?? []).map((r) => [r.id as string, r]))
    for (const [id, name] of rows) {
      const row = byId.get(id)
      if (!row) {
        console.log(c.dim('  . ' + id + '  already gone'))
        continue
      }
      const actual = row[nameCol] as string
      if (actual !== name) {
        console.error(
          c.red('\nx Aborting: ' + table + '/' + id + ' is now "' + actual + '", expected "' + name + '".')
        )
        console.error(c.red('  The row changed since this list was written. Nothing deleted.'))
        process.exit(1)
      }
      console.log('  - ' + id + '  ' + c.yellow(actual))
      found++
    }
    console.log()
  }

  if (found === 0) {
    console.log(c.green('Already clean — none of the listed rows exist.'))
    return
  }

  const keepR = await remaining('referrals', REFERRALS.length)
  const keepRR = await remaining('referrer_referrals', REFERRER_REFERRALS.length)
  console.log(c.dim('Will keep ' + keepR + ' row(s) in referrals and ' + keepRR + ' in referrer_referrals.\n'))

  if (!apply) {
    console.log(c.yellow('DRY RUN — no changes written. ' + found + ' of ' + expected + ' row(s) would be deleted.'))
    console.log(c.dim('Re-run with --apply to delete the rows above.'))
    return
  }

  // The rows are gone for good after this, so keep a copy on disk first.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.resolve('scripts/.purge-backup-' + stamp + '.json')
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(c.green('v backup written to ' + backupPath))

  console.log(c.bold('\nApplying...\n'))
  let deleted = 0
  for (const { table, rows } of TABLES) {
    const ids = rows.map(([id]) => id)
    const { error, count } = await supabase.from(table).delete({ count: 'exact' }).in('id', ids)
    if (error) {
      console.error(c.red('x deleting from ' + table + ': ' + error.message))
      console.error(c.red('  Backup is at ' + backupPath))
      process.exit(1)
    }
    console.log(c.green('v ' + table + ': deleted ' + (count ?? 0) + ' row(s)'))
    deleted += count ?? 0
  }

  // activity_logs.target_id has no FK, so audit rows for a deleted case would
  // otherwise dangle forever pointing at an id that no longer resolves.
  const allIds = TABLES.flatMap(({ rows }) => rows.map(([id]) => id))
  const { error: logErr, count: logCount } = await supabase
    .from('activity_logs')
    .delete({ count: 'exact' })
    .in('target_id', allIds)
  if (logErr) {
    console.warn(c.yellow('! activity_logs: ' + logErr.message + ' (referrals deleted, audit rows left behind)'))
  } else {
    console.log(c.green('v activity_logs: deleted ' + (logCount ?? 0) + ' orphaned row(s)'))
  }

  console.log(c.bold('\nDone — ' + deleted + ' referral row(s) deleted.'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
