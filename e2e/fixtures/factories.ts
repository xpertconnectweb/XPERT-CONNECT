import { test as base, type TestInfo } from '@playwright/test'
import { createServiceClient } from '../helpers/supabase-admin'
import { makeNamespace, rand } from '../helpers/namespace'

type CreatedRecord = { table: string; id: string }

type Factories = {
  ns: string
  createClinic: (overrides?: Partial<ClinicInput>) => Promise<ClinicRow>
  createLawyer: (overrides?: Partial<LawyerInput>) => Promise<LawyerRow>
  createUser: (overrides?: Partial<UserInput>) => Promise<UserRow>
  createReferral: (overrides?: Partial<ReferralInput>) => Promise<ReferralRow>
  createReferrerReferral: (
    overrides?: Partial<ReferrerReferralInput>,
  ) => Promise<ReferrerReferralRow>
  createContact: (overrides?: Partial<ContactInput>) => Promise<ContactRow>
}

export interface ClinicInput {
  id?: string
  name?: string
  address?: string
  lat?: number
  lng?: number
  phone?: string
  email?: string
  specialties?: string[]
  available?: boolean
  state?: string
}
export type ClinicRow = ClinicInput & { id: string; name: string }

export interface LawyerInput {
  id?: string
  name?: string
  address?: string
  lat?: number
  lng?: number
  phone?: string
  email?: string
  practiceAreas?: string[]
  available?: boolean
  state?: string
}
export type LawyerRow = LawyerInput & { id: string; name: string }

export interface UserInput {
  id?: string
  username?: string
  // The `users` table column is `password` (bcrypt hash stored directly),
  // not `password_hash` — see src/lib/data.ts USER_COLUMNS and src/lib/auth.ts.
  password?: string
  role?: 'admin' | 'lawyer' | 'clinic' | 'referrer' | 'partner'
  email?: string
  name?: string
  lawyer_id?: string | null
  clinic_id?: string | null
}
export type UserRow = UserInput & { id: string; username: string }

export interface ReferralInput {
  id?: string
  referral_kind?: 'lawyer' | 'clinic'
  clinic_id?: string | null
  lawyer_id?: string | null
  target_clinic_id?: string | null
  patient_name?: string
  patient_phone?: string
  case_type?: string
  status?: string
  created_by_user_id?: string
  creator_role?: string
  notes?: string | null
}
export type ReferralRow = ReferralInput & { id: string; patient_name: string }

/**
 * `referrer_referrals` is a different table from `referrals`, and it is the one
 * the partner portal reads: `/api/partners/referrals` serves
 * `getReferrerReferralsByReferrer(session.user.id)`. A row is only visible to
 * the partner whose id is in `referrer_id`, which is why `referrerId` has no
 * default worth guessing — pass `process.env.E2E_PARTNER_USER_ID`.
 */
export interface ReferrerReferralInput {
  id?: string
  referrerId?: string
  referrerName?: string
  state?: string
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  clientAddress?: string
  serviceNeeded?: 'clinic' | 'lawyer' | 'both'
  caseType?: string
  status?: 'pending' | 'assigned' | 'in_process' | 'completed'
  caseConfirmed?: 'pending' | 'confirmed'
  notes?: string
}
export type ReferrerReferralRow = ReferrerReferralInput & {
  id: string
  client_name: string
}

export interface ContactInput {
  id?: string
  name?: string
  email?: string
  phone?: string
  message?: string
  service?: string
}
export type ContactRow = ContactInput & { id: string; name: string }

