/**
 * The independent gate: can the engine find the addresses this platform holds?
 *
 * The Phase 4 benchmark has a circularity that has to be said out loud. Its
 * corpus is sampled from the county registers, and the index is built from the
 * county registers, so "100% within 50 m" means the engine faithfully returns
 * what the county said. It does not mean the county was right, and it cannot.
 *
 * This measures the other thing, and it is the one the client will feel: 876
 * clinic and law-firm addresses, typed by people over years of using the
 * product, already resolved and verified through a different provider. Nothing
 * about them came from OpenAddresses.
 *
 *   npx tsx scripts/geo/gate-coverage.ts
 *   npx tsx scripts/geo/gate-coverage.ts --show=40
 *
 * Three questions, in order of how much they matter:
 *
 *   coverage   how many of these real addresses the engine finds at all
 *   agreement  how far its answer sits from the coordinate already stored
 *   honesty    what precision it claims, and whether that claim holds up
 *
 * The third is the point of the whole project. Geoapify called 100% of its
 * answers `rooftop` while 29% were more than 50 m out, which meant the UI's
 * "approximate -- drag the pin to correct it" prompt never once fired when it
 * was needed. A `rooftop` here must mean the register holds that house number.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { haversineDistance } from '../../src/lib/map/geo'
import { isExactPrecision } from '../../src/lib/geocoding/precision'
import { LocalIndex } from './lib/local-index'
import { localProvider } from './lib/local-provider'

config({ path: '.env.local' })
config()

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const SHOW = Number(arg('show')) || 15
const METRES_PER_MILE = 1609.344

/** The bar: this must at least match what is deployed today. */
const COVERAGE_GATE = 95

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

interface Record_ {
  kind: 'clinic' | 'lawyer'
  id: string
  name: string
  address: string
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
}

async function fetchRecords(): Promise<Record_[]> {
  const out: Record_[] = []

  for (const table of ['clinics', 'lawyers'] as const) {
    const { data, error } = await supabase
      .from(table)
      // The structured columns the 2026-08 migration added, and which
      // scripts/backfill-structured-addresses.ts filled. `street` holds the
      // house number and street on their own; `address` is the original
      // free text, still the fallback where the backfill held a row back.
      .select('id, name, address, street, city, state, zip_code, lat, lng')
      .limit(2000)

    if (error) throw new Error(`${table}: ${error.message}`)

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const address = typeof row.address === 'string' ? row.address : ''
      if (!address.trim()) continue

      out.push({
        kind: table === 'clinics' ? 'clinic' : 'lawyer',
        id: String(row.id),
        name: String(row.name ?? ''),
        address,
        street: (row.street as string) ?? null,
        city: (row.city as string) ?? null,
        state: (row.state as string) ?? null,
        zip: (row.zip_code as string) ?? null,
        lat: typeof row.lat === 'number' ? row.lat : null,
        lng: typeof row.lng === 'number' ? row.lng : null,
      })
    }
  }

  return out
}

/**
 * The address as the engine will receive it.
 *
 * Built from the structured columns when they are filled, because that is what
 * the referral form and the admin write path send. Falling back to the raw
 * string is the pre-backfill case, and there are still rows in it.
 */
function queryFor(record: Record_): string {
  const head = record.street ?? record.address
  const tail = [record.city, [record.state, record.zip].filter(Boolean).join(' ')].filter(Boolean)
  return tail.length > 0 ? [head, ...tail].join(', ') : head
}

