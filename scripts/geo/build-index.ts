/**
 * Turns 500 MB of county address registers into the two tables the geocoder
 * queries.
 *
 * Phase 1 of the self-hosted engine, and its gate: this script has to answer
 * whether the index fits inside Supabase's 500 MB free plan before anything is
 * loaded into it. If the projection comes out above 350 MB the plan switches
 * `geo_street_points` to Supabase Storage, and it is much cheaper to learn that
 * here than halfway through Phase 2.
 *
 *   npx tsx scripts/geo/build-index.ts            # build shards, merge, report
 *   npx tsx scripts/geo/build-index.ts --report   # report from existing shards
 *   npx tsx scripts/geo/build-index.ts --rebuild  # ignore shards, redo the lot
 *
 * The shape of the problem, measured on Manatee County: 301,660 address points
 * across 5,642 distinct streets, fifty-three points per street. That ratio is
 * the whole design. Autocomplete -- interactive, and therefore the expensive
 * part -- searches the small table. Resolving a house number reads exactly one
 * blob from the large one, by primary key, and only once the user has chosen.
 *
 * Two passes, because neither fits in memory on its own:
 *
 *   1. Per source, group into streets and write a shard. Bounded by the largest
 *      county, and resumable -- an interrupted run keeps its finished shards.
 *   2. Merge the shards. Sources overlap (`us/fl/city_of_miami` sits inside
 *      `us/fl/miami-dade`, `us/mn/statewide` inside every Minnesota county), so
 *      the same street arrives more than once and has to become one row.
 */
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { streamAddresses, type OaAddress } from './lib/openaddresses'
import {
  encodePoints,
  decodePoints,
  PayloadSpanError,
  type StreetPoint,
} from '../../src/lib/geocoding/payload-codec'
import { fold } from '../../src/lib/search/text'
import { canonicalizeStreet } from '../../src/lib/geocoding/address-parser'
import type { ManifestEntry } from './fetch-openaddresses'

const MANIFEST = 'data/geo/manifest.json'
const SHARD_DIR = 'data/geo/index'
const MERGED = 'data/geo/index/merged.ndjson'

const REPORT_ONLY = process.argv.includes('--report')
const REBUILD = process.argv.includes('--rebuild')

/**
 * One row of `geo_street`, with short keys.
 *
 * Four hundred thousand lines of JSON pay for every character of every key
 * four hundred thousand times; the long names would add about 16 MB to an
 * intermediate file for no benefit. The mapping is here and nowhere else.
 */
export interface IndexedStreet {
  /** name_norm -- folded, the form the trigram index is built over. */
  n: string
  /** name_display -- as the county publishes it, title-cased for the user. */
  d: string
  /** city */
  c: string
  /** state, two letters */
  s: string
  /** zip, five digits, or empty */
  z: string
  /** num_min / num_max */
  n0: number
  n1: number
  /** bounding box */
  y0: number
  y1: number
  x0: number
  x1: number
  /** point_count */
  k: number
  /** payload, base64 */
  p: string
}

/**
 * A merged street, with the primary key it will carry in Postgres.
 *
 * The id is assigned here rather than by a database sequence, and that is what
 * lets the two tables load independently: `geo_street_points` needs the id of
 * the row it belongs to, and reading it back from an insert would mean a round
 * trip per batch and an ordering assumption to match ids to inputs. Assigned up
 * front, both tables are a straight idempotent upsert that can be restarted at
 * any point.
 *
 * The ids are stable only within a build. Phase 6's incremental refresh has to
 * read the existing ids by key and reuse them rather than renumbering, or every
 * quarterly refresh would rewrite all 589,000 rows.
 */
export interface LoadableStreet extends IndexedStreet {
  i: number
}

interface Group {
  nameNorm: string
  display: string
  city: string
  state: string
  zip: string
  numbers: number[]
  lats: number[]
  lngs: number[]
}

interface Counters {
  read: number
  badNumber: number
  /** Passed every filter and went into a street group. */
  kept: number
}

/**
 * The leading integer of a house number.
 *
 * County registers are not tidy here: "123A" for one half of a duplex, "1/2"
 * for a converted flat, "123-125" for a double lot, and the occasional "LOT 4"
 * that never got a real address. Taking the leading integer keeps the first
 * three, which are real addresses a person types, and drops the fourth. The
 * suffixed variants collapse onto one point in the codec, which is correct:
 * 123A and 123B are metres apart.
 */
