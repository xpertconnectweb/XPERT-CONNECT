import { supabaseAdmin } from './supabase'
import { rowToModel, rowsToModels, modelToRow } from './mappers'
import type { User, Clinic, Lawyer, Referral, ReferrerReferral, Contact, NewsletterSubscriber } from '@/types/professionals'

export type { Contact, NewsletterSubscriber }

const USER_COLUMNS = 'id, username, password, name, role, clinic_id, lawyer_id, firm_name, email, state'
const REFERRAL_COLUMNS = 'id, lawyer_id, lawyer_name, lawyer_firm, clinic_id, clinic_name, created_by_user_id, creator_role, patient_name, patient_phone, case_type, coverage, pip, insurance_company, claim_number, adjuster_name, adjuster_phone, adjuster_email, notes, status, created_at, updated_at'

// Users
export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
  if (error) {
    console.error('getUsers error:', error)
    return []
  }
  return rowsToModels<User>(data)
}

export async function getUserByUsername(
  username: string
): Promise<User | undefined> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
    .eq('username', username)
    .single()
  if (error || !data) return undefined
  return rowToModel<User>(data)
}

// Clinics
export async function getClinics(): Promise<Clinic[]> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('id, name, address, lat, lng, phone, specialties, email, website, region, county, available')
  if (error) {
    console.error('getClinics error:', error)
    return []
  }
  return rowsToModels<Clinic>(data)
}

export async function getClinicsByState(state: string): Promise<Clinic[]> {
  // State abbreviation pattern in address: ", FL " or ", MN "
  const pattern = `%, ${state} %`
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('id, name, address, lat, lng, phone, specialties, email, website, region, county, available')
    .ilike('address', pattern)
  if (error) {
    console.error('getClinicsByState error:', error)
    return []
  }
  return rowsToModels<Clinic>(data)
}

export async function getClinicById(
  id: string
): Promise<Clinic | undefined> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('id, name, address, lat, lng, phone, specialties, email, website, region, county, available')
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return rowToModel<Clinic>(data)
}

// Lawyers
const LAWYER_COLUMNS = 'id, name, address, lat, lng, phone, practice_areas, email, website, region, county, zip_code, available'

export async function getLawyers(): Promise<Lawyer[]> {
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .select(LAWYER_COLUMNS)
  if (error) {
    console.error('getLawyers error:', error)
    return []
  }
  return rowsToModels<Lawyer>(data)
}

export async function getLawyersByState(state: string): Promise<Lawyer[]> {
  const pattern = `%, ${state} %`
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .select(LAWYER_COLUMNS)
    .ilike('address', pattern)
  if (error) {
    console.error('getLawyersByState error:', error)
    return []
  }
  return rowsToModels<Lawyer>(data)
}

export async function getLawyerById(id: string): Promise<Lawyer | undefined> {
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .select(LAWYER_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return rowToModel<Lawyer>(data)
}

export async function createLawyer(lawyer: Lawyer): Promise<Lawyer> {
  const row = modelToRow(lawyer)
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .insert(row)
    .select()
    .single()
  if (error) {
    console.error('createLawyer error:', error)
    throw new Error('Failed to create lawyer')
  }
  return rowToModel<Lawyer>(data)
}

export async function updateLawyer(
  id: string,
  fields: Partial<Omit<Lawyer, 'id'>>
): Promise<Lawyer | null> {
  const row = modelToRow(fields)
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .update(row)
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    console.error('updateLawyer error:', error)
    return null
  }
  return rowToModel<Lawyer>(data)
}

export async function deleteLawyer(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('lawyers').delete().eq('id', id)
  if (error) {
    console.error('deleteLawyer error:', error)
    return false
  }
  return true
}

// Referrals
export async function getReferrals(): Promise<Referral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select(REFERRAL_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getReferrals error:', error)
    return []
  }
  return rowsToModels<Referral>(data)
}

/**
 * Returns all referrals where the given lawyer ENTITY (firm) is involved.
 * `lawyerEntityId` must be a `lawyers.id` — a lawyer USER's id won't match.
 *
 * Lawyer users are linked to their firm via `users.lawyer_id`; pass
 * `session.user.lawyerId` (NOT `session.user.id`).
 */
export async function getReferralsByLawyerEntity(
  lawyerEntityId: string
): Promise<Referral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select(REFERRAL_COLUMNS)
    .eq('lawyer_id', lawyerEntityId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getReferralsByLawyerEntity error:', error)
    return []
  }
  return rowsToModels<Referral>(data)
}

export async function getReferralsByClinic(
  clinicId: string
): Promise<Referral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select(REFERRAL_COLUMNS)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getReferralsByClinic error:', error)
    return []
  }
  return rowsToModels<Referral>(data)
}

export async function getReferralById(
  id: string
): Promise<Referral | undefined> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select(REFERRAL_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return rowToModel<Referral>(data)
}

export async function createReferral(referral: Referral): Promise<Referral> {
  const row = modelToRow(referral)
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .insert(row)
    .select()
    .single()
  if (error) {
    console.error('createReferral error:', error)
    throw new Error('Failed to create referral')
  }
  return rowToModel<Referral>(data)
}