async function main() {
  process.stdout.write('Loading the index into memory… ')
  const index = await LocalIndex.load()
  console.log(`${index.size.toLocaleString('en-US')} streets`)

  const records = await fetchRecords()
  console.log(`Testing ${records.length.toLocaleString('en-US')} real addresses from the platform\n`)

  const provider = localProvider(index)

  let found = 0
  let comparable = 0
  let within50 = 0
  let within200 = 0
  const distances: number[] = []
  const byPrecision = new Map<string, number>()
  /** Claimed exact, and more than 50 m from the stored coordinate. */
  const overclaimed: Array<{ name: string; query: string; metres: number }> = []
  /** Every comparable row, so the tail can be inspected rather than summarised. */
  const compared: Array<{ query: string; matched: string; precision: string; metres: number }> = []
  const missed: Record_[] = []

  const started = Date.now()

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    const result = await provider.autocomplete(queryFor(record), { limit: 1, state: record.state })

    if (!result.ok || result.value.length === 0) {
      missed.push(record)
      continue
    }

    found++
    const best = result.value[0]
    byPrecision.set(best.precision, (byPrecision.get(best.precision) ?? 0) + 1)

    // Only rows that already carry a real coordinate can be compared. The ones
    // at (0, 0) or still unresolved are exactly the rows this engine is meant
    // to fix, so counting them as disagreement would be backwards.
    if (record.lat === null || record.lng === null || (record.lat === 0 && record.lng === 0)) continue
    if (best.lat === null || best.lng === null) continue

    comparable++
    const metres = haversineDistance(record.lat, record.lng, best.lat, best.lng) * METRES_PER_MILE
    distances.push(metres)
    compared.push({ query: queryFor(record), matched: best.fullLabel, precision: best.precision, metres })
    if (metres <= 50) within50++
    if (metres <= 200) within200++

    if (isExactPrecision(best.precision) && metres > 50) {
      overclaimed.push({ name: record.name, query: queryFor(record), metres })
    }
  }

  const elapsed = Date.now() - started
  distances.sort((a, b) => a - b)
  const percentile = (p: number) => distances[Math.min(distances.length - 1, Math.floor((p / 100) * distances.length))]
  const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(1)}%`

  console.log(`${'─'.repeat(64)}`)
  console.log(`  COVERAGE\n`)
  console.log(`  addresses tested ........ ${String(records.length).padStart(8)}`)
  console.log(`  found ................... ${String(found).padStart(8)}   ${pct(found, records.length)}`)
  console.log(`  not found ............... ${String(missed.length).padStart(8)}   ${pct(missed.length, records.length)}`)
  console.log(`  mean latency ............ ${(elapsed / records.length).toFixed(1).padStart(8)} ms`)

  console.log(`\n  AGREEMENT with the coordinate already stored\n`)
  console.log(`  comparable .............. ${String(comparable).padStart(8)}   (rows that carry a real coordinate)`)
  if (comparable > 0) {
    console.log(`  within 50 m ............. ${String(within50).padStart(8)}   ${pct(within50, comparable)}`)
    console.log(`  within 200 m ............ ${String(within200).padStart(8)}   ${pct(within200, comparable)}`)
    console.log(`  median distance ......... ${percentile(50).toFixed(1).padStart(8)} m`)
    console.log(`  p95 distance ............ ${percentile(95).toFixed(1).padStart(8)} m`)
  }

  /**
   * The distribution, not the average.
   *
   * "median 52 m" and "p95 10 km" describe two completely different populations
   * sharing one table, and the decision about whether to rewrite these
   * coordinates depends entirely on which is which. A move of tens of metres is
   * two defensible opinions about one building — Google and Manatee County
   * disagree by 33 m about the same office and both are right. A move of
   * kilometres is an error, and nothing else.
   */
  const BANDS: Array<[string, number]> = [
    ['under 10 m', 10],
    ['10 - 50 m', 50],
    ['50 - 200 m', 200],
    ['200 m - 1 km', 1000],
    ['1 - 10 km', 10000],
    ['over 10 km', Infinity],
  ]

  console.log(`\n  HOW FAR THE ENGINE WOULD MOVE EACH PIN\n`)
  let floor = -1
  for (const [label, ceiling] of BANDS) {
    const n = distances.filter((d) => d > floor && d <= ceiling).length
    const bar = '#'.repeat(Math.round((n / Math.max(comparable, 1)) * 44))
    console.log(`  ${label.padEnd(14)} ${String(n).padStart(5)}  ${pct(n, comparable).padStart(7)}  ${bar}`)
    floor = ceiling
  }

  console.log(`\n  PRECISION CLAIMED\n`)
  for (const [precision, count] of Array.from(byPrecision.entries()).sort((a, b) => b[1] - a[1])) {
    const exact = isExactPrecision(precision as never)
    console.log(
      `  ${precision.padEnd(14)} ${String(count).padStart(8)}   ${pct(count, found).padStart(6)}   ` +
        `${exact ? 'exact — no pin prompt' : 'approximate — UI asks the user to drag the pin'}`
    )
  }

  // The tail is where the useful information is. A summary that says 'p95 is
  // 85 km' tells you something is badly wrong and nothing about what.
  const worst = compared.slice().sort((a, b) => b.metres - a.metres).slice(0, SHOW)
  if (worst.length > 0 && worst[0].metres > 200) {
    console.log(`
  FURTHEST FROM THE STORED COORDINATE
`)
    for (const w of worst) {
      const label = w.metres > 1000 ? `${(w.metres / 1000).toFixed(1)} km` : `${w.metres.toFixed(0)} m`
      console.log(`    ${label.padStart(9)}  ${w.precision.padEnd(13)} ${w.query}`)
      console.log(`${' '.repeat(26)}-> ${w.matched}`)
    }
  }

  if (overclaimed.length > 0) {
    console.log(`\n  claimed exact but over 50 m from the stored coordinate (${overclaimed.length}):`)
    for (const o of overclaimed.slice(0, SHOW)) {
      console.log(`    ${o.metres.toFixed(0).padStart(7)} m  ${o.query}`)
    }
    if (overclaimed.length > SHOW) console.log(`    … ${overclaimed.length - SHOW} more`)
    console.log(
      `\n  Worth reading before drawing a conclusion: the stored coordinate came\n` +
        `  from a provider that was itself 29% wrong beyond 50 m, so a disagreement\n` +
        `  here is not automatically this engine's error. Each one needs the county\n` +
        `  register looked at.`
    )
  }

  if (missed.length > 0) {
    console.log(`\n  not found (${missed.length}):`)
    for (const m of missed.slice(0, SHOW)) {
      console.log(`    ${m.kind.padEnd(7)} ${queryFor(m)}`)
    }
    if (missed.length > SHOW) console.log(`    … ${missed.length - SHOW} more (--show=N)`)
  }

  const coverage = (found / records.length) * 100
  console.log(
    `\n  ${coverage >= COVERAGE_GATE ? '✓ PASS' : '✗ FAIL'}  gate is ${COVERAGE_GATE}% coverage; got ${coverage.toFixed(1)}%\n`
  )
  if (coverage < COVERAGE_GATE) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
