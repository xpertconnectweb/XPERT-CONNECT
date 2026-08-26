/**
 * Measures a geocoding provider against county ground truth.
 *
 * This is the instrument the whole self-hosted project is judged by, and it is
 * written before the engine so that "better" has a definition before anyone is
 * invested in a particular answer.
 *
 *   npx tsx scripts/geo/benchmark.ts --provider=geoapify     # the baseline
 *   npx tsx scripts/geo/benchmark.ts --provider=nominatim    # what shipped before
 *   npx tsx scripts/geo/benchmark.ts --provider=selfhosted   # Phase 4 onward
 *   npx tsx scripts/geo/benchmark.ts --provider=geoapify --save
 *
 * `--save` writes the run to docs/geo-baseline.json, which is committed. A
 * later phase claiming to have beaten the baseline has to beat a number that is
 * in the repository, not one somebody remembers.
 *
 * Four metrics, and the order is deliberate:
 *
 *   hit rate      did it return anything at all
 *   within 50 m   is the point on the right building — the one that decides
 *                 whether "nearest clinic" is the nearest clinic
 *   median error  the typical miss, in metres
 *   exact rate    how often the provider itself claims rooftop or parcel
 *
 * "Within 50 m" is the metric that matters most and the one providers never
 * publish. A geocoder can hit 100% and still be useless if every answer is the
 * centre of a postcode.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { config } from 'dotenv'
import { getProviderById } from '../../src/lib/geocoding'
import { isExactPrecision } from '../../src/lib/geocoding/precision'
import { haversineDistance } from '../../src/lib/map/geo'
import type { GeocodeProviderId, GeocodeResult, GeocodeSuggestion } from '../../src/types/geocode'
import type { TruthCase } from './fetch-truth'

config({ path: '.env.local' })
config()

const CORPUS = 'data/geo/truth-corpus.json'
const BASELINE = 'docs/geo-baseline.json'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const PROVIDER = (arg('provider') ?? 'geoapify') as GeocodeProviderId
const LIMIT = Number(arg('limit')) || 0
const SAVE = process.argv.includes('--save')

/** Metres per mile, because `haversineDistance` returns miles. */
const METRES_PER_MILE = 1609.344

interface Outcome {
  query: string
  source: string
  found: boolean
  /** Metres from the county register's coordinate. Null when nothing came back. */
  error: number | null
  precision: string
  ms: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index]
}

async function measure(provider: ReturnType<typeof getProviderById>, testCase: TruthCase): Promise<Outcome> {
  const started = Date.now()

  const suggestions = await provider.autocomplete(testCase.query, { limit: 1 })
  if (!suggestions.ok) {
    return { query: testCase.query, source: testCase.source, found: false, error: null, precision: suggestions.kind, ms: Date.now() - started }
  }

  let best: GeocodeSuggestion | GeocodeResult | null = suggestions.value[0] ?? null

  // Google and Mapbox withhold geometry from autocomplete — their billing model
  // is N cheap suggestions plus one chargeable resolve. Measuring only the
  // suggestion would score them as having found nothing.
  if (best?.needsResolve) {
    const details = await provider.details(best.id, { limit: 1 })
    best = details.ok ? details.value : null
  }

  const ms = Date.now() - started

  if (!best || best.lat === null || best.lng === null) {
    return { query: testCase.query, source: testCase.source, found: false, error: null, precision: '—', ms }
  }

  const miles = haversineDistance(testCase.lat, testCase.lng, best.lat, best.lng)
  return {
    query: testCase.query,
    source: testCase.source,
    found: true,
    error: miles * METRES_PER_MILE,
    precision: best.precision,
    ms,
  }
}

