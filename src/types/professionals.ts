export type UserRole = 'lawyer' | 'clinic' | 'admin' | 'referrer' | 'partner' | 'directory'

export interface Contact {
  id: number
  name: string
  email: string
  phone: string
  service: string
  message: string
  createdAt: string
}

export interface NewsletterSubscriber {
  id: number
  email: string
  subscribedAt: string
}

export interface User {
  id: string
  username: string
  password: string // bcrypt hash
  name: string
  role: UserRole
  clinicId?: string // only for clinic users — links to clinics(id)
  lawyerId?: string // only for lawyer users — links to lawyers(id) (firm)
  firmName?: string // legacy free-form firm name (now denormalized from lawyers.name when linked)
  email: string
  state?: string // state filter for lawyers (e.g. 'FL', 'MN')
}

export interface Clinic {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  specialties: string[]
  email: string
  website?: string
  region?: string
  county?: string
  available: boolean
}

export interface Lawyer {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  practiceAreas: string[]
  email: string
  website?: string
  region?: string
  county?: string
  zipCode?: string
  available: boolean
}

/**
 * Geography derived from the free-text `address` on the read path.
 *
 * Neither table stores city/state/ZIP as columns, so these are parsed by
 * `parseAddress` in `src/lib/data.ts` and attached to every record leaving the
 * data layer. That is what makes search by ZIP or city possible at all.
 *
 * Deliberately a separate type rather than extra optional fields on `Clinic` /
 * `Lawyer`: those two interfaces have ~30 consumers plus their own tests, and
 * none of them should have to care that this exists.
 */
export interface DerivedLocation {
  city?: string | null
  /** Two-letter code parsed from the address, e.g. 'FL'. */
  state?: string | null
  zipCode?: string | null
}

export type DecoratedClinic = Clinic & DerivedLocation
export type DecoratedLawyer = Lawyer & DerivedLocation

/**
 * What the professionals and partners APIs return: coarse location, no way to
 * contact the provider directly. See `stripContactInfo` in
 * `src/lib/api/public-shape.ts` for the single definition of that boundary.
 */
export type PublicClinic = Omit<DecoratedClinic, 'phone' | 'address'>
export type PublicLawyer = Omit<DecoratedLawyer, 'phone' | 'address'>

export type ReferralStatus = 'received' | 'in_process' | 'attended'

export type ReferrerReferralStatus = 'pending' | 'assigned' | 'in_process' | 'completed'
export type CaseConfirmedStatus = 'pending' | 'confirmed'
export type ServiceNeeded = 'clinic' | 'lawyer' | 'both'

export interface ReferrerReferral {
  id: string
  referrerId: string
  referrerName: string
  state: string
  clientName: string
  clientPhone: string
  clientEmail: string
  clientAddress: string
  serviceNeeded: ServiceNeeded
  caseType: string
  accidentDate?: string // ISO date (YYYY-MM-DD); plain DATE in DB
  notes: string
  status: ReferrerReferralStatus
  assignedClinicId?: string
  assignedClinicName?: string
  assignedLawyerId?: string
  assignedLawyerName?: string
  caseConfirmed: CaseConfirmedStatus
  adminNotes: string
  createdAt: string
  updatedAt: string
}

export type ReferralCreatorRole = 'lawyer' | 'clinic' | 'admin'

export type ReferralKind = 'lawyer' | 'medical_specialist'

export interface Referral {
  id: string
  referralKind: ReferralKind
  lawyerId: string | null // lawyers(id) — null for medical-specialist referrals
  lawyerName: string | null
  lawyerFirm: string | null
  clinicId: string // clinics(id) — the SOURCE clinic
  clinicName: string
  targetClinicId?: string | null // destination clinic for medical referrals
  targetClinicName?: string | null
  specialistType?: string | null // e.g. "Orthopedist", "Neurologist"
  createdByUserId?: string // users(id) — who initiated
  creatorRole?: ReferralCreatorRole
  patientName: string
  patientPhone: string
  caseType: string
  accidentDate?: string // ISO date (YYYY-MM-DD); plain DATE in DB
  coverage?: string
  pip?: string
  insuranceCompany?: string
  claimNumber?: string
  adjusterName?: string
  adjusterPhone?: string
  adjusterEmail?: string
  notes: string
  status: ReferralStatus
  createdAt: string
  updatedAt: string
}