export async function updateReferralStatus(
  id: string,
  status: Referral['status']
): Promise<Referral | null> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    console.error('updateReferralStatus error:', error)
    return null
  }
  return rowToModel<Referral>(data)
}

export type ReferralPatch = Partial<Pick<Referral,
  'status' | 'insuranceCompany' | 'claimNumber' |
  'adjusterName' | 'adjusterPhone' | 'adjusterEmail'
>>

export async function updateReferralFields(
  id: string,
  patch: ReferralPatch
): Promise<Referral | null> {
  // updated_at is set by the trg_referrals_updated_at trigger.
  const row = modelToRow(patch)
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .update(row)
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    console.error('updateReferralFields error:', error)
    return null
  }
  return rowToModel<Referral>(data)
}

// Get clinic users linked to a specific clinic
export async function getUsersByClinicId(clinicId: string): Promise<User[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
    .eq('clinic_id', clinicId)
    .eq('role', 'clinic')
  if (error || !data) return []
  return rowsToModels<User>(data)
}

// Get lawyer users linked to a specific lawyer entity (firm)
export async function getLawyerUsersByEntityId(lawyerEntityId: string): Promise<User[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
    .eq('lawyer_id', lawyerEntityId)
    .eq('role', 'lawyer')
  if (error || !data) return []
  return rowsToModels<User>(data)
}

// Admin: User CRUD
export async function getUserById(id: string): Promise<User | undefined> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return rowToModel<User>(data)
}

export async function createUser(user: User): Promise<User> {
  const row = modelToRow(user)
  const { data, error } = await supabaseAdmin
    .from('users')
    .insert(row)
    .select()
    .single()
  if (error) {
    console.error('createUser error:', error)
    throw new Error('Failed to create user')
  }
  return rowToModel<User>(data)
}

export async function updateUser(
  id: string,
  fields: Partial<Omit<User, 'id'>>
): Promise<User | null> {
  const row = modelToRow(fields)
  const { data, error } = await supabaseAdmin
    .from('users')
    .update(row)
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    console.error('updateUser error:', error)
    return null
  }
  return rowToModel<User>(data)
}

export async function deleteUser(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('users').delete().eq('id', id)
  if (error) {
    console.error('deleteUser error:', error)
    return false
  }
  return true
}

// Admin: Contacts
export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('id, name, email, phone, service, message, created_at')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getContacts error:', error)
    return []
  }
  return rowsToModels<Contact>(data)
}

// Admin: Newsletter Subscribers
export async function getNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
  const { data, error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select('id, email, subscribed_at')
    .order('subscribed_at', { ascending: false })
  if (error) {
    console.error('getNewsletterSubscribers error:', error)
    return []
  }
  return rowsToModels<NewsletterSubscriber>(data)
}

// Referrer Referrals
const RREF_COLUMNS = 'id, referrer_id, referrer_name, state, client_name, client_phone, client_email, client_address, service_needed, case_type, notes, status, assigned_clinic_id, assigned_clinic_name, assigned_lawyer_id, assigned_lawyer_name, case_confirmed, admin_notes, created_at, updated_at'

export async function getReferrerReferrals(): Promise<ReferrerReferral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrer_referrals')
    .select(RREF_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getReferrerReferrals error:', error)
    return []
  }
  return rowsToModels<ReferrerReferral>(data)
}

export async function getReferrerReferralsByReferrer(referrerId: string): Promise<ReferrerReferral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrer_referrals')
    .select(RREF_COLUMNS)
    .eq('referrer_id', referrerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getReferrerReferralsByReferrer error:', error)
    return []
  }
  return rowsToModels<ReferrerReferral>(data)
}

export async function getReferrerReferralById(id: string): Promise<ReferrerReferral | undefined> {
  const { data, error } = await supabaseAdmin
    .from('referrer_referrals')
    .select(RREF_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return rowToModel<ReferrerReferral>(data)
}

export async function createReferrerReferral(referral: ReferrerReferral): Promise<ReferrerReferral> {
  const row = modelToRow(referral)
  const { data, error } = await supabaseAdmin
    .from('referrer_referrals')
    .insert(row)
    .select()
    .single()
  if (error) {
    console.error('createReferrerReferral error:', error)
    throw new Error('Failed to create referrer referral')
  }
  return rowToModel<ReferrerReferral>(data)
}

export async function updateReferrerReferral(
  id: string,
  fields: Partial<Omit<ReferrerReferral, 'id'>>
): Promise<ReferrerReferral | null> {
  const row = modelToRow(fields)
  const { data, error } = await supabaseAdmin
    .from('referrer_referrals')
    .update(row)
    .eq('id', id)
    .select()
    .single()
  if (error || !data) {
    console.error('updateReferrerReferral error:', error)
    return null
  }
  return rowToModel<ReferrerReferral>(data)
}

export async function deleteReferrerReferral(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('referrer_referrals').delete().eq('id', id)
  if (error) {
    console.error('deleteReferrerReferral error:', error)
    return false
  }
  return true
}
