/**
 * Phase 3's gate: does the parser produce the string the index actually stores?
 *
 * The plan's wording was "98% correct decomposition", which sounds measurable
 * and is not -- correct according to whom? So the gate is end-to-end instead,
 * and it is falsifiable: take real streets out of the built index, write each
 * one the way a person would type it, parse that, and check whether any of the
 * variants the parser emits equals the stored name exactly.
 *
 *   npx tsx scripts/geo/gate-parser.ts
 *   npx tsx scripts/geo/gate-parser.ts --sample=5000 --show=40
 *
 * Four ways of typing the same address are measured separately, because they
 * fail for different reasons and an average across them would hide which:
 *
 *   as stored    "862 62nd Street Cir E"     copied off a document
 *   abbreviated  "862 62nd St Cir E"         the USPS form, and what the client
 *                                            reported as missing
 *   spelled out  "862 62nd Street Circle East"
 *   no postcode  the same, with the ZIP dropped
 *
 * Exact string equality on purpose. Fuzzy matching is the query engine's job in
 * Phase 4, and letting it in here would measure the two together and hide which
 * one is carrying the result.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { fold } from '../../src/lib/search/text'
import { parseUsAddress } from '../../src/lib/geocoding/address-parser'
import { canonicalSuffix, expandSuffix, expandDirectional, canonicalDirectional } from '../../src/lib/geocoding/usps'

const MERGED = 'data/geo/index/merged.ndjson'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const SAMPLE = Number(arg('sample')) || 2000
const SHOW = Number(arg('show')) || 12
/** The plan's bar. Anything under this and Phase 4 is built on sand. */
const GATE = 98

interface Row {
  name: string
  display: string
  city: string
  state: string
  zip: string
  number: number
}

/** Rewrites every token that has an abbreviation, giving the USPS-style form. */
function abbreviateAll(display: string): string {
  return display
    .split(' ')
    .map((token, i, all) => {
      // The first token is the name proper often enough that abbreviating it is
      // the "Green Bay Rd" -> "Grn Bay Rd" mistake. Only rewrite from the
      // second token on, which is where suffixes and directions live.
      if (i === 0) return token
      const asDirection = i === all.length - 1 ? canonicalDirectional(token) : null
      return asDirection ?? canonicalSuffix(token) ?? token
    })
    .join(' ')
}

/** The opposite: everything written out in full, the way people speak it. */
function expandAll(display: string): string {
  return display
    .split(' ')
    .map((token, i, all) => {
      if (i === 0) return token
      const asDirection = i === all.length - 1 ? expandDirectional(token) : null
      const expanded = asDirection ?? expandSuffix(token) ?? token
      // Title case, since the input being simulated is typed by a person.
      return expanded.charAt(0) + expanded.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Reservoir sampling with a fixed seed, so two runs grade the same exam and a
 * change in the score is a change in the parser.
 */
function reservoir<T>(size: number) {
  const kept: T[] = []
  let seen = 0
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
  }
}

async function main() {
  const pool = reservoir<Row>(SAMPLE)

  const lines = createInterface({ input: createReadStream(MERGED), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    // Field-by-field rather than JSON.parse: the base64 payload is most of each
    // line and none of it is wanted here.
    const name = /"n":"([^"]*)"/.exec(line)
    const display = /"d":"([^"]*)"/.exec(line)
    const city = /"c":"([^"]*)"/.exec(line)
    const state = /"s":"([^"]*)"/.exec(line)
    const zip = /"z":"([^"]*)"/.exec(line)
    const number = /"n0":(\d+)/.exec(line)
    if (!name || !display || !state || !number) continue

    pool.offer({
      name: name[1],
      display: display[1],
      city: city ? city[1] : '',
      state: state[1],
      zip: zip ? zip[1] : '',
      number: Number(number[1]),
    })
  }

  const styles = [
    { label: 'as stored', street: (r: Row) => r.display, zip: true },
    { label: 'abbreviated', street: (r: Row) => abbreviateAll(r.display), zip: true },
    { label: 'spelled out', street: (r: Row) => expandAll(r.display), zip: true },
    { label: 'no postcode', street: (r: Row) => r.display, zip: false },
  ]

  const rows = pool.items
  console.log(`\n  ${rows.length.toLocaleString('en-US')} streets sampled from the index\n`)

  const failures: Array<{ style: string; typed: string; want: string; got: string[] }> = []
  let worst = 100

  for (const style of styles) {
    let hit = 0
    let firstVariantHit = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const tail = [row.city, style.zip && row.zip ? `${row.state} ${row.zip}` : row.state]
      const typed = [`${row.number} ${style.street(row)}`, ...tail].filter(Boolean).join(', ')

      const parsed = parseUsAddress(typed)
      const folded = parsed.variants.map(fold)

      if (folded.indexOf(row.name) !== -1) {
        hit++
        if (folded[0] === row.name) firstVariantHit++
      } else if (failures.length < 400) {
        failures.push({ style: style.label, typed, want: row.name, got: folded })
      }
    }

    const pct = (hit / rows.length) * 100
    worst = Math.min(worst, pct)
    console.log(
      `  ${style.label.padEnd(14)} ${pct.toFixed(1).padStart(6)}%   ` +
        `first variant alone ${((firstVariantHit / rows.length) * 100).toFixed(1)}%`
    )
  }

  if (failures.length > 0) {
    console.log(`\n  misses (${failures.length}${failures.length === 400 ? '+' : ''}):\n`)
    for (const f of failures.slice(0, SHOW)) {
      console.log(`    ${f.style.padEnd(12)} ${f.typed}`)
      console.log(`      want  ${f.want}`)
      console.log(`      got   ${f.got.join('  |  ') || '(nothing)'}`)
    }
    if (failures.length > SHOW) console.log(`    … ${failures.length - SHOW} more (--show=N)`)
  }

  console.log(
    `\n  ${worst >= GATE ? '✓ PASS' : '✗ FAIL'}  gate is ${GATE}% on every style; worst was ${worst.toFixed(1)}%\n`
  )
  if (worst < GATE) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
