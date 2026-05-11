import type { UserRole, ReferralStatus, ReferrerReferralStatus, CaseConfirmedStatus, ServiceNeeded, ReferralKind } from '@/types/professionals'
import { MEDICAL_SPECIALTY_TYPES, type MedicalSpecialtyType } from './medical-specialties'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/

export const VALID_ROLES: UserRole[] = ['lawyer', 'clinic', 'admin', 'referrer', 'partner']
export const VALID_REFERRAL_STATUSES: ReferralStatus[] = ['received', 'in_process', 'attended']
export const VALID_REFERRER_STATUSES: ReferrerReferralStatus[] = ['pending', 'assigned', 'in_process', 'completed']
export const VALID_CASE_CONFIRMED: CaseConfirmedStatus[] = ['pending', 'confirmed']
export const VALID_SERVICES: ServiceNeeded[] = ['clinic', 'lawyer', 'both']
export const VALID_STATES = ['FL', 'MN'] as const
export const VALID_REFERRAL_KINDS: ReferralKind[] = ['lawyer', 'medical_specialist']
export const VALID_MEDICAL_SPECIALTIES: readonly MedicalSpecialtyType[] = MEDICAL_SPECIALTY_TYPES

export const REFERRAL_MUTABLE_FIELDS = [
  'status',
  'insuranceCompany',
  'claimNumber',
  'adjusterName',
  'adjusterPhone',
  'adjusterEmail',
] as const
export type ReferralMutableField = typeof REFERRAL_MUTABLE_FIELDS[number]
