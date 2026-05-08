export type UserRole = 'lawyer' | 'clinic' | 'admin' | 'referrer' | 'partner'

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

export interface Referral {
  id: string
  lawyerId: string // lawyers(id) — the firm involved
  lawyerName: string
  lawyerFirm: string
  clinicId: string // clinics(id) — the clinic involved
  clinicName: string
  createdByUserId?: string // users(id) — who initiated
  creatorRole?: ReferralCreatorRole
  patientName: string
  patientPhone: string
  caseType: string
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
