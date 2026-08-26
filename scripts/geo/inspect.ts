/**
 * Looks an address up in the built index, before any of it reaches a database.
 *
 * A scan of a 600 MB file, which is exactly the wrong way to serve a query and
 * exactly the right way to answer "is it in there at all". When a search comes
 * back empty in production the first question is whether the data is missing or
 * the query engine is, and this separates the two without a Postgres round trip.
 *
 *   npx tsx scripts/geo/inspect.ts "862 62nd St Cir E, Bradenton, FL 34208"
 *   npx tsx scripts/geo/inspect.ts "62nd st cir e" --all
 *
 * Parses the argument the same way the engine will, then matches the folded
 * street name exactly. Fuzzy matching is Phase 4's job; this reports what is
 * stored, not what is close.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { fold } from '../../src/lib/search/text'
import { parseUsAddress } from '../../src/lib/geocoding/address-parser'
import { findNumber, countPoints } from '../../src/lib/geocoding/payload-codec'
import type { IndexedStreet } from './build-index'

const MERGED = 'data/geo/index/merged.ndjson'
const SHOW_ALL = process.argv.includes('--all')
const LIMIT = SHOW_ALL ? Infinity : 12

async function main() {
  const query = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ')
  if (!query) {
    console.error('Usage: npx tsx scripts/geo/inspect.ts "862 62nd St Cir E, Bradenton, FL 34208"')
    process.exit(1)
  }

  const parsed = parseUsAddress(query)
  console.log(`\n  query    ${query}`)
  console.log(`  number   ${parsed.number ?? '—'}${parsed.numberSuffix ? ` (${parsed.numberSuffix})` : ''}`)
  console.log(`  street   ${parsed.street || '—'}`)
  if (parsed.variants.length > 1) console.log(`  also     ${parsed.variants.slice(1).join(' | ')}`)
  if (parsed.unit) console.log(`  unit     ${parsed.unit.designator} ${parsed.unit.value}`)
  console.log(`  city     ${parsed.city ?? '—'}`)
  console.log(`  state    ${parsed.state ?? '—'}`)
  console.log(`  zip      ${parsed.zip ?? '—'}\n`)

  const wanted = parsed.variants.map(fold).filter(Boolean)
  if (wanted.length === 0) {
    console.error('  Nothing to look up — no street name came out of the parse.')
    process.exit(1)
  }

  const lines = createInterface({ input: createReadStream(MERGED), crlfDelay: Infinity })

  let scanned = 0
  let found = 0
  for await (const line of lines) {
    if (!line) continue
    scanned++
    const row = JSON.parse(line) as IndexedStreet
    if (wanted.indexOf(row.n) === -1) continue
    if (parsed.state && row.s !== parsed.state) continue

    found++
    if (found > LIMIT) continue

    const payload = Buffer.from(row.p, 'base64')
    const where = [row.c, row.s, row.z].filter(Boolean).join(' ')
    console.log(
      `  ${row.d.padEnd(22)} ${where.padEnd(26)} ${String(countPoints(payload)).padStart(6)} pts   #${row.n0}–${row.n1}`
    )

    if (parsed.number !== null) {
      const hit = findNumber(payload, parsed.number)
      const marker = hit.kind === 'exact' ? '✓' : hit.kind === 'interpolated' ? '≈' : '·'
      console.log(`      ${marker} ${parsed.number}  ${hit.lat.toFixed(6)}, ${hit.lng.toFixed(6)}   ${hit.kind}`)
    }
  }

  if (found > LIMIT) console.log(`  … and ${found - LIMIT} more (--all to list them)`)
  console.log(`\n  ${found} matching street${found === 1 ? '' : 's'} in ${scanned.toLocaleString('en-US')} rows`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
