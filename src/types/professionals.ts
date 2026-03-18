export type UserRole = 'lawyer' | 'clinic' | 'admin'

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