function parseHouseNumber(raw: string): number | null {
  const match = /^(\d{1,7})/.exec(raw)
  if (!match) return null
  const value = Number(match[1])
  return value > 0 ? value : null
}

/**
 * Splits a group whose points are spread too wide for a u16 offset.
 *
 * Only reachable when a source publishes neither city nor postcode, which
 * lumps every "County Road 12" in a county into one key. A quarter-degree grid
 * -- about 27 km -- puts each cluster comfortably inside the offset range, and
 * the resulting rows are more useful anyway: a tighter bounding box is a better
 * search candidate than one spanning half a county.
 */
function splitByGrid(group: Group): Group[] {
  const cells = new Map<string, Group>()
  for (let i = 0; i < group.numbers.length; i++) {
    const key = `${Math.floor(group.lats[i] * 4)}:${Math.floor(group.lngs[i] * 4)}`
    let cell = cells.get(key)
    if (!cell) {
      cell = { ...group, numbers: [], lats: [], lngs: [] }
      cells.set(key, cell)
    }
    cell.numbers.push(group.numbers[i])
    cell.lats.push(group.lats[i])
    cell.lngs.push(group.lngs[i])
  }
  return Array.from(cells.values())
}

function toRow(group: Group): IndexedStreet | null {
  const points: StreetPoint[] = new Array(group.numbers.length)
  for (let i = 0; i < group.numbers.length; i++) {
    points[i] = { number: group.numbers[i], lat: group.lats[i], lng: group.lngs[i] }
  }

  let payload: Buffer
  try {
    payload = encodePoints(points)
  } catch (err) {
    if (err instanceof PayloadSpanError) return null
    throw err
  }

  let n0 = Infinity
  let n1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let x0 = Infinity
  let x1 = -Infinity
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.number < n0) n0 = p.number
    if (p.number > n1) n1 = p.number
    if (p.lat < y0) y0 = p.lat
    if (p.lat > y1) y1 = p.lat
    if (p.lng < x0) x0 = p.lng
    if (p.lng > x1) x1 = p.lng
  }

  return {
    n: group.nameNorm,
    d: group.display,
    c: group.city,
    s: group.state,
    z: group.zip,
    n0,
    n1,
    y0: round6(y0),
    y1: round6(y1),
    x0: round6(x0),
    x1: round6(x1),
    k: points.length,
    p: payload.toString('base64'),
  }
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

/**
 * Tokens that must survive title-casing in upper case.
 *
 * "SE 17TH ST" title-cases to "Se 17th St", which is wrong in a way people
 * notice immediately: SE is a compass direction, not a word. The same applies to
 * the highway prefixes that fill rural registers -- SR 62, CR 675, US 41. All of
 * them are one or two letters, and no ordinary street-name word collides with
 * the list, so a length check plus a lookup is enough.
 */
const KEEP_UPPER: ReadonlySet<string> = new Set([
  'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'SR', 'CR', 'US', 'FM', 'I',
])

/**
 * Title case, matching what the truth corpus does, so a name reads the way a
 * person writes it rather than the way a register stores it. Ordinals keep
 * their lower-case suffix: "40Th Ave" is wrong, "40th Ave" is what anyone types.
 */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/(\d)(St|Nd|Rd|Th)\b/g, (_, digit: string, suffix: string) => digit + suffix.toLowerCase())
    .replace(/\b[A-Za-z]{1,2}\b/g, (token) =>
      KEEP_UPPER.has(token.toUpperCase()) ? token.toUpperCase() : token
    )
}