export const test = base.extend<Factories>({
  ns: async ({}, use, testInfo: TestInfo) => {
    await use(makeNamespace(testInfo))
  },

  createClinic: async ({ ns }, use) => {
    const tracked: CreatedRecord[] = []
    const supabase = createServiceClient()
    const create = async (overrides: Partial<ClinicInput> = {}): Promise<ClinicRow> => {
      const id = overrides.id ?? `${ns}c-${rand()}`
      const payload = {
        id,
        name: overrides.name ?? `${ns}clinic`,
        address: overrides.address ?? '1 E2E St, Miami, FL 33101',
        lat: overrides.lat ?? 25.7617,
        lng: overrides.lng ?? -80.1918,
        phone: overrides.phone ?? '305-555-0000',
        email: overrides.email ?? `${ns}clinic@e2e.test`,
        specialties: overrides.specialties ?? ['Chiropractic'],
        available: overrides.available ?? true,
      }
      const { data, error } = await supabase
        .from('clinics')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(`createClinic: ${error.message}`)
      tracked.push({ table: 'clinics', id: data.id })
      return data as ClinicRow
    }
    await use(create)
    for (const r of tracked.reverse()) {
      await supabase.from(r.table).delete().eq('id', r.id)
    }
  },

  createLawyer: async ({ ns }, use) => {
    const tracked: CreatedRecord[] = []
    const supabase = createServiceClient()
    const create = async (overrides: Partial<LawyerInput> = {}): Promise<LawyerRow> => {
      const id = overrides.id ?? `${ns}l-${rand()}`
      const payload = {
        id,
        name: overrides.name ?? `${ns}firm`,
        address: overrides.address ?? '1 E2E Law St, Miami, FL 33101',
        lat: overrides.lat ?? 25.7617,
        lng: overrides.lng ?? -80.1918,
        phone: overrides.phone ?? '305-555-1111',
        email: overrides.email ?? `${ns}firm@e2e.test`,
        practice_areas: overrides.practiceAreas ?? ['Personal Injury'],
        available: overrides.available ?? true,
      }
      const { data, error } = await supabase
        .from('lawyers')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(`createLawyer: ${error.message}`)
      tracked.push({ table: 'lawyers', id: data.id })
      return data as LawyerRow
    }
    await use(create)
    for (const r of tracked.reverse()) {
      await supabase.from(r.table).delete().eq('id', r.id)
    }
  },

  createUser: async ({ ns }, use) => {
    const tracked: CreatedRecord[] = []
    const supabase = createServiceClient()
    const create = async (overrides: Partial<UserInput> = {}): Promise<UserRow> => {
      const id = overrides.id ?? `${ns}u-${rand()}`
      const payload = {
        id,
        username: overrides.username ?? `${ns}user-${rand(4)}`,
        password:
          overrides.password ??
          '$2b$10$abcdefghijklmnopqrstuvwxyz012345678901234567890abcd',
        role: overrides.role ?? 'lawyer',
        email: overrides.email ?? `${ns}user@e2e.test`,
        name: overrides.name ?? `${ns}user`,
        lawyer_id: overrides.lawyer_id ?? null,
        clinic_id: overrides.clinic_id ?? null,
      }
      const { data, error } = await supabase
        .from('users')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(`createUser: ${error.message}`)
      tracked.push({ table: 'users', id: data.id })
      return data as UserRow
    }
    await use(create)
    for (const r of tracked.reverse()) {
      await supabase.from(r.table).delete().eq('id', r.id)
    }
  },

  createReferral: async ({ ns }, use) => {
    const tracked: CreatedRecord[] = []
    const supabase = createServiceClient()
    const create = async (
      overrides: Partial<ReferralInput> = {},
    ): Promise<ReferralRow> => {
      const id = overrides.id ?? `${ns}r-${rand()}`
      // `referrals` has NOT NULL `clinic_name` (and `lawyer_name` is required
      // by the data layer's REFERRAL_COLUMNS shape) — see src/lib/data.ts.
      // Look the names up from the FK columns so callers don't have to pass
      // duplicate display strings.
      let clinicName = ''
      let lawyerName = ''
      if (overrides.clinic_id) {
        const { data: c } = await supabase
          .from('clinics')
          .select('name')
          .eq('id', overrides.clinic_id)
          .single()
        clinicName = c?.name ?? `${ns}clinic-fallback`
      } else {
        clinicName = `${ns}clinic-fallback`
      }
      if (overrides.lawyer_id) {
        const { data: l } = await supabase
          .from('lawyers')
          .select('name')
          .eq('id', overrides.lawyer_id)
          .single()
        lawyerName = l?.name ?? `${ns}firm-fallback`
      } else {
        lawyerName = `${ns}firm-fallback`
      }
      const payload = {
        id,
        referral_kind: overrides.referral_kind ?? 'lawyer',
        clinic_id: overrides.clinic_id ?? null,
        clinic_name: clinicName,
        lawyer_id: overrides.lawyer_id ?? null,
        lawyer_name: lawyerName,
        target_clinic_id: overrides.target_clinic_id ?? null,
        patient_name: overrides.patient_name ?? `${ns}patient`,
        patient_phone: overrides.patient_phone ?? '305-555-2222',
        case_type: overrides.case_type ?? 'Auto Accident',
        status: overrides.status ?? 'received',
        created_by_user_id: overrides.created_by_user_id ?? null,
        creator_role: overrides.creator_role ?? 'clinic',
        notes: overrides.notes ?? '',
      }
      const { data, error } = await supabase
        .from('referrals')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(`createReferral: ${error.message}`)
      tracked.push({ table: 'referrals', id: data.id })
      return data as ReferralRow
    }
    await use(create)
    for (const r of tracked.reverse()) {
      await supabase.from(r.table).delete().eq('id', r.id)
    }
  },

  createReferrerReferral: async ({ ns }, use) => {
    const tracked: CreatedRecord[] = []
    const supabase = createServiceClient()
    const create = async (
      overrides: Partial<ReferrerReferralInput> = {},
    ): Promise<ReferrerReferralRow> => {
      const referrerId = overrides.referrerId ?? process.env.E2E_PARTNER_USER_ID
      if (!referrerId) {
        throw new Error(
          'createReferrerReferral needs a referrerId: pass one, or rely on ' +
            'E2E_PARTNER_USER_ID which global.setup.ts resolves.',
        )
      }
      const id = overrides.id ?? `${ns}rr-${rand()}`
      const payload = {
        id,
        referrer_id: referrerId,
        referrer_name: overrides.referrerName ?? `${ns}partner`,
        state: overrides.state ?? 'FL',
        client_name: overrides.clientName ?? `${ns}client`,
        client_phone: overrides.clientPhone ?? '305-555-4444',
        client_email: overrides.clientEmail ?? `${ns}client@e2e.test`,
        // NOT NULL with no default, unlike client_email.
        client_address: overrides.clientAddress ?? '1 E2E Ave, Miami, FL 33101',
        service_needed: overrides.serviceNeeded ?? 'both',
        case_type: overrides.caseType ?? 'Auto Accident',
        status: overrides.status ?? 'pending',
        case_confirmed: overrides.caseConfirmed ?? 'pending',
        notes: overrides.notes ?? '',
      }
      const { data, error } = await supabase
        .from('referrer_referrals')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(`createReferrerReferral: ${error.message}`)
      tracked.push({ table: 'referrer_referrals', id: data.id })
      return data as ReferrerReferralRow
    }
    await use(create)
    // Must go before the user it points at: referrer_id is a FK to users(id).
    for (const r of tracked.reverse()) {
      await supabase.from(r.table).delete().eq('id', r.id)
    }
  },

  createContact: async ({ ns }, use) => {
    const tracked: CreatedRecord[] = []
    const supabase = createServiceClient()
    const create = async (
      overrides: Partial<ContactInput> = {},
    ): Promise<ContactRow> => {
      const payload = {
        name: overrides.name ?? `${ns}contact`,
        email: overrides.email ?? `${ns}contact@e2e.test`,
        phone: overrides.phone ?? '305-555-3333',
        message: overrides.message ?? 'E2E test message',
        service: overrides.service ?? 'Residential Cleaning',
      }
      const { data, error } = await supabase
        .from('contacts')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(`createContact: ${error.message}`)
      tracked.push({ table: 'contacts', id: data.id })
      return data as ContactRow
    }
    await use(create)
    for (const r of tracked.reverse()) {
      await supabase.from(r.table).delete().eq('id', r.id)
    }
  },
})

export { expect } from '@playwright/test'
