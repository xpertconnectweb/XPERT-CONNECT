/**
 * How wrong is an interpolated address, and when does it stop deserving the
 * word?
 *
 * The engine labels a result `interpolated` when the county register does not
 * hold the house number but holds neighbours that bracket it, and places the
 * point proportionally between them. Today every such result gets the same
 * warning as one where only the street is known -- "Approximate, drag the pin"
 * -- and those two are not the same thing. A number sitting between two doors
 * twenty metres apart is metres out. One sitting between two ends of a block is
 * a block out. Flattening them means the warning fires on a fifth of searches,
 * and a warning that fires that often is one people learn to dismiss.
 *
 *   npx tsx scripts/geo/gate-interpolation.ts
 *   npx tsx scripts/geo/gate-interpolation.ts --sources=us/fl/miami-dade
 *
 * -- The measurement ---------------------------------------------------------
 *
 * Leave-one-out, against the registers themselves. Take a door the county
 * recorded, RE-ENCODE the street without it, ask the shipped `findNumber` to
 * place it, and measure the answer against where the county put it.
 *
 * Re-encoding rather than recomputing matters. The alternative -- reproducing
 * the bracketing rule here in a few lines -- measures a second implementation
 * that can quietly drift from the one that ships, which is the exact failure
 * `street-index.ts` warns about where it justifies the in-memory store. This
 * way the number below is the number production produces.
 *
 * Stratified by county, deliberately: a threshold tuned on Miami-Dade would be
 * a lie in Aitkin. Dense urban blocks and rural county roads have to stay
 * visible apart or the median hides the case that matters.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { decodePoints, encodePoints, findNumber } from '../../src/lib/geocoding/payload-codec'
import { haversineDistance } from '../../src/lib/map/geo'

const SHARD_DIR = 'data/geo/index'
const METRES_PER_MILE = 1609.344

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

/**
 * The same spread `fetch-truth.ts` argues for, and for the same reason.
 *
 * Manatee is the county the reported address lives in. Miami-Dade, Orange and
 * Hennepin are the dense urban cases. Wakulla and Aitkin are rural, where the
 * registers are thinnest and interpolation carries the most weight.
 */
const DEFAULT_SOURCES = [
  'us/fl/manatee',
  'us/fl/miami-dade',
  'us/fl/orange',
  'us/fl/wakulla',
  'us/mn/hennepin',
  'us/mn/aitkin',
]

/**
 * Leave-one-out re-encodes the street once per trial, so the work is quadratic
 * in the length of the street. These two caps keep a six-county run to minutes
 * without biasing the result -- both take an even spread rather than a prefix.
 *
 * Whatever they drop gets printed. A gate that silently measured a tenth of the
 * data would read exactly like one that measured all of it.
 */
const STREET_STRIDE = 3
const TRIALS_PER_STREET = 12

interface Sample {
  /** Metres between the two bracketing points the engine actually chose. */
  spanM: number
  /** Metres between the engine's answer and where the county put the house. */
  errorM: number
  /** Whether the bracket shared the target's parity. */
  sameSide: boolean
  source: string
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

interface ShardTally {
  streets: number
  streetsSeen: number
  trials: number
  trialsPossible: number
}

async function sampleShard(source: string, out: Sample[]): Promise<ShardTally> {
  const path = `${SHARD_DIR}/${source.replace(/\//g, '-')}.ndjson`
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  const tally: ShardTally = { streets: 0, streetsSeen: 0, trials: 0, trialsPossible: 0 }

  let index = -1
  for await (const line of lines) {
    if (!line) continue

    // The payload only. `JSON.parse` pulls a base64 blob through the parser for
    // every field that is not wanted, which is what made an earlier version of
    // this too slow to finish at all.
    const match = /"p":"([^"]*)"/.exec(line)
    if (!match) continue

    index++
    const points = decodePoints(Buffer.from(match[1], 'base64'))
    // Fewer than three and there is nothing to leave out.
    if (points.length < 3) continue
    tally.streetsSeen++
    tally.trialsPossible += points.length - 2
    if (index % STREET_STRIDE !== 0) continue
    tally.streets++

    // An even stride through the street rather than its first dozen doors: the
    // start of a street is not representative of the middle of it.
    const stride = Math.max(1, Math.floor((points.length - 2) / TRIALS_PER_STREET))
    for (let i = 1; i < points.length - 1; i += stride) {
      const target = points[i]
      const without = points.slice(0, i).concat(points.slice(i + 1))
      const answer = findNumber(encodePoints(without), target.number)
      if (answer.kind !== 'interpolated' || answer.spanM === null) continue

      tally.trials++
      out.push({
        spanM: answer.spanM,
        errorM:
          haversineDistance(target.lat, target.lng, answer.lat, answer.lng) * METRES_PER_MILE,
        sameSide: answer.sameSide === true,
        source,
      })
    }
  }

  return tally
}

/**
 * The bar this is looking for.
 *
 * 50 m is not arbitrary: it is the distance the whole project is measured
 * against in `docs/geo-baseline.json`, and the one this codebase already agreed
 * means "the right building".
 */
