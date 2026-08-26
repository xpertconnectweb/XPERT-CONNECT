/**
 * The built index, in memory, with a faithful copy of pg_trgm's retrieval.
 *
 * Exists so Phase 4's gate can be answered before anyone runs a migration. The
 * question that gate asks -- does this engine beat Geoapify on accuracy -- is
 * about the data and the ranking model, and neither of those changes when the
 * rows move into Postgres. Waiting for a database to find out whether the
 * project works would be the wrong order.
 *
 * The retrieval is not an approximation. `similarity()` in pg_trgm is Jaccard
 * over the same padded trigrams `src/lib/search/fuzzy.ts` produces, so an
 * inverted trigram index computes exactly the number Postgres would, for
 * exactly the same rows. What is different is speed and nothing else: this
 * walks posting lists in a single process, and Postgres walks a GIN index.
 *
 * Around 250 MB resident for 567,000 streets. Run node with a raised heap.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type { StreetRow } from '../../../src/lib/geocoding/street-index'
import { SCOPED_TRIGRAM_THRESHOLD, TRIGRAM_THRESHOLD } from '../../../src/lib/geocoding/constants'
import type { LoadableStreet } from '../build-index'

const MERGED = 'data/geo/index/merged.ndjson'

/** Matches `trigrams()` in src/lib/search/fuzzy.ts, and pg_trgm's own padding. */
function trigramsOf(value: string): string[] {
  const padded = `  ${value} `
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) {
    const gram = padded.slice(i, i + 3)
    if (seen.has(gram)) continue
    seen.add(gram)
    out.push(gram)
  }
  return out
}

export interface LocalHit extends StreetRow {
  payload: Buffer
}

export class LocalIndex {
  /** Columnar. 567,000 objects would cost more in headers than in data. */
  private readonly nameNorm: string[] = []
  private readonly nameDisplay: string[] = []
  private readonly city: string[] = []
  private readonly state: string[] = []
  private readonly zip: string[] = []
  private readonly numMin: number[] = []
  private readonly numMax: number[] = []
  private readonly latMin: number[] = []
  private readonly latMax: number[] = []
  private readonly lngMin: number[] = []
  private readonly lngMax: number[] = []
  private readonly pointCount: number[] = []
  private readonly payloads: Buffer[] = []

  /** trigram -> the rows containing it. */
  private readonly postings = new Map<string, number[]>()
  /** How many distinct trigrams each row's name has, for the Jaccard denominator. */
  private gramCount = new Int16Array(0)

  /** Reused across queries so a benchmark does not allocate 567,000 slots per lookup. */
  private shared = new Int16Array(0)
  private touched: number[] = []

  get size(): number {
    return this.nameNorm.length
  }

  static async load(path = MERGED): Promise<LocalIndex> {
    const index = new LocalIndex()
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })

    for await (const line of lines) {
      if (!line) continue
      const row = JSON.parse(line) as LoadableStreet
      index.add(row)
    }

    index.seal()
    return index
  }

  private add(row: LoadableStreet): void {
    const at = this.nameNorm.length

    this.nameNorm.push(row.n)
    this.nameDisplay.push(row.d)
    this.city.push(row.c)
    this.state.push(row.s)
    this.zip.push(row.z)
    this.numMin.push(row.n0)
    this.numMax.push(row.n1)
    this.latMin.push(row.y0)
    this.latMax.push(row.y1)
    this.lngMin.push(row.x0)
    this.lngMax.push(row.x1)
    this.pointCount.push(row.k)
    this.payloads.push(Buffer.from(row.p, 'base64'))

    const grams = trigramsOf(row.n)
    for (let i = 0; i < grams.length; i++) {
      const list = this.postings.get(grams[i])
      if (list) list.push(at)
      else this.postings.set(grams[i], [at])
    }
  }

  private seal(): void {
    const total = this.nameNorm.length
    this.gramCount = new Int16Array(total)
    for (let i = 0; i < total; i++) this.gramCount[i] = trigramsOf(this.nameNorm[i]).length
    this.shared = new Int16Array(total)
  }

  /**
   * The equivalent of `geo_street_search`: generous trigram retrieval, ordered
   * the same way, cut to the same limit.
   *
   * The postcode and city boosts are here for the same reason they are in the
   * SQL -- "main st" matches thousands of rows and only fifty survive, so
   * without them the right street can be cut before the ranker ever sees it.
   */
  search(
    query: string,
    options: { state?: string | null; zip?: string | null; city?: string | null; limit?: number; threshold?: number } = {}
  ): LocalHit[] {
    const limit = options.limit ?? 50
    // Both bars come from the shared constants and nothing overrides them.
    // An env var here would let a benchmark report a number production
    // cannot reproduce, which is worse than having no benchmark.
    const threshold = options.threshold ?? TRIGRAM_THRESHOLD
    const scopedThreshold = Math.min(SCOPED_TRIGRAM_THRESHOLD, threshold)
    const wantState = options.state ?? null
    const wantZip = options.zip ?? null
    const wantCity = options.city ? options.city.toUpperCase() : null

    const grams = trigramsOf(query)
    if (grams.length === 0) return []

    // Clear only what the last query touched.
    for (let i = 0; i < this.touched.length; i++) this.shared[this.touched[i]] = 0
    this.touched = []

    for (let g = 0; g < grams.length; g++) {
      const list = this.postings.get(grams[g])
      if (!list) continue
      for (let i = 0; i < list.length; i++) {
        const at = list[i]
        if (this.shared[at] === 0) this.touched.push(at)
        this.shared[at]++
      }
    }

    const scored: Array<{ at: number; score: number; ordered: number }> = []

    for (let i = 0; i < this.touched.length; i++) {
      const at = this.touched[i]
      if (wantState && this.state[at] !== wantState) continue

      const shared = this.shared[at]
      const union = grams.length + this.gramCount[at] - shared
      const score = union === 0 ? 0 : shared / union

      const inZip = Boolean(wantZip && this.zip[at] === wantZip)
      const inCity = Boolean(wantCity && this.city[at].toUpperCase() === wantCity)
      // Mirrors the OR branch in geo_street_search: a candidate inside the
      // postcode or city the query named is held to a far lower bar, because
      // the anchor narrows the set enough to afford it.
      const bar = inZip || inCity ? scopedThreshold : threshold
      if (score < bar) continue

      let ordered = score
      if (inZip) ordered += 0.15
      if (inCity) ordered += 0.1

      scored.push({ at, score, ordered })
    }

    scored.sort((a, b) => b.ordered - a.ordered || this.pointCount[b.at] - this.pointCount[a.at])

    const out: LocalHit[] = []
    for (let i = 0; i < scored.length && out.length < limit; i++) out.push(this.rowAt(scored[i].at, scored[i].score))
    return out
  }

  private rowAt(at: number, score: number): LocalHit {
    return {
      id: at,
      name_norm: this.nameNorm[at],
      name_display: this.nameDisplay[at],
      city: this.city[at],
      state: this.state[at],
      zip: this.zip[at],
      num_min: this.numMin[at],
      num_max: this.numMax[at],
      lat_min: this.latMin[at],
      lat_max: this.latMax[at],
      lng_min: this.lngMin[at],
      lng_max: this.lngMax[at],
      point_count: this.pointCount[at],
      score,
      payload: this.payloads[at],
    }
  }

  payloadOf(id: number): Buffer | null {
    return this.payloads[id] ?? null
  }
}
