import { supabaseAdmin } from './supabase'
import { rowToModel, rowsToModels, modelToRow } from './mappers'
import type { User, Clinic, Referral } from '@/types/professionals'

// Contact / Newsletter types
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

// Users
export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabaseAdmin.from('users').select('*')
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
    .select('*')
    .eq('username', username)
    .single()
  if (error || !data) return undefined
  return rowToModel<User>(data)
}

// Clinics
export async function getClinics(): Promise<Clinic[]> {
  const { data, error } = await supabaseAdmin.from('clinics').select('*')
  if (error) {
    console.error('getClinics error:', error)
    return []
  }
  return rowsToModels<Clinic>(data)
}

export async function getClinicById(
  id: string
): Promise<Clinic | undefined> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return rowToModel<Clinic>(data)
}

// Referrals
export async function getReferrals(): Promise<Referral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getReferrals error:', error)
    return []
  }
  return rowsToModels<Referral>(data)
}

export async function getReferralsByLawyer(
  lawyerId: string
): Promise<Referral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select('*')
    .eq('lawyer_id', lawyerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('getReferralsByLawyer error:', error)
    return []
  }
  return rowsToModels<Referral>(data)
}

export async function getReferralsByClinic(
  clinicId: string
): Promise<Referral[]> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select('*')
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
    .select('*')
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

// Get clinic users linked to a specific clinic
export async function getUsersByClinicId(clinicId: string): Promise<User[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('role', 'clinic')
  if (error || !data) return []
  return rowsToModels<User>(data)
}

// Admin: User CRUD
export async function getUserById(id: string): Promise<User | undefined> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
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
    .select('*')
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
    .select('*')
    .order('subscribed_at', { ascending: false })
  if (error) {
    console.error('getNewsletterSubscribers error:', error)
    return []
  }
  return rowsToModels<NewsletterSubscriber>(data)
}
