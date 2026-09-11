/**
 * Builds the Florida place gazetteer the public directory searches with.
 *
 *   npx tsx scripts/places/build-fl-gazetteer.ts           # write the file
 *   npx tsx scripts/places/build-fl-gazetteer.ts --verify  # check it against the live corpus
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The search knows a city only if some firm in the corpus is in it. That
 * is why "Anna Maria" and "Key West" return nothing with no explanation,
 * and why "Bradenton" has no idea it is in Manatee County even though
 * seventeen firms in the county say so. A directory that cannot say
 * "nothing here, but there are eleven firms eleven miles away" is
 * leaving the visitor to guess whether the gap is in Florida or in us.
 *
 * ── The source ──────────────────────────────────────────────────────────────
 *
 * `data/geo/index/us-fl-*.ndjson` — the OpenAddresses county extracts
 * already in this repo for the self-hosted geocoder. Each line is one
 * street segment: `c` city, `s` state, `z` ZIP, `y0/y1` and `x0/x1` the
 * segment's latitude and longitude span, `k` how many address points sit
 * on it.
 *
 * Weighting each segment by `k` produces a centroid that follows the
 * addresses rather than the shape of the boundary — which is the right
 * answer for "how far is Anna Maria from Bradenton", a question about
 * where people are, not where the middle of a polygon is.
 *
 * The input is gitignored and 392 MB; the OUTPUT is committed. Rerun
 * this only when the geo index is rebuilt.
 */
import { createReadStream, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { haversineDistance } from '../../src/lib/map/geo'

const INDEX_DIR = join(process.cwd(), 'data', 'geo', 'index')
const OUT_PATH = join(process.cwd(), 'src', 'lib', 'places', 'fl-places.json')

/** Below this many address points, a name is a typo or a ghost locality. */
const MIN_POINTS = 50

/** Florida, generously. Anything outside is not a Florida address. */
const FL = { south: 24.3, north: 31.1, west: -87.7, east: -79.9 }

const inFlorida = (lat: number, lng: number) =>
  lat >= FL.south && lat <= FL.north && lng >= FL.west && lng <= FL.east

/**
 * Some rows in the index have latitude and longitude the wrong way round.
 *
 * Not a suspicion — `us-fl-madison.ndjson` has 47 of 492 Madison rows
 * storing `y0: -83.43, x0: 30.48`, which is a longitude in the latitude
 * field. Averaged in, they dragged four towns into the Atlantic:
 * Branford, Madison, Lee and Steinhatchee all landed several hundred
 * miles offshore.
 *
 * Since the two ranges do not overlap anywhere in Florida — latitude is
 * 24..31, longitude is -88..-80 — a transposed pair is unambiguous and
 * can simply be put back. Anything still outside the state after that
 * is dropped rather than guessed at.
 *
 * This is a defect in the geo index itself, which the self-hosted
 * geocoder also reads. Worth fixing at the source; this guard stays
 * either way, because it costs nothing and the failure was silent.
 */
function orient(lat: number, lng: number): [number, number] | null {
  if (inFlorida(lat, lng)) return [lat, lng]
  if (inFlorida(lng, lat)) return [lng, lat]
  return null
}

const VERIFY = process.argv.includes('--verify')

/**
 * County file slugs that are not simply the lowercased name.
 *
 * Everything else is the name with spaces as underscores. The stored
 * spelling has to match `lawyers.county` exactly — `canonicalizeCounty`
 * only strips the "County" suffix, it does not repair "St Johns".
 */
const COUNTY_OVERRIDES: Readonly<Record<string, string>> = {
  'miami-dade': 'Miami-Dade',
  'st-johns': 'St. Johns',
  'st-lucie': 'St. Lucie',
  desoto: 'DeSoto',
}

function countyFromSlug(slug: string): string | null {
  // `city_of_*` files are municipal extracts with no county in the name.
  // Every city they cover also appears in its county's file, so they are
  // redundant here and ambiguous — skip them rather than guess.
  if (slug.startsWith('city_of_')) return null
  if (COUNTY_OVERRIDES[slug]) return COUNTY_OVERRIDES[slug]
  return slug
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Matches `fold` for these inputs: ASCII, lowercase, punctuation to spaces. */
function foldName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface Accumulator {
  name: string
  county: string
  points: number
  latSum: number
  lngSum: number
}

async function build(): Promise<Accumulator[]> {
  if (!existsSync(INDEX_DIR)) {
    console.error(`\n  ${INDEX_DIR} is missing.`)
    console.error('  It is gitignored — rebuild the geo index first.\n')
    process.exit(1)
  }

  const files = readdirSync(INDEX_DIR).filter(
    (f) => f.startsWith('us-fl-') && f.endsWith('.ndjson')
  )

  // Keyed by folded name AND county: Florida reuses place names across
  // counties (Greenville, Oakland), and collapsing them would put one
  // centroid halfway between two towns that are nowhere near each other.
  const places = new Map<string, Accumulator>()
  let repaired = 0
  let rejected = 0

  for (const file of files) {
    const slug = file.replace(/^us-fl-/, '').replace(/\.ndjson$/, '')
    const county = countyFromSlug(slug)
    if (!county) continue

    const stream = createInterface({
      input: createReadStream(join(INDEX_DIR, file)),
      crlfDelay: Infinity,
    })

    for await (const line of stream) {
      if (!line) continue
      let row: { c?: string; s?: string; y0?: number; y1?: number; x0?: number; x1?: number; k?: number }
      try {
        row = JSON.parse(line)
      } catch {
        continue
      }

      const city = typeof row.c === 'string' ? row.c.trim() : ''
      if (!city || row.s !== 'FL') continue
      const weight = typeof row.k === 'number' && row.k > 0 ? row.k : 1
      if (typeof row.y0 !== 'number' || typeof row.x0 !== 'number') continue

      // The segment's midpoint, so a long road does not pull the
      // centroid toward whichever end happened to be listed first.
      const rawLat = (row.y0 + (row.y1 ?? row.y0)) / 2
      const rawLng = (row.x0 + (row.x1 ?? row.x0)) / 2
      if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) continue

      const oriented = orient(rawLat, rawLng)
      if (!oriented) {
        rejected += 1
        continue
      }
      if (oriented[0] !== rawLat) repaired += 1
      const [lat, lng] = oriented

      const key = `${foldName(city)}|${county}`
      const acc = places.get(key)
      if (acc) {
        acc.points += weight
        acc.latSum += lat * weight
        acc.lngSum += lng * weight
      } else {
        places.set(key, {
          name: city,
          county,
          points: weight,
          latSum: lat * weight,
          lngSum: lng * weight,
        })
      }
    }

    process.stdout.write(`  ${county.padEnd(16)} ${places.size} places so far\n`)
  }

  console.log(
    `\n  ${repaired} rows had lat/lng transposed and were corrected; ${rejected} were outside Florida and dropped.`
  )

  return (
    Array.from(places.values())
      .filter((p) => p.points >= MIN_POINTS)
      /**
       * Name, then SIZE, then county.
       *
       * The size tie-break is not cosmetic. Florida has a Fort Myers in
       * Lee and a sliver of one in Charlotte, and a bare "Fort Myers"
       * means the first. Sorting by county alphabetically put Charlotte
       * ahead of Lee and anchored the query thirteen miles from the
       * city everyone means.
       */
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          b.points - a.points ||
          a.county.localeCompare(b.county)
      )
  )
}

