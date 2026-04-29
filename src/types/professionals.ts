export type UserRole = 'lawyer' | 'clinic' | 'admin' | 'referrer' | 'partner'

export interface User {
  id: string
  username: string
  password: string // bcrypt hash
  name: string
  role: UserRole
  clinicId?: string // only for clinic users
  firmName?: string // only for lawyer users
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

export interface Referral {
  id: string
  lawyerId: string
  lawyerName: string
  lawyerFirm: string
  clinicId: string
  clinicName: string
  patientName: string
  patientPhone: string
  caseType: string
  coverage: string
  pip: string
  notes: string
  status: ReferralStatus
  createdAt: string
  updatedAt: string
}