const RIGHT_BUILDING_M = 50
/** The share of interpolations that must land inside it for a band to pass. */
const CONFIDENCE = 95

const BANDS = [10, 25, 50, 100, 200, 400, 800, Infinity]

/** The widest span at which `CONFIDENCE`% of answers still land within the bar. */
function report(samples: readonly Sample[], label: string): number {
  if (samples.length === 0) {
    console.log(`\n  ${label} -- no samples\n`)
    return 0
  }

  console.log(`\n  ${label} -- ${samples.length.toLocaleString('en-US')} interpolations\n`)
  console.log('  bracket width          n        median      p90       p95     within 50 m')

  let floor = -1
  let widest = 0
  // Once a band fails, a wider one passing is noise rather than a licence: the
  // threshold has to be the last point where the curve was still good.
  let broken = false

  for (const ceiling of BANDS) {
    const band = samples.filter((s) => s.spanM > floor && s.spanM <= ceiling)
    if (band.length === 0) {
      floor = ceiling
      continue
    }

    const errors = band.map((s) => s.errorM).sort((a, b) => a - b)
    const pct = (errors.filter((e) => e <= RIGHT_BUILDING_M).length / band.length) * 100
    if (pct >= CONFIDENCE && !broken && ceiling !== Infinity) widest = ceiling
    else if (pct < CONFIDENCE) broken = true

    const name = ceiling === Infinity ? `over ${floor} m` : `${Math.max(floor, 0)} - ${ceiling} m`
    console.log(
      `  ${name.padEnd(18)} ${String(band.length).padStart(9)}   ` +
        `${percentile(errors, 50).toFixed(1).padStart(8)} m ` +
        `${percentile(errors, 90).toFixed(1).padStart(8)} m ` +
        `${percentile(errors, 95).toFixed(1).padStart(8)} m ` +
        `${pct.toFixed(1).padStart(9)}%`
    )
    floor = ceiling
  }

  return widest
}

async function main() {
  const sources = arg('sources')?.split(',').map((s) => s.trim()) ?? DEFAULT_SOURCES
  const samples: Sample[] = []
  const totals: ShardTally = { streets: 0, streetsSeen: 0, trials: 0, trialsPossible: 0 }

  console.log('')
  for (const source of sources) {
    let tally: ShardTally
    try {
      tally = await sampleShard(source, samples)
    } catch (err) {
      console.log(`  x ${source.padEnd(20)} ${err instanceof Error ? err.message : err}`)
      continue
    }
    for (const k of Object.keys(totals) as (keyof ShardTally)[]) totals[k] += tally[k]
    console.log(
      `  ok ${source.padEnd(20)} ${String(tally.streets).padStart(7)} streets  ` +
        `${String(tally.trials).padStart(7)} trials`
    )
  }

  console.log(
    `\n  Sampled ${totals.streets.toLocaleString('en-US')} of ` +
      `${totals.streetsSeen.toLocaleString('en-US')} eligible streets and ` +
      `${totals.trials.toLocaleString('en-US')} of ` +
      `${totals.trialsPossible.toLocaleString('en-US')} possible trials.`
  )

  // Parity first, because it turned out to dominate the width entirely and the
  // ordering of this report should say so.
  const sided = samples.filter((s) => s.sameSide)
  const mixed = samples.filter((s) => !s.sameSide)
  console.log(`\n${'='.repeat(72)}`)
  console.log('  SAME SIDE OF THE STREET -- the bracket shares the number\'s parity')
  const sidedSafe = report(sided, 'all counties')
  console.log(`\n${'='.repeat(72)}`)
  console.log('  ACROSS THE ROAD -- no same-parity pair existed, so a mixed one was used')
  report(mixed, 'all counties')

  console.log(`\n${'='.repeat(72)}`)
  console.log('  PER COUNTY, same side only -- the average hides the sparse ones')

  const bySource = new Map<string, Sample[]>()
  for (const s of sided) {
    const list = bySource.get(s.source) ?? []
    list.push(s)
    bySource.set(s.source, list)
  }

  let strictest = Infinity
  for (const [source, list] of Array.from(bySource.entries()).sort()) {
    const safe = report(list, source)
    if (safe > 0 && safe < strictest) strictest = safe
  }

  console.log(`\n${'-'.repeat(72)}`)
  console.log(
    `  Share of interpolations that found a same-side bracket: ` +
      `${((sided.length / Math.max(1, samples.length)) * 100).toFixed(1)}%\n`
  )
  console.log(
    `  Widest bracket where ${CONFIDENCE}% of same-side answers land within ` +
      `${RIGHT_BUILDING_M} m:\n`
  )
  console.log(`    across all counties ....... ${sidedSafe} m`)
  console.log(
    `    in the strictest county ... ${strictest === Infinity ? 'none passed' : `${strictest} m`}`
  )
  console.log(
    `\n  The second number is the threshold. A bar set on the average would\n` +
      `  hold in Miami and mislead in Aitkin.\n`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
