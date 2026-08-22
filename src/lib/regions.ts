/**
 * Canonical catalog of service regions.
 *
 * Counterpart to `practice-areas.ts`, but this alias table targets *historical
 * data* rather than human input: the clinic imports ran in batches that each
 * cased and punctuated the region differently, so the 696-row corpus holds 23
 * distinct strings for 16 real regions:
 *
 *   "CENTRAL FLORIDA" (60)                  vs "Central Florida" (28)
 *   "SOUTHWEST FLORIDA" (56)                vs "Southwest Florida" (21)
 *   "NORTH CENTRAL FLORIDA" (54)            vs "North Central Florida" (23)
 *   "SOUTH FLORIDA" (37)                    vs "South Florida" (15)
 *   "North Florida / Panhandle" (68)        vs "NORTH FLORIDA / PANHANDLE" (2)
 *   "WEST CENTRAL FLORIDA (TAMPA BAY)" (44) vs "West Central Florida / Tampa Bay" (22)
 *                                           vs "West Central Florida" (3)
 *
 * Admin filter dropdowns build their options from `new Set(c.region)` and
 * compare with `!==`, so today those render as separate, non-overlapping
 * options that each hide most of the region's clinics.
 *
 * Note the fold here is *stricter* than the search fold: it also flattens the
 * `/`, `-`, `&` and `(...)` separators, which is what collapses the three Tampa
 * Bay spellings. Keep the two folds separate — the search one must preserve
 * enough structure to tokenize.
 */

export const FLORIDA_REGIONS = [
  'North Florida / Panhandle',
  'North Central Florida',
  'Northeast Florida',
  'Central Florida',
  'West Central Florida / Tampa Bay',
  'Southwest Florida',
  'South Florida',
  'Florida Keys',
] as const

export const MINNESOTA_REGIONS = [
  'Twin Cities Metro',
  'Central Minnesota',
  'Northeast Minnesota',
  'Northwest Minnesota',
  'West Central Minnesota',
  'South Central Minnesota',
  'Southeast Minnesota',
  'Southwest Minnesota',
] as const

export const CANONICAL_REGIONS = [
  ...FLORIDA_REGIONS,
  ...MINNESOTA_REGIONS,
] as const

export type CanonicalRegion = typeof CANONICAL_REGIONS[number]

/**
 * Collapses case, punctuation and separators so every historical spelling of a
 * region lands on one key. `/`, `-`, `&` and parentheses all become spaces.
 */
function fold(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[/\-&,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Folded spellings that don't reduce to a canonical name on their own.
 *
 * "West Central Florida" is the only genuine ambiguity: it folds to a distinct
 * key from the other two Tampa Bay variants, so it needs an explicit entry.
 */
const ALIASES: Record<string, CanonicalRegion> = {
  'west central florida': 'West Central Florida / Tampa Bay',
  'tampa bay': 'West Central Florida / Tampa Bay',
  panhandle: 'North Florida / Panhandle',
  'north florida': 'North Florida / Panhandle',
  keys: 'Florida Keys',
  'the keys': 'Florida Keys',
  'twin cities': 'Twin Cities Metro',
  metro: 'Twin Cities Metro',
  'minneapolis st paul': 'Twin Cities Metro',
}

const CANONICAL_BY_FOLDED = new Map<string, CanonicalRegion>(
  CANONICAL_REGIONS.map((r) => [fold(r), r])
)

/**
 * Maps any historical or human-entered spelling to a canonical region.
 * Returns null for unrecognised values so callers can decide whether to keep
 * the original (read path) or reject it (write path).
 */
export function canonicalizeRegion(raw: unknown): CanonicalRegion | null {
  if (typeof raw !== 'string') return null
  const folded = fold(raw)
  if (!folded) return null
  return CANONICAL_BY_FOLDED.get(folded) ?? ALIASES[folded] ?? null
}

/**
 * Lenient variant for the read path: canonicalizes what it recognises and
 * passes anything else through trimmed, so a region an admin invents tomorrow
 * is not silently deleted.
 */
export function sanitizeRegion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const canonical = canonicalizeRegion(raw)
  if (canonical) return canonical
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  return trimmed || null
}

/** The regions belonging to a state, for building scoped filter options. */
export function regionsForState(state: string | null | undefined): readonly string[] {
  if (state === 'FL') return FLORIDA_REGIONS
  if (state === 'MN') return MINNESOTA_REGIONS
  return CANONICAL_REGIONS
}