/**
 * Checks the built file against the corpus it has to serve.
 *
 * A gazetteer that silently omits a city the directory contains is
 * worse than none: that city loses its anchor and nobody finds out.
 */
async function verify() {
  const { FL_PLACES, lookupPlace } = await import('../../src/lib/places/florida')
  const base = (
    process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ??
    'https://www.844xpert.com'
  ).replace(/\/$/, '')

  console.log(`\n  ${FL_PLACES.length} places in the gazetteer`)

  const res = await fetch(`${base}/api/public/lawyers`)
  const firms: { city?: string; county?: string; lat: number; lng: number }[] = await res.json()
  console.log(`  ${firms.length} firms from ${base}\n`)

  const byCity = new Map<string, { lat: number; lng: number }[]>()
  for (const f of firms) {
    if (!f.city) continue
    const list = byCity.get(f.city) ?? []
    list.push({ lat: f.lat, lng: f.lng })
    byCity.set(f.city, list)
  }

  /**
   * A city the corpus has and the gazetteer does not loses its anchor
   * silently, so this fails the build — but only past a threshold.
   * OpenAddresses records the municipality, and a handful of firms give
   * an unincorporated community instead ("Siesta Key", "Amelia Island")
   * or outright prose ("Pensacola Area"). Those are corpus-quality
   * problems; failing on them would mean this never passes.
   */
  const FAIL_ABOVE = 5
  let missing = 0
  let far = 0

  byCity.forEach((coords, city) => {
    const place = lookupPlace(foldName(city))
    if (!place) {
      const severity = coords.length >= FAIL_ABOVE ? 'MISSING' : 'minor  '
      console.log(`  ${severity}  ${city} (${coords.length} firms)`)
      if (coords.length >= FAIL_ABOVE) missing += 1
      return
    }
    const meanLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length
    const meanLng = coords.reduce((s, c) => s + c.lng, 0) / coords.length
    const miles = haversineDistance(place.lat, place.lng, meanLat, meanLng)
    if (miles > 8) {
      console.log(`  FAR      ${city}: ${miles.toFixed(1)} mi from its firms`)
      far += 1
    }
  })

  const keys = new Set(FL_PLACES.map((p) => `${p.key}|${p.county}`))
  const duplicates = FL_PLACES.length - keys.size

  console.log(`\n  missing: ${missing}   far: ${far}   duplicate keys: ${duplicates}`)
  if (missing > 0 || duplicates > 0) process.exit(1)
}

async function main() {
  if (VERIFY) {
    await verify()
    return
  }

  const places = await build()
  const payload = {
    version: new Date().toISOString().slice(0, 10),
    source: 'data/geo/index — OpenAddresses FL county extracts, weighted by address count',
    // Tuples rather than objects: ~45 bytes a row instead of ~110, and
    // this file ships to every visitor of the public directory.
    places: places.map((p) => [
      p.name,
      p.county,
      Number((p.latSum / p.points).toFixed(5)),
      Number((p.lngSum / p.points).toFixed(5)),
      // Address count. Carried so a repeated name resolves to the
      // larger place at runtime rather than relying on file order, and
      // so the dropdown can rank a real city above a hamlet.
      p.points,
    ]),
  }

  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 0) + '\n', 'utf8')
  const bytes = JSON.stringify(payload).length
  console.log(`\n  ${places.length} places -> ${OUT_PATH}`)
  console.log(`  ${(bytes / 1024).toFixed(1)} KB raw\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
