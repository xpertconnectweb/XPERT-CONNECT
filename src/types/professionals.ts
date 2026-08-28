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

  // SMS referral alerts. Set only by the user themselves, through
  // /api/me/* — there is deliberately no admin path that grants
  // these, because consent typed in by a third party is not consent.
  phoneE164?: string // E.164, normalized on write by toE164Us
  phoneVerifiedAt?: string // ownership proven by a 6-digit code
  smsReferralAlerts?: boolean // the switch itself; defaults FALSE in the DB
  smsConsentAt?: string
  smsConsentVersion?: string
  smsConsentText?: string // the literal text agreed to — see lib/sms/consent.ts
  smsLastSentAt?: string // per-user throttle, also a cost guard
}

/**
 * A user as the admin panel may see them.
 *
 * `password` was always stripped; `phoneE164` must be too. The admin
 * table has no legitimate use for whole mobile numbers, and it is the
 * one screen where a single session could export every user's phone.
 */
export type AdminSafeUser = Omit<User, 'password' | 'phoneE164'> & {
  phoneLast4?: string
  phoneVerified: boolean
  smsOptedOut?: boolean
}

/**
 * The address columns added by `2026-08-structured-addresses.sql`.
 *
 * All optional, all nullable, and no defaults in the database either. NULL is
 * the signal that the backfill has not reached this row yet, which is what lets
 * `decorateClinic` fall back to `parseAddress` and lets the migration and the
 * deploy happen at different times.
 *
 * `placeProvider` travels with `placeId` because a place id is meaningless to a
 * provider that did not issue it, and the failure is silent: a Google id handed
 * to Mapbox is simply not found, so the row quietly stops refreshing.
 */
export interface StoredAddress {
  /** House number and street. Withheld from the public API — see PublicClinic. */
  street?: string | null
  city?: string | null
  /** Two-letter code, e.g. 'FL'. */
  state?: string | null
  placeId?: string | null
  placeProvider?: string | null
  geocodePrecision?: string | null
  geocodedAt?: string | null
}

export interface Clinic extends StoredAddress {
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
  zipCode?: string | null
  available: boolean
}

export interface Lawyer extends StoredAddress {
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
 * contact the provider directly. See `toPublicClinic` in
 * `src/lib/api/public-shape.ts` for the single definition of that boundary.
 *
 * `street` is in this list and has to stay there. It arrived as a column in
 * `2026-08-structured-addresses.sql`, and because `toPublicClinic` works by
 * destructuring the withheld fields out and spreading the rest, a new column is
 * PUBLIC BY DEFAULT — adding `street` without adding it here would have
 * published the exact detail the withholding exists to hide, silently, on three
 * routes, while the comment above `toPublicClinic` went on claiming otherwise.
 *
 * The geocode metadata is withheld for a duller reason: it is internal
 * bookkeeping, and there is no client that needs it.
 */
type WithheldFromPublic =
  | 'phone'
  | 'address'
  | 'street'
  | 'placeId'
  | 'placeProvider'
  | 'geocodePrecision'
  | 'geocodedAt'

export type PublicClinic = Omit<DecoratedClinic, WithheldFromPublic>
export type PublicLawyer = Omit<DecoratedLawyer, WithheldFromPublic>

// The referral lifecycle is defined once, in `src/lib/referral-status.ts`,
// alongside its labels and colours. Imported here for `Referral.status` below
// and re-exported so the modules that already take the type from this file
// keep working.
import type { ReferralStatus } from '@/lib/referral-status'
import type { CaseConfirmedValue } from '@/lib/case-confirmed'
export type { ReferralStatus }

// As of 2026-12 the partner table runs the SAME five-stage medical lifecycle as
// `referrals`. The alias is kept rather than collapsed at the call sites because
// it still says WHICH column a value came from, and the two tables can diverge
// later without a repo-wide rename. Whether a partner referral has been ROUTED
// to a provider is not a status — see `assignedClinicId` / `assignedLawyerId`.
export type ReferrerReferralStatus = ReferralStatus
export type CaseConfirmedStatus = CaseConfirmedValue
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
  // Nullable in the DB, and the admin PATCH route writes literal `null` to
  // clear an assignment. These four are what "awaiting assignment" is read off.
  assignedClinicId?: string | null
  assignedClinicName?: string | null
  assignedLawyerId?: string | null
  assignedLawyerName?: string | null
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
