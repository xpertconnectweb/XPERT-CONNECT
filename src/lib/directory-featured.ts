/**
 * The firm that leads the public directory.
 *
 * Czaia Law is the network's flagship and the client asked for it to be
 * first — not "first among the matches", but first on every list, in
 * every search, whatever was typed. That is a deliberate editorial
 * choice rather than a ranking one, so it lives here as data and not as
 * a thumb on the scale inside `src/lib/search`, which every other
 * surface shares and which must keep telling the truth about relevance.
 *
 * The row is rendered with a "Featured" label for the same reason. A
 * firm in Bradenton appearing above the results for "Miami" needs to
 * say why, or the list reads as broken.
 *
 * An id rather than a name: names get edited, and a rename should not
 * silently unpin the firm the whole directory is built around.
 */
export const FEATURED_FIRM_IDS: readonly string[] = [
  // CZAIA LAW — Bradenton, Manatee County.
  '7a4d696c-945e-4188-b3fd-0e4e83023fc0',
]

export function isFeaturedFirm(id: string): boolean {
  return FEATURED_FIRM_IDS.indexOf(id) !== -1
}

/**
 * Moves the featured firms to the front, keeping everything else in the
 * order it arrived.
 *
 * Only reorders. A firm that is not in `rows` does not get added — the
 * caller decides whether an absent featured firm should be injected,
 * because only the caller knows whether "absent" means filtered out or
 * simply not loaded yet.
 */
export function hoistFeatured<T extends { id: string }>(rows: readonly T[]): T[] {
  if (rows.length === 0) return []
  const featured: T[] = []
  const rest: T[] = []
  for (const row of rows) {
    if (isFeaturedFirm(row.id)) featured.push(row)
    else rest.push(row)
  }
  return featured.length > 0 ? [...featured, ...rest] : [...rows]
}
