/**
 * Builds the ground-truth corpus the benchmark measures against.
 *
 * Phase 0 of the self-hosted geocoder, and it comes first on purpose: without a
 * measurement taken BEFORE anything is built, "as good as Google Maps" is an
 * opinion rather than a claim anyone can check.
 *
 * The truth is county address registers, sampled through OpenAddresses. That
 * choice matters. The obvious alternative — take the coordinates a provider
 * returns and call them correct — measures a provider against itself and can
 * only ever conclude that it agrees with itself. County registers are
 * independent of every provider, including the one being replaced.
 *
 *   npx tsx scripts/geo/fetch-truth.ts                    # default sample
 *   npx tsx scripts/geo/fetch-truth.ts --per-source=40
 *   npx tsx scripts/geo/fetch-truth.ts --sources=us/fl/manatee,us/mn/hennepin
 *
 * Writes data/geo/truth-corpus.json (gitignored — it is regenerable data).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import {
  downloadSource,
  resolveSource,
  streamAddresses,
  toTypedQuery,
  type OaAddress,
} from './lib/openaddresses'

const RAW_DIR = 'data/geo/raw'
const OUT = 'data/geo/truth-corpus.json'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const PER_SOURCE = Number(arg('per-source')) || 25

/**
 * A spread rather than the biggest counties.
 *
 * Miami-Dade and Hennepin are the dense urban cases; Manatee is the one the
 * client's reported address lives in; Wakulla and Aitkin are rural, where
 * address registers are thinnest and interpolation has to carry the result.
 * A corpus of only large counties would report a coverage number this product
 * does not actually get.
 */
const DEFAULT_SOURCES = [
  'us/fl/manatee',
  'us/fl/miami-dade',
  'us/fl/orange',
  'us/fl/alachua',
  'us/fl/wakulla',
  'us/mn/hennepin',
  'us/mn/ramsey',
  'us/mn/aitkin',
]

export interface TruthCase {
  /** What a person would type. */
  query: string
  /** The county register's own coordinate. */
  lat: number
  lng: number
  /** Kept so a failure can be inspected without re-deriving it. */
  parts: Pick<OaAddress, 'number' | 'street' | 'city' | 'region' | 'postcode'>
  source: string
}

/**
 * Reservoir sampling: one pass, fixed memory, uniform over the whole file.
 *
 * Taking the first N would sample whatever the county happened to export first,
 * which in every file inspected is a single neighbourhood — the streets would
 * be near-identical and the benchmark would be measuring one postcode.
 */
function reservoir<T>(size: number) {
  const kept: T[] = []
  let seen = 0
  // Deterministic PRNG so two runs produce the same corpus and two benchmark
  // results are comparable. Math.random would make every run a different exam.
  let state = 0x9e3779b9

  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0xffffffff
  }

  return {
    offer(item: T) {
      seen += 1
      if (kept.length < size) {
        kept.push(item)
        return
      }
      const index = Math.floor(next() * seen)
      if (index < size) kept[index] = item
    },
    get items() {
      return kept
    },
    get seen() {
      return seen
    },
  }
}

async function main() {
  const sources = arg('sources')?.split(',').map((s) => s.trim()) ?? DEFAULT_SOURCES
  console.log(`Building truth corpus: ${PER_SOURCE} cases from each of ${sources.length} sources\n`)

  await mkdir(RAW_DIR, { recursive: true })
  const cases: TruthCase[] = []

  for (const name of sources) {
    const source = await resolveSource(name)
    if (!source) {
      console.log(`  ✗ ${name.padEnd(20)} no published addresses layer`)
      continue
    }

    const path = `${RAW_DIR}/${name.replace(/\//g, '-')}.geojson.gz`
    const how = await downloadSource(source, path)

    // `region` is empty in most sources — Miami-Dade publishes none at all, and
    // 125 of the first 201 cases came out as "5530 Alhambra Cir, Coral Gables,
    // 33146" with the state simply missing. Nobody types an address that way,
    // so leaving it blank makes the benchmark harder than reality and biases
    // every provider's score downward. The slug already carries the state.
    const stateFromSlug = name.split('/')[1]?.toUpperCase() ?? ''

    const pool = reservoir<OaAddress>(PER_SOURCE)
    for await (const address of streamAddresses(path)) {
      // Units are dropped: every flat in a block shares one coordinate, so
      // keeping them would weight the corpus toward apartment buildings and
      // measure the same point over and over.
      if (address.unit) continue
      // Counties use placeholder streets for parcels awaiting an address.
      // "30 Address Unassigned, Hopkins" is not a geocoding failure when it
      // misses; it is a row that should never have been asked about.
      if (/\b(unassigned|unknown|no\s+street)\b/i.test(address.street)) continue

      pool.offer(address.region ? address : { ...address, region: stateFromSlug })
    }

    for (const address of pool.items) {
      cases.push({
        query: toTypedQuery(address),
        lat: address.lat,
        lng: address.lng,
        parts: {
          number: address.number,
          street: address.street,
          city: address.city,
          region: address.region,
          postcode: address.postcode,
        },
        source: name,
      })
    }

    console.log(
      `  ✓ ${name.padEnd(20)} ${String(pool.seen).padStart(9)} points  →  ${pool.items.length} sampled  (${how}, ${(source.size / 1048576).toFixed(1)} MB)`
    )
  }

  /**
   * The case that started all of this, appended by hand.
   *
   * Coordinates from Manatee County's own service, not from a provider. It is
   * absent from OpenStreetMap entirely, which is why the reported search
   * returned nothing, and it is the one row whose result anybody will actually
   * check.
   */
  cases.push({
    query: '862 62nd St Cir E, Bradenton, FL 34208',
    lat: 27.491257,
    lng: -82.481824,
    parts: {
      number: '862',
      street: '62ND ST CIR E',
      city: 'BRADENTON',
      region: 'FL',
      postcode: '34208',
    },
    source: 'reported-by-client',
  })

  await writeFile(OUT, JSON.stringify({ builtFrom: sources, perSource: PER_SOURCE, cases }, null, 2))

  console.log(`\n${cases.length} cases → ${OUT}`)
  console.log('Next: npx tsx scripts/geo/benchmark.ts --provider=geoapify')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
