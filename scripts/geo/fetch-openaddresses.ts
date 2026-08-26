/**
 * Downloads every OpenAddresses source for the states the platform serves.
 *
 * Phase 1 of the self-hosted geocoder. Florida publishes ~75 sources and
 * Minnesota ~70, one per county or city, and they have to be fetched
 * individually — the regional collections bundle Florida inside "US South",
 * 12.5 GB with sixteen other states.
 *
 *   npx tsx scripts/geo/fetch-openaddresses.ts               # fl,mn
 *   npx tsx scripts/geo/fetch-openaddresses.ts --states=fl
 *   npx tsx scripts/geo/fetch-openaddresses.ts --list        # catalogue only
 *
 * Resumable by design: a source already on disk at the size the API reports is
 * skipped, so an interrupted run continues rather than restarting. Half a
 * gigabyte over 145 servers, some of which are county IT departments, will be
 * interrupted.
 *
 * Writes data/geo/raw/*.geojson.gz and a manifest the indexer reads.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { listSources, resolveSource, downloadSource, type OaSource } from './lib/openaddresses'

const RAW_DIR = 'data/geo/raw'
const MANIFEST = 'data/geo/manifest.json'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const STATES = (arg('states') ?? 'fl,mn').split(',').map((s) => s.trim().toLowerCase())
const LIST_ONLY = process.argv.includes('--list')

/**
 * Four at a time.
 *
 * Not politeness theatre — several of these are county servers, and the
 * artefact host redirects to object storage that throttles a single client
 * hard. Four finishes the set in about the same wall-clock as eight and
 * without the retries.
 */
const CONCURRENCY = 4

export interface ManifestEntry {
  /** e.g. "us/fl/manatee" */
  source: string
  state: string
  path: string
  bytes: number
}

/** Runs `worker` over `items`, `limit` at a time, preserving input order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })

  console.log(`Cataloguing ${STATES.join(', ').toUpperCase()}…\n`)

  const slugs: Array<{ state: string; name: string }> = []
  for (const state of STATES) {
    const names = await listSources(state)
    for (const name of names) slugs.push({ state, name: `us/${state}/${name}` })
    console.log(`  ${state.toUpperCase()}  ${names.length} sources`)
  }

  // Resolving is cheap and tells us the total download before committing to it.
  const resolved = await mapLimit(slugs, CONCURRENCY, async ({ state, name }) => {
    const source = await resolveSource(name)
    return source ? { state, source } : null
  })

  const usable = resolved.filter(Boolean) as Array<{ state: string; source: OaSource }>
  const skipped = resolved.length - usable.length
  const totalBytes = usable.reduce((sum, r) => sum + r.source.size, 0)

  console.log(
    `\n  ${usable.length} with a published addresses layer` +
      (skipped > 0 ? `, ${skipped} without one (parcels or buildings only)` : '')
  )
  console.log(`  ${(totalBytes / 1048576).toFixed(0)} MB compressed\n`)

  if (LIST_ONLY) {
    for (const { source } of usable) {
      console.log(`  ${source.name.padEnd(24)} ${(source.size / 1048576).toFixed(1).padStart(7)} MB`)
    }
    return
  }

  let done = 0
  let fetched = 0
  let cached = 0
  const failures: Array<{ source: string; reason: string }> = []

  const entries = await mapLimit(usable, CONCURRENCY, async ({ state, source }) => {
    const path = `${RAW_DIR}/${source.name.replace(/\//g, '-')}.geojson.gz`
    try {
      const how = await downloadSource(source, path)
      if (how === 'cached') cached++
      else fetched++
      done++
      process.stdout.write(
        `  ${String(done).padStart(3)}/${usable.length}  ${how === 'cached' ? '·' : '↓'} ${source.name}`.padEnd(48) + '\r'
      )
      return { source: source.name, state, path, bytes: source.size } satisfies ManifestEntry
    } catch (err) {
      // One county's server timing out must not lose the other 144. The
      // manifest simply records what arrived, and a re-run picks up the rest.
      done++
      failures.push({ source: source.name, reason: err instanceof Error ? err.message : String(err) })
      return null
    }
  })

  const manifest = entries.filter(Boolean) as ManifestEntry[]
  await writeFile(MANIFEST, JSON.stringify({ states: STATES, sources: manifest }, null, 2))

  console.log(' '.repeat(60) + '\r')
  console.log(`  ${fetched} downloaded, ${cached} already on disk`)

  if (failures.length > 0) {
    console.log(`\n  ${failures.length} failed — re-run to retry just these:`)
    for (const f of failures) console.log(`    ${f.source.padEnd(24)} ${f.reason}`)
  }

  console.log(`\n${manifest.length} sources → ${MANIFEST}`)
  console.log('Next: npx tsx scripts/geo/build-index.ts --report')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