function report(outcomes: readonly Outcome[]) {
  const total = outcomes.length
  const found = outcomes.filter((o) => o.found)
  const errors = found.map((o) => o.error as number).sort((a, b) => a - b)
  const latencies = outcomes.map((o) => o.ms).sort((a, b) => a - b)

  const within = (metres: number) => found.filter((o) => (o.error as number) <= metres).length
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`

  const summary = {
    provider: PROVIDER,
    cases: total,
    hitRate: found.length / total,
    within50m: within(50) / total,
    within200m: within(200) / total,
    medianErrorM: percentile(errors, 50),
    p95ErrorM: percentile(errors, 95),
    exactRate: found.filter((o) => isExactPrecision(o.precision as never)).length / total,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
  }

  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${PROVIDER}   ${total} cases\n`)
  console.log(`  hit rate .............. ${pct(found.length)}`)
  console.log(`  within 50 m ........... ${pct(within(50))}   ← the one that matters`)
  console.log(`  within 200 m .......... ${pct(within(200))}`)
  console.log(`  claims rooftop/parcel . ${pct(found.filter((o) => isExactPrecision(o.precision as never)).length)}`)
  console.log(`  median error .......... ${summary.medianErrorM.toFixed(1)} m`)
  console.log(`  p95 error ............. ${summary.p95ErrorM.toFixed(1)} m`)
  console.log(`  latency p50 / p95 ..... ${summary.p50Ms} / ${summary.p95Ms} ms`)

  // Per county, because a headline average hides the rural counties where the
  // registers are thin — and those are exactly where the product will be blamed.
  console.log(`\n  by source:`)
  const bySource = new Map<string, Outcome[]>()
  for (const o of outcomes) {
    const list = bySource.get(o.source) ?? []
    list.push(o)
    bySource.set(o.source, list)
  }
  for (const [source, list] of Array.from(bySource.entries()).sort()) {
    const hit = list.filter((o) => o.found)
    const close = hit.filter((o) => (o.error as number) <= 50).length
    console.log(
      `    ${source.padEnd(22)} hit ${String(hit.length).padStart(3)}/${String(list.length).padEnd(3)}  within 50 m ${String(close).padStart(3)}`
    )
  }

  const misses = outcomes.filter((o) => !o.found)
  if (misses.length > 0) {
    console.log(`\n  not found (${misses.length}):`)
    for (const m of misses.slice(0, 15)) console.log(`    ${m.precision.padEnd(12)} ${m.query}`)
    if (misses.length > 15) console.log(`    … and ${misses.length - 15} more`)
  }

  // A found-but-far result is worse than a miss: nothing marks it as wrong, and
  // every distance measured from it is quietly off.
  const wild = found.filter((o) => (o.error as number) > 1000).sort((a, b) => (b.error as number) - (a.error as number))
  if (wild.length > 0) {
    console.log(`\n  found but over 1 km out (${wild.length}) — worse than a miss, nothing flags these:`)
    for (const w of wild.slice(0, 10)) {
      console.log(`    ${((w.error as number) / 1000).toFixed(1).padStart(6)} km  ${w.precision.padEnd(12)} ${w.query}`)
    }
  }

  return summary
}

async function main() {
  const raw = await readFile(CORPUS, 'utf8').catch(() => null)
  if (!raw) {
    console.error(`No corpus at ${CORPUS}. Run: npx tsx scripts/geo/fetch-truth.ts`)
    process.exit(1)
  }

  const { cases } = JSON.parse(raw) as { cases: TruthCase[] }
  const subset = LIMIT ? cases.slice(0, LIMIT) : cases

  const provider = getProviderById(PROVIDER)
  if (!provider.configured()) {
    console.error(`Provider "${PROVIDER}" is not configured — its API key is missing.`)
    process.exit(1)
  }

  // Nominatim's usage policy is one request per second and it is not optional.
  const pacing = PROVIDER === 'nominatim' ? 1100 : 120
  console.log(`Benchmarking ${PROVIDER} over ${subset.length} cases (${pacing} ms pacing)…`)

  const outcomes: Outcome[] = []
  // A plain index loop: tsconfig declares no `target`, so it defaults low and
  // Array.prototype.entries() would need --downlevelIteration.
  for (let i = 0; i < subset.length; i++) {
    const testCase = subset[i]
    await sleep(pacing)
    outcomes.push(await measure(provider, testCase))
    if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${subset.length}\r`)
  }

  const summary = report(outcomes)

  if (SAVE) {
    const existing = JSON.parse(await readFile(BASELINE, 'utf8').catch(() => '{}')) as Record<string, unknown>
    // Timestamped by the caller rather than by the run, so a re-run with the
    // same corpus produces a diff that is only about the numbers.
    existing[PROVIDER] = { ...summary, corpusSize: cases.length }
    await writeFile(BASELINE, JSON.stringify(existing, null, 2))
    console.log(`\n  saved → ${BASELINE}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
