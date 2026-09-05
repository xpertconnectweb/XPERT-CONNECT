import { unstable_cache } from 'next/cache'
import { getPublicDirectoryLawyers, getPracticeAreaCatalog } from '@/lib/data'
import { toDirectoryListings } from '@/lib/api/public-shape'
import { sanitizePracticeAreas } from '@/lib/practice-areas'
import type { DirectoryListing } from '@/types/professionals'

/**
 * What the server renders for the public directory without shipping the
 * whole corpus to the browser.
 *
 * The counts and counties are computed over EVERY published firm, while
 * `showcase` is a handful of rows. That asymmetry is the whole design:
 * the practice-area cards can say "312 firms" honestly while the list
 * below them is still a sample, so the block reads as a real database
 * in a screenshot taken without touching anything.
 */
export interface DirectorySummary {
  showcase: DirectoryListing[]
  /** Tuples rather than a Map: this crosses the server/client boundary. */
  counts: [string, number][]
  counties: string[]
  total: number
  catalog: string[]
}

export const EMPTY_SUMMARY: DirectorySummary = {
  showcase: [],
  counts: [],
  counties: [],
  total: 0,
  catalog: [],
}

/**
 * Pick the firms to render at rest — deterministically.
 *
 * Deliberately not a random sample, and not `.slice(0, n)` either.
 * Random would differ between the server render and the client
 * hydration, which React reports as a mismatch and which would also
 * make every screenshot of this page different. A plain slice would
 * show nine criminal-defence firms from Orlando, because that is how
 * the corpus is ordered and weighted.
 *
 * So: one firm per practice area in catalogue order, then one per city,
 * repeating until full. Ties broken by id, which is stable.
 */
export function pickShowcase(
  firms: readonly DirectoryListing[],
  catalog: readonly string[],
  n: number
): DirectoryListing[] {
  const byId = [...firms].sort((a, b) => a.id.localeCompare(b.id))
  const chosen: DirectoryListing[] = []
  const taken = new Set<string>()
  const seenCity = new Set<string>()

  // Pass 1 — spread across practice areas, and within that across cities.
  for (const area of catalog) {
    const pick = byId.find(
      (f) =>
        !taken.has(f.id) &&
        f.practiceAreas.includes(area) &&
        !seenCity.has((f.city ?? '').toLowerCase())
    )
    const fallback = byId.find((f) => !taken.has(f.id) && f.practiceAreas.includes(area))
    const firm = pick ?? fallback
    if (firm) {
      chosen.push(firm)
      taken.add(firm.id)
      seenCity.add((firm.city ?? '').toLowerCase())
    }
    if (chosen.length >= n) return chosen.slice(0, n)
  }

  // Pass 2 — top up from whatever is left, still in a stable order.
  for (const firm of byId) {
    if (chosen.length >= n) break
    if (!taken.has(firm.id)) {
      chosen.push(firm)
      taken.add(firm.id)
    }
  }

  return chosen.slice(0, n)
}

async function buildSummary(showcaseSize: number): Promise<DirectorySummary> {
  const [lawyers, configured] = await Promise.all([
    getPublicDirectoryLawyers(),
    getPracticeAreaCatalog(),
  ])

  const firms = toDirectoryListings(lawyers).map((listing) => ({
    ...listing,
    practiceAreas: sanitizePracticeAreas(listing.practiceAreas),
  }))

  const counts = new Map<string, number>()
  const counties = new Set<string>()
  for (const firm of firms) {
    firm.practiceAreas.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1))
    if (firm.county) counties.add(firm.county)
  }

  /**
   * The admin list first, then anything the data actually contains.
   *
   * `resolveCatalog` returns the stored `practice_areas_list` verbatim
   * when one exists — it does not union it with PRACTICE_AREAS. That is
   * right for the admin form, where the list is a deliberate choice
   * about what may be assigned. It is wrong for a public directory:
   * the configured list happens to omit Estate Planning and Business
   * Law, and those account for 58 published firms between them, which
   * would appear as pills on the rows while having no category card to
   * browse them by.
   *
   * So the admin's ordering is honoured, and areas that exist in the
   * data are appended rather than hidden — busiest first, since they
   * arrive without a stated order. Nothing with firms behind it goes
   * uncounted, and the section cannot silently shrink if someone edits
   * the setting.
   */
  const inCatalog = new Set(configured)
  const extras = Array.from(counts.keys())
    .filter((a) => !inCatalog.has(a))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
  const catalog = [...configured, ...extras]

  return {
    showcase: pickShowcase(firms, catalog, showcaseSize),
    counts: catalog
      .map((a) => [a, counts.get(a) ?? 0] as [string, number])
      .filter(([, n]) => n > 0),
    counties: Array.from(counties).sort(),
    total: firms.length,
    catalog,
  }
}

/**
 * One cached read shared by the landing page, /directory and nothing
 * else. Without it the landing page's own `revalidate` would pull the
 * full lawyers table out of Supabase on every revalidation, for data
 * that changes when someone re-runs an importer.
 *
 * The try/catch is not defensive noise. `supabaseAdmin` is a lazy Proxy
 * that constructs its client on first property access, and that throws
 * outright when NEXT_PUBLIC_SUPABASE_URL is absent. The landing page
 * touches only Sanity today and every one of those calls is
 * `.catch(() => null)`, so `npm run build` currently succeeds with no
 * .env.local. Introducing an unguarded Supabase read here would break
 * that build — and, worse, would take the whole marketing page down on
 * a transient database error rather than just dropping one section.
 */
export const getDirectorySummary = unstable_cache(
  async (showcaseSize = 9): Promise<DirectorySummary> => {
    try {
      return await buildSummary(showcaseSize)
    } catch (err) {
      console.error('getDirectorySummary error:', err)
      return EMPTY_SUMMARY
    }
  },
  ['public-lawyer-directory-summary'],
  { revalidate: 3600, tags: ['lawyer-directory'] }
)
