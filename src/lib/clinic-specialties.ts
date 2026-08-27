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
 * `Orthopedics` and `Orthopedic Rehabilitation` are deliberately kept apart: a
 * clinic that does orthopedic rehab is not an orthopedist's office, and
 * collapsing them would send referrals to the wrong place. That distinction
 * cost nothing when `Orthopedics` was one row; it is load-bearing now that it
 * is three hundred.
 *
 * `Neurosurgery` was added in the NPPES import of August 2026. Before it, the
 * corpus had one clinic tagged `Orthopedics` and none at all doing neuro
 * surgery — the directory was built from chiropractic and rehab listings and
 * the surgical side was simply never loaded. The aliases below carry the
 * registry's own vocabulary ('Orthopaedic Surgery, Sports Medicine' and the
 * rest), which is what lets eight NPPES subspecialties land on three tags that
 * already existed instead of inflating this list to thirty-one.
 *
 * Mirrors the `practice-areas.ts` shape exactly — catalog, ALIASES, a strict
 * `normalize*` and a lenient `sanitize*`. Lenient is what the read and write
 * paths use, so a specialty an admin adds tomorrow survives.
 */

/**
 * Ordered by the frequency of the original 696-row corpus.
 *
 * That ordering is now historical rather than current — the NPPES import put
 * `Orthopedics` at the top of the real counts and this list still has it
 * nineteenth. It is left alone on purpose: nothing user-facing reads this
 * order. The filter chips sort by live facet counts, which is the number that
 * should decide, and re-sorting a constant to chase data that moves every
 * import would be work with no output.
 */
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
  'Neurosurgery',
  'Work Injury Rehabilitation',
  'Manual Therapy',
  'Dry Needling',
] as const

export type ClinicSpecialty = typeof CLINIC_SPECIALTIES[number]

/**
 * Specialties the product puts in front of the user regardless of how the
 * counts fall, in this order.
 *
 * The filter rail shows six chips ordered by count, and those counts are
 * computed over whatever is inside the current viewport and radius — so a
 * statewide total guarantees nothing about the chips someone in Orlando
 * actually sees. Orthopedics and Neurosurgery are the two the client asked
 * for by name, and Neurosurgery in particular will never out-count
 * 'Auto Injuries' honestly. Promotion is the only way it is reliably
 * reachable without typing.
 *
 * A constant rather than the `specialties_list` platform setting: that value
 * is a CATALOG and this is a RANKING, and reading it on the map would need a
 * new public route, since /api/admin/settings is admin-only.
 */
export const FEATURED_SPECIALTIES: readonly string[] = ['Orthopedics', 'Neurosurgery']

/** Collapses whitespace, case and the `&`/`and` spelling so lookups are forgiving. */
function fold(raw: string): string {
  return raw
    // Diacritics come off before anything else, so 'ortopédica' and
    // 'neurocirugía' reach the same key as their unaccented spellings. The
    // people typing into the admin form write Spanish — the REJECTED list
    // below is nothing but Spanish spreadsheet headers — and without this no
    // Spanish alias could ever match. Safe by construction: not one catalog
    // entry or alias key carries an accent, so every existing lookup folds to
    // the same bytes it did before.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  // NPPES spells it with the 'ae'. Every taxonomy string the registry
  // returns uses that spelling, so without these two the whole import would
  // fall through the lenient path and invent tags instead of matching.
  'orthopaedic surgery': 'Orthopedics',
  'orthopaedic surgeon': 'Orthopedics',
  // Subspecialties arrive as "Orthopaedic Surgery, <subspecialty>"; fold()
  // turns the comma into a space, so these keys are literally what NPPES
  // hands over. They land on tags the catalog already has rather than
  // inflating it with eight near-duplicates — which would split one count
  // eight ways and bury all of them below the fold.
  'orthopaedic surgery orthopaedic trauma': 'Orthopedics',
  'orthopaedic surgery hand surgery': 'Orthopedics',
  'orthopaedic surgery foot and ankle surgery': 'Orthopedics',
  'orthopaedic surgery adult reconstructive orthopaedic surgery': 'Orthopedics',
  'orthopaedic surgery pediatric orthopaedic surgery': 'Orthopedics',
  'orthopaedic surgery sports medicine': 'Sports Medicine',
  'orthopaedic surgery orthopaedic surgery of the spine': 'Spine',
  'orthopaedic surgery of the spine': 'Spine',
  'orthopedic surgery of the spine': 'Spine',
  'spine surgeon': 'Spine',
  spinal: 'Spine',
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

  // Neurosurgery, kept apart from neuro rehab for the same reason Orthopedics
  // is kept apart from Orthopedic Rehabilitation: a rehab clinic is not a
  // surgeon's office, and a referral sent to the wrong one costs someone who
  // is hurt another week.
  //
  // Bare 'neuro' above still resolves to rehab, and it is worth saying why it
  // was left there rather than repointed at the bigger tag.
  //
  // These aliases only ever see fresh human input — the two stored rows hold
  // the full string 'Neurological Rehabilitation', so nothing is rewritten
  // either way. What 'neuro' means depends on who typed it: a neurologist is
  // not a neurosurgeon, and this alias has answered "rehab" since before
  // either tag had any volume. Deleting it is the worst of the three options,
  // because sanitizeSpecialty is lenient: an unmatched 'neuro' passes straight
  // through as a literal tag and becomes one more chip on the map.
  //
  // The ambiguity is settled on the QUERY side instead, where
  // TOKEN_EXPANSIONS.neuro reaches both worlds at the cost of one comparison.
  neurosurgeon: 'Neurosurgery',
  'neurological surgery': 'Neurosurgery',
  'neuro surgery': 'Neurosurgery',
  'brain surgery': 'Neurosurgery',
  'brain surgeon': 'Neurosurgery',

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

  // Spanish. Reachable at all only because fold() strips diacritics above.
  ortopedia: 'Orthopedics',
  ortopedico: 'Orthopedics',
  ortopedista: 'Orthopedics',
  'cirujano ortopedico': 'Orthopedics',
  traumatologia: 'Orthopedics',
  traumatologo: 'Orthopedics',
  neurocirugia: 'Neurosurgery',
  neurocirujano: 'Neurosurgery',
  columna: 'Spine',
  'cirugia de columna': 'Spine',

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
