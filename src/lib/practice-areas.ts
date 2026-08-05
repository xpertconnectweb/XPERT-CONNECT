/**
 * Canonical catalog of lawyer practice areas.
 *
 * Counterpart to `medical-specialties.ts`, but deliberately simpler:
 * clinic `specialties` are messy free-form CSV strings that need a
 * tag-reconciliation map, whereas `lawyers.practice_areas` already
 * holds these eight canonical values and nothing else.
 *
 * The alias table below therefore targets *human input* — what an
 * admin types into the lawyer form, or what arrives in a URL query —
 * not historical data.
 *
 * Order matters: it is the default display order of the practice-area
 * cards. Admins can override it in /admin/settings, which persists to
 * the `practice_areas_list` setting (see getPracticeAreaCatalog in
 * src/lib/data.ts). Personal Injury leads because it is the core of
 * the referral network.
 *
 * This module is intentionally free of React and Tailwind so it can be
 * imported from API routes and scripts. Presentation (icons, colors)
 * lives with the components that render it.
 */

export const PRACTICE_AREAS = [
  'Personal Injury',
  'Criminal Defense',
  'Family Law',
  'Estate Planning',
  'Immigration',
  'Business Law',
  'Civil Litigation',
  'Real Estate Law',
] as const

export type PracticeArea = typeof PRACTICE_AREAS[number]

/**
 * Case-folded synonyms → canonical area. Keys must be lowercase and
 * whitespace-collapsed; `fold` does that before any lookup.
 */
const ALIASES: Record<string, PracticeArea> = {
  // The vocabulary the client actually uses
  injury: 'Personal Injury',
  'injury law': 'Personal Injury',
  'personal injury law': 'Personal Injury',
  accident: 'Personal Injury',
  'accident law': 'Personal Injury',
  criminal: 'Criminal Defense',
  'criminal law': 'Criminal Defense',
  'criminal defence': 'Criminal Defense',
  family: 'Family Law',
  'family lawyer': 'Family Law',
  divorce: 'Family Law',
  estate: 'Estate Planning',
  'estate law': 'Estate Planning',
  probate: 'Estate Planning',
  wills: 'Estate Planning',
  'immigration law': 'Immigration',
  business: 'Business Law',
  'corporate law': 'Business Law',
  commercial: 'Business Law',
  civil: 'Civil Litigation',
  litigation: 'Civil Litigation',
  'civil law': 'Civil Litigation',
  'real estate': 'Real Estate Law',
  property: 'Real Estate Law',
}

/**
 * Spanish CSV column headers that were once imported as data (see the
 * `l-060` row removed in scripts/migrations/2026-08-directory-role.sql).
 * Always dropped, never stored.
 */
const REJECTED = new Set([
  'especialidad',
  'especialidades',
  'area de practica',
  'área de práctica',
  'areas de practica',
  'áreas de práctica',
  'practice area',
  'practice areas',
  'region',
  'región',
  'condado',
  'county',
  'n/a',
  '-',
])

/** Collapses whitespace and case so lookups are forgiving. */
function fold(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

const CANONICAL_BY_FOLDED = new Map<string, PracticeArea>(
  PRACTICE_AREAS.map((a) => [fold(a), a])
)

/**
 * Strict: maps a string to one of the eight canonical areas, or null.
 * Use when only catalog values are acceptable.
 */
export function normalizePracticeArea(raw: unknown): PracticeArea | null {
  if (typeof raw !== 'string') return null
  const folded = fold(raw)
  if (!folded || REJECTED.has(folded)) return null
  return CANONICAL_BY_FOLDED.get(folded) ?? ALIASES[folded] ?? null
}

/** Strict list variant — drops anything outside the catalog. */
export function normalizePracticeAreas(raw: unknown): PracticeArea[] {
  if (!Array.isArray(raw)) return []
  const out: PracticeArea[] = []
  for (const entry of raw) {
    const area = normalizePracticeArea(entry)
    if (area && !out.includes(area)) out.push(area)
  }
  return out
}

/**
 * Lenient: canonicalizes what it recognises, drops known junk, and
 * passes anything else through trimmed.
 *
 * This is the variant used on both the read and the write path,
 * because admins can add their own areas in /admin/settings — a strict
 * filter would silently delete those. Junk still cannot get back in.
 */
export function sanitizePracticeArea(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const folded = fold(raw)
  if (!folded || REJECTED.has(folded)) return null
  const canonical = CANONICAL_BY_FOLDED.get(folded) ?? ALIASES[folded]
  if (canonical) return canonical
  return raw.trim().replace(/\s+/g, ' ')
}

/** Lenient list variant — preserves admin-defined areas, dedupes. */
export function sanitizePracticeAreas(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    const area = sanitizePracticeArea(entry)
    if (area && !out.includes(area)) out.push(area)
  }
  return out
}

/**
 * Orders an admin-supplied catalog (the `practice_areas_list` setting)
 * against the canonical list, keeping any extra custom values the
 * admin added at the end. Used so the UI never shows an area that no
 * longer exists while still honouring admin ordering.
 */
export function resolveCatalog(stored: unknown): string[] {
  if (!Array.isArray(stored) || stored.length === 0) return [...PRACTICE_AREAS]
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of stored) {
    if (typeof entry !== 'string') continue
    const value = entry.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out.length > 0 ? out : [...PRACTICE_AREAS]
}
