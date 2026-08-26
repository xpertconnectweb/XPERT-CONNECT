/**
 * Where the self-hosted geocoder actually is, right now, in this database.
 *
 * The engine has five moving parts and four of them live outside the
 * repository: two tables, two sets of indexes, a function, and an environment
 * variable. Nothing in the code says which of them exist, so a failure at any
 * step reads as a mystery -- "relation geo_street does not exist" is clear, but
 * "the search returns nothing" is not, and both have the same cause.
 *
 *   npx tsx scripts/geo/status.ts
 *
 * Reports each part and names the next step. Read-only: it creates nothing,
 * writes nothing, and is safe against production.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

/**
 * What "no such table" looks like coming back from PostgREST.
 *
 * `PGRST205` is what it actually answers — "Could not find the table
 * 'public.geo_street' in the schema cache". `42P01` is Postgres' own code and
 * arrives only when the failure happens inside a function body. Both mean the
 * migration has not been applied.
 */
const MISSING_TABLE = ['PGRST205', '42P01']
/** And for "no such function", which is what an unapplied search migration looks like. */
const MISSING_FUNCTION = 'PGRST202'

type Step = { label: string; state: 'done' | 'missing' | 'partial'; detail: string }

const steps: Step[] = []
const add = (label: string, state: Step['state'], detail: string) => steps.push({ label, state, detail })

/**
 * Rows in a table, or null when the table does not exist.
 *
 * `limit(0)` and NOT `head: true`, which is the whole point of this function.
 * A head request has no response body, so when PostgREST answers 404 there is
 * no JSON for supabase-js to read the error out of — it returns
 * `{ error: null, count: null }`, indistinguishable from an empty table. This
 * reported "both tables exist, empty" for two tables that had never been
 * created, and sent the user to load data into nothing.
 *
 * With `limit(0)` the body is `[]`, the error parses, and the count still comes
 * from the content-range header. Same one request, and it can tell the
 * difference.
 */
async function countRows(table: string): Promise<number | null> {
  // `*` rather than a named column: geo_street_points is keyed on street_id and
  // has no `id`, and limit(0) fetches no rows either way.
  const { count, error } = await supabase.from(table).select('*', { count: 'exact' }).limit(0)

  if (error) {
    if (MISSING_TABLE.indexOf(error.code ?? '') !== -1) return null
    throw new Error(`${table}: ${error.message} (${error.code ?? 'no code'})`)
  }

  // A successful response with no count would mean PostgREST answered without
  // the header it was asked for. Treat it as unknown rather than as zero.
  if (count === null || count === undefined) {
    throw new Error(`${table}: responded without a count — cannot tell whether it is empty or absent`)
  }
  return count
}