async function buildShard(entry: ManifestEntry, counters: Counters): Promise<number> {
  const groups = new Map<string, Group>()
  // `us/fl/manatee` holds Florida addresses by construction, so the slug is
  // the authority on the state and the `region` field is noise. Two Minnesota
  // sources put the COUNTY there -- 19,155 points came out filed under the
  // state "GOODHUE" and 6,802 under "SIBLEY" -- and a scattering of rows carry
  // a neighbouring state, a bare digit, or a stray backtick.
  const state = entry.state.toUpperCase()

  for await (const address of streamAddresses(entry.path)) {
    counters.read++

    // Unit rows are kept. Discarding them looked right, since every flat in a
    // block shares one coordinate -- but a condo tower whose records ALL carry
    // a unit then had no bare row, and the building disappeared from the index
    // altogether. The codec collapses repeated house numbers anyway, so the
    // eighty flats still cost one point.
    if (/\b(unassigned|unknown|no\s+street)\b/i.test(address.street)) continue

    const number = parseHouseNumber(address.number)
    if (number === null) {
      counters.badNumber++
      continue
    }

    // Canonicalised with the SAME function the query side uses. The 144
    // registers do not agree with each other -- Manatee writes
    // "62ND STREET CIR E", Brevard writes "CAPE AV" where the standard is
    // AVE, Lake writes "NORTH PALMETTO CIR" where others write N, and
    // Santa Rosa puts the flat number inside the street name as
    // "BERRYHILL RD APT 3J". Collapsing all of it here, rather than trying
    // to anticipate each variation at query time, is what makes one lookup
    // find a street however its county chose to spell it.
    const canonical = canonicalizeStreet(address.street)
    const nameNorm = fold(canonical.norm)
    if (!nameNorm) continue

    const city = address.city
    const zip = /^\d{5}/.test(address.postcode) ? address.postcode.slice(0, 5) : ''

    // NUL separates the parts: it cannot occur in any of them, so no city
    // name containing the separator can forge a different key. Written as an
    // escape -- a raw NUL in source makes git and grep treat the file as binary.
    const key = `${state}\0${city}\0${zip}\0${nameNorm}`

    let group = groups.get(key)
    if (!group) {
      group = {
        nameNorm,
        display: titleCase(canonical.display),
        city: titleCase(city),
        state,
        zip,
        numbers: [],
        lats: [],
        lngs: [],
      }
      groups.set(key, group)
    }
    counters.kept++
    group.numbers.push(number)
    group.lats.push(address.lat)
    group.lngs.push(address.lng)
  }

  const lines: string[] = []
  const entries = Array.from(groups.entries())
  for (let i = 0; i < entries.length; i++) {
    const group = entries[i][1]
    const row = toRow(group)
    if (row) {
      lines.push(JSON.stringify(row))
      continue
    }
    for (const cell of splitByGrid(group)) {
      const split = toRow(cell)
      if (split) lines.push(JSON.stringify(split))
    }
  }

  await writeFile(shardPath(entry), lines.join('\n') + '\n')
  return lines.length
}

const shardPath = (entry: ManifestEntry) => `${SHARD_DIR}/${entry.source.replace(/\//g, '-')}.ndjson`

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Merges the shards into one row per street.
 *
 * The overlap is real and large: Minnesota publishes a statewide file as well
 * as county files, and several Florida cities publish separately from their
 * county. Left alone, "Main St, Miami, 33130" would exist twice with different
 * coordinates and the query engine would return whichever it happened to rank
 * first.
 *
 * Merging decodes both blobs and re-encodes the union. The codec drops repeated
 * house numbers keeping the first, so a street present in two sources ends up
 * with the union of their numbers and the first source's coordinate wherever
 * they disagree -- which is why counties are read before the statewide file.
 */
async function merge(): Promise<{ rows: IndexedStreet[]; collisions: number; duplicates: number }> {
  const files = (await readdir(SHARD_DIR)).filter((f) => f.endsWith('.ndjson') && f !== 'merged.ndjson').sort()

  const byKey = new Map<string, IndexedStreet>()
  let collisions = 0
  let duplicates = 0

  for (const file of files) {
    const lines = createInterface({
      input: createReadStream(`${SHARD_DIR}/${file}`),
      crlfDelay: Infinity,
    })

    for await (const line of lines) {
      if (!line) continue
      const row = JSON.parse(line) as IndexedStreet
      const key = `${row.s}\0${fold(row.c)}\0${row.z}\0${row.n}`

      const seen = byKey.get(key)
      if (!seen) {
        byKey.set(key, row)
        continue
      }

      collisions++
      const points = decodePoints(Buffer.from(seen.p, 'base64'))
      const incoming = decodePoints(Buffer.from(row.p, 'base64'))
      duplicates += points.length + incoming.length

      const merged = points.concat(incoming)
      let payload: Buffer
      try {
        payload = encodePoints(merged)
      } catch (err) {
        // A merged group too wide for the offset range: keep the first, which
        // is the county file rather than the statewide one.
        if (err instanceof PayloadSpanError) continue
        throw err
      }

      duplicates -= merged.length
      seen.p = payload.toString('base64')
      seen.k = merged.length
      seen.n0 = Math.min(seen.n0, row.n0)
      seen.n1 = Math.max(seen.n1, row.n1)
      seen.y0 = Math.min(seen.y0, row.y0)
      seen.y1 = Math.max(seen.y1, row.y1)
      seen.x0 = Math.min(seen.x0, row.x0)
      seen.x1 = Math.max(seen.x1, row.x1)
    }
  }

  return { rows: Array.from(byKey.values()), collisions, duplicates }
}

