import { parseAddress } from '@/lib/address'
import { canonicalizeCounty } from '@/lib/counties'
import { fold, normalizeZip, tokenize } from './text'
import type { SearchDoc } from './types'

/**
 * Adapters from domain records to search documents.
 *
 * These are the only files in `src/lib/search` that know anything about
 * clinics and lawyers. Everything downstream operates on `SearchDoc`.
 *
 * Inputs are structurally typed rather than importing `Clinic`/`Lawyer`,
 * because the professionals and partners APIs deliberately strip `address` and
 * `phone` — the same adapter has to accept both the full record and the
 * contact-free one, and a missing field must be a non-event.
 */

export interface ClinicLike {
  id: string
  name: string
  address?: string
  lat: number
  lng: number
  specialties?: string[] | null
  region?: string | null
  county?: string | null
  available: boolean
  city?: string | null
  state?: string | null
  zipCode?: string | null
}

export interface LawyerLike {
  id: string
  name: string
  address?: string
  lat: number
  lng: number
  practiceAreas?: string[] | null
  region?: string | null
  county?: string | null
  available: boolean
  city?: string | null
  state?: string | null
  zipCode?: string | null
}

/** Generic vocabulary for what a record is, matched at low weight. */
const CLINIC_KIND_WORDS = [
  'clinic', 'clinics', 'provider', 'providers', 'medical', 'doctor',
  'physician', 'health', 'care', 'specialist',
]
const LAWYER_KIND_WORDS = [
  'attorney', 'attorneys', 'lawyer', 'lawyers', 'law', 'firm', 'firms',
  'legal', 'counsel', 'abogado', 'abogados',
]

function uniqueTokens(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!value) continue
    for (const token of tokenize(value)) {
      if (seen.has(token)) continue
      seen.add(token)
      out.push(token)
    }
  }
  return out
}

/**
 * Records at (0,0) are placeholder rows, not real locations.
 *
 * Filtering them at index-build time rather than in each consumer means the
 * rule is enforced once. There is a dedicated e2e spec asserting they never
 * render (`e2e/specs/edge-cases/map-zero-coords-hidden.spec.ts`).
 */
function hasRealCoordinates(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  )
}

export interface DocOptions {
  /**
   * Whether a record must have real coordinates to be indexed. Defaults to
   * true, which is what every map and public list wants.
   *
   * The admin tables pass false: a placeholder row at (0,0) is precisely the
   * record an admin has to find and fix, so making it unsearchable there would
   * hide the problem rather than enforce anything. The default is what keeps
   * those rows off the maps, so flipping it here cannot weaken that rule.
   */
  requireCoordinates?: boolean
  /**
   * Whether to index the generic "what is this" vocabulary — clinic, provider,
   * attorney, law firm. Defaults to true, which is what lets "orlando attorney"
   * pick the firms out of a mixed map.
   *
   * The admin tables pass false, because there the type is already decided by
   * which page you are on: every row in the clinics table is a clinic, so
   * matching that word makes the query select all 696 rows instead of the
   * handful with "Clinic" in their name.
   */
  includeKindWords?: boolean
}

/** Non-finite coordinates would poison distance maths downstream. */
function safeCoord(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function clinicToDoc<T extends ClinicLike>(
  clinic: T,
  options: DocOptions = {}
): SearchDoc<T> | null {
  if (options.requireCoordinates !== false && !hasRealCoordinates(clinic.lat, clinic.lng)) {
    return null
  }

  // Prefer the decorated columns; fall back to parsing the address so the
  // adapter works before the normalization migration has run.
  const parsed = clinic.address ? parseAddress(clinic.address) : null
  const city = clinic.city ?? parsed?.city ?? null
  const state = clinic.state ?? parsed?.state ?? null
  const zip = normalizeZip(clinic.zipCode) ?? parsed?.zip ?? null
  const county = canonicalizeCounty(clinic.county)
  const region = clinic.region ?? null
  const tags = (clinic.specialties ?? []).filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  )

  return {
    id: clinic.id,
    type: 'clinic',
    tokens: {
      name: tokenize(clinic.name),
      specialty: uniqueTokens(tags),
      city: city ? tokenize(city) : [],
      county: county ? tokenize(county) : [],
      region: region ? tokenize(region) : [],
      street: parsed?.street ? tokenize(parsed.street) : [],
      state: state ? [fold(state)] : [],
      kind: options.includeKindWords === false ? [] : CLINIC_KIND_WORDS,
    },
    text: {
      name: fold(clinic.name),
      specialty: fold(tags.join(' ')),
      city: city ? fold(city) : '',
      county: county ? fold(county) : '',
      region: region ? fold(region) : '',
      street: parsed?.street ? fold(parsed.street) : '',
    },
    tags,
    city,
    state,
    zip,
    county,
    region,
    lat: safeCoord(clinic.lat),
    lng: safeCoord(clinic.lng),
    available: clinic.available !== false,
    source: clinic,
  }
}

export function lawyerToDoc<T extends LawyerLike>(
  lawyer: T,
  options: DocOptions = {}
): SearchDoc<T> | null {
  if (options.requireCoordinates !== false && !hasRealCoordinates(lawyer.lat, lawyer.lng)) {
    return null
  }

  const parsed = lawyer.address ? parseAddress(lawyer.address) : null
  // `lawyers.region` holds a CITY name (Orlando, Pensacola, Tampa...), not a
  // region — unlike `clinics.region`. Verified across all 176 rows. It is
  // therefore indexed as a city, and the region field is left empty rather than
  // filled with something that would poison the shared region facet.
  const city = lawyer.city ?? parsed?.city ?? lawyer.region ?? null
  const state = lawyer.state ?? parsed?.state ?? null
  const zip = normalizeZip(lawyer.zipCode) ?? parsed?.zip ?? null
  const county = canonicalizeCounty(lawyer.county)
  const tags = (lawyer.practiceAreas ?? []).filter(
    (a): a is string => typeof a === 'string' && a.length > 0
  )

  return {
    id: lawyer.id,
    type: 'lawyer',
    tokens: {
      name: tokenize(lawyer.name),
      specialty: uniqueTokens(tags),
      city: uniqueTokens([city, lawyer.region]),
      county: county ? tokenize(county) : [],
      region: [],
      street: parsed?.street ? tokenize(parsed.street) : [],
      state: state ? [fold(state)] : [],
      kind: options.includeKindWords === false ? [] : LAWYER_KIND_WORDS,
    },
    text: {
      name: fold(lawyer.name),
      specialty: fold(tags.join(' ')),
      city: city ? fold(city) : '',
      county: county ? fold(county) : '',
      street: parsed?.street ? fold(parsed.street) : '',
    },
    tags,
    city,
    state,
    zip,
    county,
    region: null,
    lat: safeCoord(lawyer.lat),
    lng: safeCoord(lawyer.lng),
    available: lawyer.available !== false,
    source: lawyer,
  }
}

/** Maps a mixed list, dropping records that cannot be indexed. */
export function toSearchDocs<C extends ClinicLike, L extends LawyerLike>(
  clinics: readonly C[],
  lawyers: readonly L[],
  options: DocOptions = {}
): SearchDoc<C | L>[] {
  const docs: SearchDoc<C | L>[] = []
  for (const clinic of clinics) {
    const doc = clinicToDoc(clinic, options)
    if (doc) docs.push(doc as SearchDoc<C | L>)
  }
  for (const lawyer of lawyers) {
    const doc = lawyerToDoc(lawyer, options)
    if (doc) docs.push(doc as SearchDoc<C | L>)
  }
  return docs
}
