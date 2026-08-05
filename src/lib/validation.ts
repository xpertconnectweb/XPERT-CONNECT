import type { UserRole, ReferralStatus, ReferrerReferralStatus, CaseConfirmedStatus, ServiceNeeded, ReferralKind } from '@/types/professionals'
import { MEDICAL_SPECIALTY_TYPES, type MedicalSpecialtyType } from './medical-specialties'
import { PRACTICE_AREAS, type PracticeArea } from './practice-areas'

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

export const VALID_ROLES: UserRole[] = ['lawyer', 'clinic', 'admin', 'referrer', 'partner', 'directory']
export const VALID_REFERRAL_STATUSES: ReferralStatus[] = ['received', 'in_process', 'attended']
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
