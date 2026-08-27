/**
 * Text shared by the NPPES scripts.
 *
 * Its own module because both `resolve-names` and `build-practices` need it,
 * and importing it from either would run that script's `main()` as a side
 * effect of the import.
 */

/**
 * Title-cases the SHOUTED names the registry stores, keeping initialisms.
 *
 * NPPES stores "TRIA ORTHOPAEDIC CENTER LLC". Rendered as-is next to the
 * existing corpus — "Newlin Chiropractic", "Twin Cities Orthopedics" — every
 * imported row would look like a different kind of thing, which is exactly
 * what an import should not look like.
 */
/** The dots and commas at the end of a word, and nothing else. */
function trailingPunctuation(word: string): string {
  const match = /[.,]+$/.exec(word)
  return match ? match[0] : ''
}
export function titleCaseOrg(raw: string): string {
  const KEEP = new Set([
    'LLC', 'PLLC', 'PA', 'PC', 'LLP', 'LP', 'INC', 'MD', 'DO', 'PT', 'DC', 'LTD',
    'II', 'III', 'IV', 'USA', 'US', 'MN', 'FL', 'HCA', 'NYU', 'UF', 'PLC', 'PSC',
  ])
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[.,]/g, '')
      if (bare.length <= 4 && KEEP.has(bare.toUpperCase())) {
        // Only the trailing punctuation comes back. Slicing by the bare
        // length re-attached whatever the dots had been hiding, so
        // "M.D.," came out as "MDD.," — visible in the first import run.
        return bare.toUpperCase() + trailingPunctuation(word)
      }
      if (/^\d/.test(word)) return word
      // Split on hyphens too, or "MAYO CLINIC-ROCHESTER" comes out as
      // "Mayo Clinic-rochester", which reads as a typo rather than a place.
      return word
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('-')
    })
    .join(' ')
    .replace(/(\w)\bOf\b/g, '$1of')
    .replace(/\s+Of\s+/g, ' of ')
    .replace(/\s+And\s+/g, ' and ')
    .replace(/\s+The\s+/g, ' the ')
    .trim()
}

/**
 * Title-cases a street line the way the existing corpus writes one.
 *
 * NPPES shouts: "200 1ST ST SW". The directory next to it reads
 * "1117 N Palafox St". Running the organisation title-caser over a street
 * would give "200 1St St Sw", which is worse than leaving it shouting —
 * so directionals stay upper, ordinal suffixes go lower, and the rest is
 * ordinary title case.
 */
const STREET_UPPER = new Set([
  'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'US', 'SR', 'CR', 'NW.', 'PO',
])

export function titleCaseStreet(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[.,]/g, "")
      if (STREET_UPPER.has(bare.toUpperCase())) return bare.toUpperCase() + trailingPunctuation(word)
      // 1ST, 2ND, 63RD — the number stays, the suffix goes lower.
      const ordinal = /^(\d+)(ST|ND|RD|TH)$/i.exec(bare)
      if (ordinal) return ordinal[1] + ordinal[2].toLowerCase() + trailingPunctuation(word)
      if (/^\d/.test(word)) return word
      return word
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join("-")
    })
    .join(' ')
    .trim()
}