async function main() {
  console.log('')

  // ── The tables ────────────────────────────────────────────────────────────
  //
  // Both, unconditionally. An earlier version only looked at the second one
  // once the first was full, which is precisely backwards: the moment you need
  // to know whether a table exists is when nothing has been loaded yet.
  const streets = await countRows('geo_street')
  const blobs = await countRows('geo_street_points')

  const missing = [
    streets === null ? 'geo_street' : null,
    blobs === null ? 'geo_street_points' : null,
  ].filter(Boolean)

  if (missing.length > 0) {
    const verb = missing.length > 1 ? 'do not exist' : 'does not exist'
    add('migration part 1', 'missing', `${missing.join(' and ')} ${verb}`)
  } else if (streets === 0) {
    add('migration part 1', 'done', 'both tables exist, empty')
  } else {
    add('migration part 1', 'done', `${streets!.toLocaleString('en-US')} streets`)
  }

  // ── The load ──────────────────────────────────────────────────────────────
  if (streets === null || blobs === null) {
    add('index loaded', 'missing', 'nothing to load into yet')
  } else if (streets === 0) {
    add('index loaded', 'missing', 'npx tsx scripts/geo/load-index.ts --apply --truncate')
  } else if (streets < 500_000) {
    // The same bar /api/health uses. A full build is 567,767; anything well
    // under that is an interrupted load, not a smaller dataset.
    add('index loaded', 'partial', `only ${streets.toLocaleString('en-US')} of ~567,767 — the load stopped early`)
  } else if (blobs < streets) {
    add('index loaded', 'partial', `${streets.toLocaleString('en-US')} streets but only ${blobs.toLocaleString('en-US')} blobs`)
  } else {
    add('index loaded', 'done', `${blobs.toLocaleString('en-US')} coordinate blobs`)
  }

  // ── The search function ───────────────────────────────────────────────────
  //
  // Called rather than looked up in the catalogue: PostgREST cannot read
  // pg_proc, and calling it proves the thing that matters anyway -- that the
  // service role can execute it and that its signature is what the adapter
  // sends.
  const probe = await supabase.rpc('geo_street_search', {
    q: '62nd st cir e',
    q_state: 'FL',
    q_zip: '34208',
    q_city: null,
    q_limit: 3,
  })

  if (probe.error) {
    const missing = probe.error.code === MISSING_FUNCTION || probe.error.message.includes('does not exist')
    add(
      'search function',
      'missing',
      missing ? 'geo_street_search does not exist' : probe.error.message
    )
  } else {
    const rows = (probe.data ?? []) as Array<{ name_display: string; city: string; score: number }>
    add(
      'search function',
      rows.length > 0 ? 'done' : 'partial',
      rows.length > 0
        ? `works — "${rows[0].name_display}, ${rows[0].city}" at ${Number(rows[0].score).toFixed(2)}`
        : 'exists but found nothing for the reported address — is the index loaded?'
    )
  }

  // ── The switch ────────────────────────────────────────────────────────────
  //
  // Local only. Vercel holds its own copy, so this says what YOUR shell would
  // do and not what production does.
  const provider = process.env.GEOCODER_PROVIDER?.trim().toLowerCase() ?? '(unset)'
  add(
    'GEOCODER_PROVIDER',
    provider === 'selfhosted' ? 'done' : 'missing',
    provider === 'selfhosted' ? 'selfhosted (locally)' : `${provider} — set it in Vercel to switch production`
  )

  const mark = { done: '✓', partial: '~', missing: '·' }
  for (const step of steps) {
    console.log(`  ${mark[step.state]} ${step.label.padEnd(20)} ${step.detail}`)
  }

  const order = ['migration part 1', 'search function', 'index loaded', 'GEOCODER_PROVIDER']
  const next = order.map((label) => steps.find((s) => s.label === label)).find((s) => s && s.state !== 'done')
  console.log('')
  if (!next) {
    console.log('  Everything is in place. docs/MOTOR-DIRECCIONES-PUESTA-EN-MARCHA.md has the manual checks.\n')
    return
  }

  const guidance: Record<string, string> = {
    'migration part 1':
      'Run PART 1 of scripts/migrations/2026-09-geo-index.sql in the Supabase SQL Editor.\n' +
      '  It creates pg_trgm, both tables and the unique key. PART 2 comes AFTER the load.',
    'search function':
      'Run scripts/migrations/2026-09-geo-search.sql in the SQL Editor.\n' +
      '  Do this BEFORE the load. It needs only the tables, and Postgres validates the\n' +
      '  body of a `language sql` function as it creates it — so a pg_trgm that did not\n' +
      '  install fails here in two seconds instead of after forty minutes of loading.',
    'index loaded':
      'npx tsx scripts/geo/load-index.ts --apply --truncate\n' +
      '  Twenty to forty minutes, resumable with --from=<the last count printed>.\n' +
      '  Then PART 2 of scripts/migrations/2026-09-geo-index.sql for the indexes.',
    'GEOCODER_PROVIDER': 'Set GEOCODER_PROVIDER=selfhosted in Vercel and redeploy.',
  }

  console.log(`  Next: ${guidance[next.label] ?? next.detail}\n`)
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