/**
 * Projects the on-disk size in Postgres.
 *
 * Heap is measured rather than guessed: every string length is known here. The
 * index figures are the estimates, and each carries its assumption so a wrong
 * one is arguable rather than invisible. Phase 2 replaces the whole thing with
 * `pg_total_relation_size`, which is the real answer.
 */
function project(rows: readonly IndexedStreet[]) {
  /** Heap tuple header plus the item pointer that references it. */
  const TUPLE_OVERHEAD = 24 + 4
  /** Short varlena strings carry a one-byte length prefix. */
  const text = (v: string) => Buffer.byteLength(v) + 1

  let streetHeap = 0
  let pointsHeap = 0
  let payloadBytes = 0
  let nameBytes = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const payload = Math.ceil((row.p.length * 3) / 4)
    payloadBytes += payload
    nameBytes += Buffer.byteLength(row.n)

    streetHeap +=
      TUPLE_OVERHEAD +
      4 + // id, int4
      text(row.n) +
      text(row.d) +
      text(row.c) +
      text(row.s) +
      text(row.z) +
      4 * 2 + // num_min, num_max
      8 * 4 + // the bounding box, float8
      4 // point_count

    // Blobs over about 2 kB are pushed out to TOAST and compressed there;
    // smaller ones stay inline uncompressed. Only the largest streets qualify,
    // and the estimate deliberately does not claim the compression -- counting
    // it would make the number look better than it can be relied on to be.
    pointsHeap += TUPLE_OVERHEAD + 4 + payload + 4
  }

  /**
   * A trigram GIN index stores each distinct trigram once with a compressed
   * posting list of row pointers. Street names are short, so the trigram
   * vocabulary saturates quickly and almost all of the size is posting lists:
   * roughly three trigrams' worth of pointer per name character. 1.6x the
   * indexed text is the conservative end of what this shape of data produces.
   */
  const gin = nameBytes * 1.6
  /** btree leaf entry: the key, a 6-byte pointer, and a 4-byte line pointer. */
  const btree = (bytes: number) => rows.length * (bytes + 10) * 1.4

  const zipIndex = btree(4 + 6)
  const cityIndex = btree(4 + 16)
  const pkIndex = btree(4)

  // Pages are not filled to the brim and rows are not packed edge to edge.
  const PAGE_SLACK = 1.12

  const parts = [
    ['geo_street heap', streetHeap * PAGE_SLACK],
    ['  GIN trigram on name_norm', gin],
    ['  btree (state, zip)', zipIndex],
    ['  btree (state, city)', cityIndex],
    ['  btree primary key', pkIndex],
    ['geo_street_points heap', pointsHeap * PAGE_SLACK],
    ['  btree primary key', pkIndex],
  ] as const

  const total = parts.reduce((sum, [, bytes]) => sum + bytes, 0)
  return { parts, total, payloadBytes }
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`
const num = (v: number) => v.toLocaleString('en-US')

async function main() {
  await mkdir(SHARD_DIR, { recursive: true })

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as { sources: ManifestEntry[] }
  const counters: Counters = { read: 0, badNumber: 0, kept: 0 }

  // Counties before the statewide file, and county files before city files, so
  // that where two sources disagree the more local one is kept. `sort()` puts
  // `city_of_*` first, which is the wrong way round, hence the explicit order.
  const ordered = manifest.sources.slice().sort((a, b) => {
    const rank = (s: string) => (/\/statewide$/.test(s) ? 2 : /\/city_of_/.test(s) ? 1 : 0)
    return rank(a.source) - rank(b.source) || a.source.localeCompare(b.source)
  })

  if (!REPORT_ONLY) {
    console.log(`Indexing ${ordered.length} sources…\n`)
    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i]
      const shard = shardPath(entry)

      if (!REBUILD && (await exists(shard))) {
        process.stdout.write(`  ${String(i + 1).padStart(3)}/${ordered.length}  · ${entry.source}`.padEnd(52) + '\r')
        continue
      }

      const streets = await buildShard(entry, counters)
      process.stdout.write(
        `  ${String(i + 1).padStart(3)}/${ordered.length}  ${entry.source.padEnd(26)} ${num(streets).padStart(8)} streets`.padEnd(60) + '\r'
      )
    }
    console.log(' '.repeat(64) + '\r')
  }

  console.log('Merging shards…')
  const { rows, collisions, duplicates } = await merge()

  // The id goes first in each line, so the loader can read what a row is
  // without parsing the base64 payload hanging off the end of it.
  await writeFile(MERGED, rows.map((r, i) => JSON.stringify({ i, ...r })).join('\n') + '\n')

  const points = rows.reduce((sum, r) => sum + r.k, 0)
  const withoutCity = rows.filter((r) => !r.c).length
  const withoutZip = rows.filter((r) => !r.z).length
  const { parts, total, payloadBytes } = project(rows)

  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  INDEX\n`)
  if (counters.read > 0) {
    console.log(`  address points read ..... ${num(counters.read).padStart(12)}`)
    console.log(
      `    no usable number ...... ${num(counters.badNumber).padStart(12)}   ${((counters.badNumber / counters.read) * 100).toFixed(1)}%`
    )
    const collapsed = counters.kept - points
    console.log(
      `    same house number ..... ${num(collapsed).padStart(12)}   ${((collapsed / counters.read) * 100).toFixed(1)}%  units and duplicate parcels`
    )
  }
  console.log(`  distinct streets ........ ${num(rows.length).padStart(12)}`)
  console.log(`  address points stored ... ${num(points).padStart(12)}`)
  console.log(`  points per street ....... ${(points / rows.length).toFixed(1).padStart(12)}`)
  console.log(`  bytes per point ......... ${(payloadBytes / points).toFixed(2).padStart(12)}`)
  console.log(`  overlapping streets ..... ${num(collisions).padStart(12)}   merged from more than one source`)
  console.log(`  duplicate points dropped  ${num(duplicates).padStart(12)}`)

  console.log(`\n  PROJECTED POSTGRES SIZE\n`)
  for (const [label, bytes] of parts) {
    console.log(`  ${label.padEnd(28)} ${mb(bytes).padStart(10)}`)
  }
  console.log(`  ${'─'.repeat(40)}`)
  console.log(`  ${'total'.padEnd(28)} ${mb(total).padStart(10)}   of 500 MB`)

  const gate = total / 1048576
  console.log(
    `\n  ${gate <= 350 ? '✓ PASS' : '✗ FAIL'}  gate is 350 MB — ` +
      (gate <= 350
        ? `${(350 - gate).toFixed(0)} MB of headroom, stay in Postgres`
        : `move geo_street_points to Supabase Storage before Phase 2`)
  )

  console.log(`\n  SEARCH QUALITY RISK\n`)
  console.log(
    `  streets with no city .... ${num(withoutCity).padStart(12)}   ${((withoutCity / rows.length) * 100).toFixed(1)}%`
  )
  console.log(
    `  streets with no ZIP ..... ${num(withoutZip).padStart(12)}   ${((withoutZip / rows.length) * 100).toFixed(1)}%`
  )

  // A county that published a handful of points is a hole in the map, and the
  // headline totals hide it completely.
  const byState = new Map<string, number>()
  for (const row of rows) byState.set(row.s, (byState.get(row.s) ?? 0) + row.k)
  console.log('')
  for (const [state, count] of Array.from(byState.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state} ${num(count).padStart(14)} points`)
  }

  console.log(`\n${num(rows.length)} streets → ${MERGED}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
