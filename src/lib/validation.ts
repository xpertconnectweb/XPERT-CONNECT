import type { UserRole, ReferralStatus, ReferrerReferralStatus, CaseConfirmedStatus, ServiceNeeded, ReferralKind } from '@/types/professionals'
import { MEDICAL_SPECIALTY_TYPES, type MedicalSpecialtyType } from './medical-specialties'
import { PRACTICE_AREAS, type PracticeArea } from './practice-areas'
import { REFERRAL_STATUSES } from './referral-status'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/
// Matches YYYY-MM-DD (HTML date input format)
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Validates an ISO date string `YYYY-MM-DD` is a real calendar date. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

/**
 * The box every record has to fall inside: the continental US plus Alaska,
 * Hawaii and Puerto Rico. `[south, north, west, east]`.
 *
 * Generous on purpose. This is not a business rule about which states are
 * served — that is `VALID_STATES` — it is a sanity check against a coordinate
 * that cannot be a US address at all.
 */
const US_BOUNDS = { south: 17.5, north: 71.5, west: -180, east: -64 }

export type CoordinateCheck =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: string }

/**
 * Rejects coordinates that cannot be a provider's address.
 *
 * The admin form used to take latitude and longitude as two hand-typed number
 * fields with `parseFloat(e.target.value) || 0` behind them, and the POST
 * handler inserted whatever arrived without looking. So an empty field became
 * 0, and 0, 0 — which is in the Gulf of Guinea — became a clinic. Those rows
 * are still in the table, which is why `hasRealCoordinates` has to filter them
 * out when the search index is built.
 *
 * That filter stays as defence in depth for the legacy rows. This is the fix:
 * no new ones.
 */
export function validateCoordinates(lat: unknown, lng: unknown): CoordinateCheck {
  const latNum = typeof lat === 'number' ? lat : Number(lat)
  const lngNum = typeof lng === 'number' ? lng : Number(lng)

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return { ok: false, reason: 'Latitude and longitude must be numbers' }
  }
  // The specific case that produced the bad rows, called out by name so the
  // admin sees why rather than a generic range error.
  if (latNum === 0 && lngNum === 0) {
    return {
      ok: false,
      reason: 'Coordinates are 0, 0 — pick an address from the suggestions, or set them manually',
    }
  }
  if (
    latNum < US_BOUNDS.south ||
    latNum > US_BOUNDS.north ||
    lngNum < US_BOUNDS.west ||
    lngNum > US_BOUNDS.east
  ) {
    return { ok: false, reason: 'Coordinates are outside the United States' }
  }
  return { ok: true, lat: latNum, lng: lngNum }
}

export const VALID_ROLES: UserRole[] = ['lawyer', 'clinic', 'admin', 'referrer', 'partner', 'directory']
// The lifecycle itself lives in `referral-status.ts`; this alias is the name
// every write path already checks against.
export const VALID_REFERRAL_STATUSES: readonly ReferralStatus[] = REFERRAL_STATUSES
export const VALID_REFERRER_STATUSES: ReferrerReferralStatus[] = ['pending', 'assigned', 'in_process', 'completed']
export const VALID_CASE_CONFIRMED: CaseConfirmedStatus[] = ['pending', 'confirmed']
export const VALID_SERVICES: ServiceNeeded[] = ['clinic', 'lawyer', 'both']
export const VALID_STATES = ['FL', 'MN'] as const
export const VALID_REFERRAL_KINDS: ReferralKind[] = ['lawyer', 'medical_specialist']
export const VALID_MEDICAL_SPECIALTIES: readonly MedicalSpecialtyType[] = MEDICAL_SPECIALTY_TYPES
export const VALID_PRACTICE_AREAS: readonly PracticeArea[] = PRACTICE_AREAS

export const REFERRAL_MUTABLE_FIELDS = [
  'status',
  'insuranceCompany',
  'claimNumber',
  'adjusterName',
  'adjusterPhone',
  'adjusterEmail',
] as const
export type ReferralMutableField = typeof REFERRAL_MUTABLE_FIELDS[number]
