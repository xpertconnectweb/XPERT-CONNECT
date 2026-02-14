import { supabaseAdmin } from './supabase'
import { rowToModel, rowsToModels, modelToRow } from './mappers'
import type { User, Clinic, Referral } from '@/types/professionals'

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
