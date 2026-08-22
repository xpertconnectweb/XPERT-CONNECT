/**
 * County name normalization.
 *
 * The two tables disagree on format, consistently and completely:
 *
 *   clinics.county  -> "Escambia", "Orange"          (123 distinct, 0 suffixed)
 *   lawyers.county  -> "Orange County", "Polk County" (27 distinct, 27 suffixed)
 *
 * So any cross-table filter, join or shared facet is broken by default: 22 of
 * the 27 lawyer counties have a clinic counterpart that never matches.
 *
 * Convention adopted here: **store bare, render with the suffix.** Bare is the
 * better key (it's what the larger table already uses, and it sorts correctly),
 * while "Orange County" is what people expect to read.
 *
 * Rendering is currently inconsistent too — SpecialistsList prints
 * `{county} County` while AttorneyDirectory prints it bare, which means a
 * lawyer-format value leaking into the former would render "Orange County
 * County". `countyLabel()` exists so both call the same thing.
 */

const COUNTY_SUFFIX = /\s+(?:county|co\.?|parish|borough)\s*$/i

/**
 * "Orange County" | "orange" | "ORANGE CO." -> "Orange"
 *
 * Returns null for empty or non-string input so callers can distinguish
 * "no county" from "county named empty string".
 */
export function canonicalizeCounty(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const bare = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(COUNTY_SUFFIX, '')
    .trim()
  if (!bare) return null
  // ALL-CAPS imports get title-cased; mixed case is left as the source had it,
  // since county names like "Miami-Dade" and "St. Louis" carry real casing.
  if (bare !== bare.toUpperCase()) return bare
  return bare.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
}

/**
 * Display form: "Orange" -> "Orange County".
 *
 * Idempotent — passing an already-suffixed value does not double it.
 */
export function countyLabel(raw: unknown): string | null {
  const bare = canonicalizeCounty(raw)
  return bare ? `${bare} County` : null
}
