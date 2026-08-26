/**
 * OpenAddresses: catalogue, download, and streaming parse.
 *
 * The data behind the self-hosted geocoder. OpenAddresses aggregates the
 * address registers that US counties publish themselves — the same authoritative
 * source the commercial providers ingest — under licences that permit commercial
 * use (Manatee County, for instance, is CC BY 4.0).
 *
 * Two facts about the service that are not obvious and cost time to discover:
 *
 *  1. **Downloads are per SOURCE, never per state.** The published collections
 *     are regional: Florida lives inside "US South", 12.5 GB bundled with
 *     sixteen other states. Florida alone is 75 individual sources and
 *     Minnesota about 70, so the pipeline walks the catalogue.
 *  2. **The download URL is not the one the API advertises.**
 *     `batch.openaddresses.io/api/job/{id}/output/source.geojson.gz` answers
 *     403. The public artefact is on `v2.openaddresses.io`, and it only
 *     resolves through a redirect — a fetch that does not follow one silently
 *     writes a zero-byte file that fails later, inside the gunzip, as
 *     "unexpected end of file".
 *
 * Shared by the Phase 0 benchmark corpus and the Phase 1 ETL so that both read
 * exactly the same bytes.
 */
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const CATALOGUE = 'https://api.github.com/repos/openaddresses/openaddresses/contents/sources'
const METADATA = 'https://batch.openaddresses.io/api/data'
const ARTEFACT = 'https://v2.openaddresses.io/batch-prod/job'

/**
 * One address point, exactly as OpenAddresses normalises it.
 *
 * `street` arrives already USPS-abbreviated and upper-cased — "SHINBONE ALY",
 * "40TH AVE W". That is the canonical form the index stores, which means the
 * query canonicaliser has to convert user input INTO it (Street → ST,
 * Circle → CIR, East → E) rather than the other way round. The project's
 * existing `TOKEN_EXPANSIONS` in `src/lib/search/text.ts` expands in the
 * opposite direction, for a different purpose.
 */
export interface OaAddress {
  number: string
  street: string
  unit: string
  city: string
  /** County. OpenAddresses calls it `district`. */
  district: string
  /** Two-letter state code. */
  region: string
  postcode: string
  lat: number
  lng: number
}

export interface OaSource {
  /** e.g. "us/fl/manatee" */
  name: string
  jobId: number
  /** Compressed bytes, straight from the API. */
  size: number
}

/** Every source slug published for a state, e.g. ["alachua", "baker", ...]. */
export async function listSources(state: string): Promise<string[]> {
  const res = await fetch(`${CATALOGUE}/us/${state}?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub catalogue for ${state}: ${res.status}`)

  const entries = (await res.json()) as Array<{ name: string; type: string }>
  return entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
    .map((e) => e.name.replace(/\.json$/, ''))
    .sort()
}

/**
 * Resolves a source to its latest successful build.
 *
 * A source can carry several layers — `addresses`, `buildings`, `parcels`. Only
 * `addresses` is wanted, and asking for the wrong one downloads tens of
 * megabytes of building footprints that get thrown away.
 */
export async function resolveSource(name: string): Promise<OaSource | null> {
  const res = await fetch(`${METADATA}?source=${encodeURIComponent(name)}`)
  if (!res.ok) return null

  const rows = (await res.json()) as Array<{
    source: string
    layer: string
    job: number | null
    size: number | null
  }>

  const addresses = rows.find((r) => r.source === name && r.layer === 'addresses')
  if (!addresses?.job) return null

  return { name, jobId: addresses.job, size: addresses.size ?? 0 }
}

/**
 * Downloads a source, skipping the fetch when the file is already on disk at
 * the expected size.
 *
 * The resumability matters: 145 sources at up to 45 MB each is not something to
 * restart from zero because one county's server timed out.
 */
export async function downloadSource(source: OaSource, destPath: string): Promise<'downloaded' | 'cached'> {
  try {
    const existing = await stat(destPath)
    if (source.size > 0 && existing.size === source.size) return 'cached'
  } catch {
    // Not there yet.
  }

  await mkdir(dirname(destPath), { recursive: true })

  // `redirect: 'follow'` is the default, and it is the whole reason this works:
  // the artefact URL 302s, and a client that does not follow writes an empty
  // file that only fails much later, inside the gunzip.
  const res = await fetch(`${ARTEFACT}/${source.jobId}/source.geojson.gz`)
  if (!res.ok) throw new Error(`${source.name}: artefact responded ${res.status}`)
  if (!res.body) throw new Error(`${source.name}: artefact had no body`)

  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath))
  return 'downloaded'
}

interface OaFeature {
  properties?: Partial<Record<keyof OaAddress | 'id' | 'accuracy' | 'hash', string>>
  geometry?: { coordinates?: [number, number] }
}

/**
 * Yields address points from a downloaded source.
 *
 * The file is newline-delimited GeoJSON — one Feature per line, no wrapping
 * FeatureCollection — so it streams without ever holding the whole thing in
 * memory. Miami-Dade alone is 45 MB compressed and several hundred uncompressed;
 * `JSON.parse` on the lot is not an option.
 *
 * Rows without a usable number, street or coordinate are dropped here rather
 * than downstream, so every consumer can assume a complete record.
 */
export async function* streamAddresses(gzPath: string): AsyncGenerator<OaAddress> {
  const lines = createInterface({
    input: createReadStream(gzPath).pipe(createGunzip()),
    crlfDelay: Infinity,
  })

  for await (const line of lines) {
    if (!line || line[0] !== '{') continue

    let feature: OaFeature
    try {
      feature = JSON.parse(line) as OaFeature
    } catch {
      continue
    }

    const p = feature.properties
    const coords = feature.geometry?.coordinates
    if (!p || !coords) continue

    const lng = coords[0]
    const lat = coords[1]
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    // (0, 0) is the Gulf of Guinea and a well-known placeholder. The same guard
    // `hasRealCoordinates` applies to the app's own records.
    if (lat === 0 && lng === 0) continue

    const number = (p.number ?? '').trim()
    const street = (p.street ?? '').trim()
    if (!number || !street) continue

    yield {
      number,
      street,
      unit: (p.unit ?? '').trim(),
      city: (p.city ?? '').trim(),
      district: (p.district ?? '').trim(),
      region: (p.region ?? '').trim().toUpperCase(),
      postcode: (p.postcode ?? '').trim(),
      lat,
      lng,
    }
  }
}

/**
 * The address as a person would type it.
 *
 * Title-cased rather than left in the register's upper case, because that is
 * what a referrer copying off an intake form produces, and what every other
 * geocoder returns. Benchmarking against the stored upper-case string would
 * measure exact string equality and call it accuracy.
 *
 * The street suffix stays abbreviated ("Aly", "Ave W") — expanded variants
 * ("Alley", "Avenue West") need the USPS Publication 28 table, which Phase 3
 * builds. Until then this is the honest half of the distribution.
 */
export function toTypedQuery(a: OaAddress, options: { withZip?: boolean } = {}): string {
  const withZip = options.withZip ?? true
  const street = titleCase(a.street)
  const city = titleCase(a.city)
  const tail = withZip && a.postcode ? `${a.region} ${a.postcode}` : a.region

  return [`${a.number} ${street}`, city, tail].filter(Boolean).join(', ')
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    // Ordinals keep their suffix lower: "40Th" reads wrong, "40th" is how
    // anyone writes it.
    .replace(/(\d)(St|Nd|Rd|Th)\b/g, (_, digit: string, suffix: string) => digit + suffix.toLowerCase())
}
