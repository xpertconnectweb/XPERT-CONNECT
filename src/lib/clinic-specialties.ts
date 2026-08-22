/**
 * Canonical catalog of clinic specialties.
 *
 * The header of `practice-areas.ts` says clinic specialties "are messy
 * free-form CSV strings that need a tag-reconciliation map". This is that map.
 *
 * The 696-row corpus holds 26 distinct tags, of which three are pure
 * duplicates of another tag:
 *
 *   "Chiropractic Care" (10)  -> "Chiropractic" (275)
 *   "PIP" (1)                 -> "PIP Claims" (52)
 *   "Spine & Trauma" (1)      -> "Spine" (76)
 *
 * `Orthopedics` (1) and `Orthopedic Rehabilitation` (12) are deliberately kept
 * apart: a clinic that does orthopedic rehab is not an orthopedist's office,
 * and collapsing them would send referrals to the wrong place.
 *
 * Mirrors the `practice-areas.ts` shape exactly — catalog, ALIASES, a strict
 * `normalize*` and a lenient `sanitize*`. Lenient is what the read and write
 * paths use, so a specialty an admin adds tomorrow survives.
 */

/** Ordered by corpus frequency, which is also the useful order for filter chips. */
export const CLINIC_SPECIALTIES = [
  'Auto Injuries',
  'Rehabilitation',
  'Chiropractic',
  'Injury Clinic',
  'Physical Therapy',
  'Pain Management',
  'Spine',
  'Hospital Services',
  'Massage Therapy',
  'PIP Claims',
  'Whiplash Treatment',
  'Outpatient Therapy',
  'Medical Clinic',
  'Orthopedic Rehabilitation',
  'Sports Medicine',
  'Personal Injury',
  'Attorney Lien',
  'General Medicine',
  'Neurological Rehabilitation',
  'Orthopedics',
  'Work Injury Rehabilitation',
  'Manual Therapy',
  'Dry Needling',
] as const

export type ClinicSpecialty = typeof CLINIC_SPECIALTIES[number]

/** Collapses whitespace, case and the `&`/`and` spelling so lookups are forgiving. */
function fold(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Folded synonyms -> canonical specialty.
 *
 * Two families live here: the three real duplicates found in stored data, and
 * the vocabulary a human is likely to type into the admin form or a search box
 * ("chiro", "ortho", "pt").
 */
const ALIASES: Record<string, ClinicSpecialty> = {
  // Reconciling stored duplicates
  'chiropractic care': 'Chiropractic',
  pip: 'PIP Claims',
  'spine and trauma': 'Spine',

  // Chiropractic
  chiro: 'Chiropractic',
  chiropractor: 'Chiropractic',
  'chiropractic medicine': 'Chiropractic',

  // Orthopedics — note these resolve to the practice, not to rehab
  ortho: 'Orthopedics',
  orthopedic: 'Orthopedics',
  orthopaedic: 'Orthopedics',
  orthopaedics: 'Orthopedics',
  orthopedist: 'Orthopedics',
  'orthopedic surgery': 'Orthopedics',
  'orthopedic surgeon': 'Orthopedics',
  'ortho rehab': 'Orthopedic Rehabilitation',
  'orthopedic rehab': 'Orthopedic Rehabilitation',

  // Physical therapy
  pt: 'Physical Therapy',
  'physical therapist': 'Physical Therapy',
  physiotherapy: 'Physical Therapy',

  // Neurology
  neuro: 'Neurological Rehabilitation',
  neurology: 'Neurological Rehabilitation',
  neurologist: 'Neurological Rehabilitation',
  'neuro rehab': 'Neurological Rehabilitation',

  // Pain / injury vocabulary
  'pain medicine': 'Pain Management',
  'pain mgmt': 'Pain Management',
  'personal injury protection': 'PIP Claims',
  'pip claim': 'PIP Claims',
  'auto injury': 'Auto Injuries',
  'auto accident': 'Auto Injuries',
  'car accident': 'Auto Injuries',
  'motor vehicle accident': 'Auto Injuries',
  mva: 'Auto Injuries',
  whiplash: 'Whiplash Treatment',
  'work injury': 'Work Injury Rehabilitation',
  'workers comp': 'Work Injury Rehabilitation',
  'workers compensation': 'Work Injury Rehabilitation',

  // Misc
  rehab: 'Rehabilitation',
  massage: 'Massage Therapy',
  'sports med': 'Sports Medicine',
  'general practice': 'General Medicine',
  'family medicine': 'General Medicine',
  'internal medicine': 'General Medicine',
  'primary care': 'General Medicine',
  'general practitioner': 'General Medicine',
  'dry needle': 'Dry Needling',
}

/**
 * Spreadsheet column headers that were imported as data during the CSV loads.
 * Same defensive list as `practice-areas.ts` — see the `l-060` row removed in
 * scripts/migrations/2026-08-directory-role.sql for what happens without it.
 */
const REJECTED = new Set([
  'especialidad',
  'especialidades',
  'specialty',
  'specialties',
  'servicios',
  'services',
  'region',
  'región',
  'condado',
  'county',
  'n/a',
  'na',
  '-',
  'sin especialidad',
])

const CANONICAL_BY_FOLDED = new Map<string, ClinicSpecialty>(
  CLINIC_SPECIALTIES.map((s) => [fold(s), s])
)

/**
 * Strict: maps a string onto the catalog, or null.
 * Use when only catalog values are acceptable.
 */
export function normalizeSpecialty(raw: unknown): ClinicSpecialty | null {
  if (typeof raw !== 'string') return null
  const folded = fold(raw)
  if (!folded || REJECTED.has(folded)) return null
  return CANONICAL_BY_FOLDED.get(folded) ?? ALIASES[folded] ?? null
}

/** Strict list variant — drops anything outside the catalog, dedupes. */
export function normalizeSpecialties(raw: unknown): ClinicSpecialty[] {
  if (!Array.isArray(raw)) return []
  const out: ClinicSpecialty[] = []
  for (const entry of raw) {
    const value = normalizeSpecialty(entry)
    if (value && !out.includes(value)) out.push(value)
  }
  return out
}

/**
 * Lenient: canonicalizes what it recognises, drops known junk, and passes
 * anything else through trimmed.
 *
 * This is the variant for both the read and the write path — admins can enter
 * free-form specialties in the clinic form, and a strict filter would silently
 * delete them.
 */
export function sanitizeSpecialty(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const folded = fold(raw)
  if (!folded || REJECTED.has(folded)) return null
  const canonical = CANONICAL_BY_FOLDED.get(folded) ?? ALIASES[folded]
  if (canonical) return canonical
  return raw.trim().replace(/\s+/g, ' ')
}

/** Lenient list variant — preserves admin-defined specialties, dedupes. */
export function sanitizeSpecialties(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    const value = sanitizeSpecialty(entry)
    if (value && !out.includes(value)) out.push(value)
  }
  return out
}

/**
 * Orders an admin-supplied catalog against the canonical list, keeping any
 * extra custom values at the end. Same contract as `resolveCatalog` in
 * `practice-areas.ts`.
 */
export function resolveSpecialtyCatalog(stored: unknown): string[] {
  if (!Array.isArray(stored) || stored.length === 0) return [...CLINIC_SPECIALTIES]
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of stored) {
    if (typeof entry !== 'string') continue
    const value = entry.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out.length > 0 ? out : [...CLINIC_SPECIALTIES]
}
