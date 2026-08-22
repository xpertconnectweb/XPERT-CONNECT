import { supabaseAdmin } from './supabase'
import { rowToModel, rowsToModels, modelToRow } from './mappers'
import { resolveCatalog } from './practice-areas'
import { parseAddress } from './address'
import { canonicalizeCounty } from './counties'
import { sanitizeRegion } from './regions'
import { sanitizeSpecialties } from './clinic-specialties'
import { normalizeZip } from './search/text'
import type { User, Clinic, Lawyer, Referral, ReferrerReferral, Contact, NewsletterSubscriber, DecoratedClinic, DecoratedLawyer } from '@/types/professionals'

export type { Contact, NewsletterSubscriber }

const USER_COLUMNS = 'id, username, password, name, role, clinic_id, lawyer_id, firm_name, email, state'
const REFERRAL_COLUMNS = 'id, referral_kind, lawyer_id, lawyer_name, lawyer_firm, clinic_id, clinic_name, target_clinic_id, target_clinic_name, specialist_type, created_by_user_id, creator_role, patient_name, patient_phone, case_type, accident_date, coverage, pip, insurance_company, claim_number, adjuster_name, adjuster_phone, adjuster_email, notes, status, created_at, updated_at'

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
const CLINIC_COLUMNS =
  'id, name, address, lat, lng, phone, specialties, email, website, region, county, available'

/**
 * Attaches derived geography and canonicalizes the messy free-text columns.
 *
 * Applied on every read path, which is the single choke point every consumer
 * goes through — API routes, admin pages, scripts and future SSR alike. Doing
 * it here rather than per-route is what keeps the four map/list surfaces from
 * drifting apart.
 */
function decorateClinic(clinic: Clinic): DecoratedClinic {
  const parts = parseAddress(clinic.address)
  return {
    ...clinic,
    city: parts.city,
    state: parts.state,
    zipCode: parts.zip,
    region: sanitizeRegion(clinic.region) ?? undefined,
    county: canonicalizeCounty(clinic.county) ?? undefined,
    specialties: sanitizeSpecialties(clinic.specialties),
  }
}

function decorateLawyer(lawyer: Lawyer): DecoratedLawyer {
  const parts = parseAddress(lawyer.address)
  return {
    ...lawyer,
    city: parts.city,
    state: parts.state,
    // `lawyers.zip_code` is populated on every row; the parsed value is only a
    // fallback for records added without it.
    zipCode: normalizeZip(lawyer.zipCode) ?? parts.zip ?? undefined,
    county: canonicalizeCounty(lawyer.county) ?? undefined,
    // NB: `lawyers.region` holds a CITY name, not a region. Left alone rather
    // than run through the region canonicalizer, which would reject all of it.
  }
}

export async function getClinics(): Promise<DecoratedClinic[]> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select(CLINIC_COLUMNS)
  if (error) {
    console.error('getClinics error:', error)
    return []
  }
  return rowsToModels<Clinic>(data).map(decorateClinic)
}

export async function getClinicsByState(state: string): Promise<DecoratedClinic[]> {
  // The DB filter is a deliberately loose superset and the JS filter below is
  // what makes it correct — the two must never be separated.
  //
  // The previous pattern was `%, ${state} %`, which requires a trailing space
  // and therefore missed every city-only address ("Melbourne, FL"). That hid 12
  // clinics from every state-scoped user. `.or()` is not an option: PostgREST
  // splits its argument on commas and these patterns contain commas.
  //
  // The superset over-matches on purpose ("Flagler" contains "fl"), so the
  // authoritative decision is `parseAddress`, which reads the state from the
  // end of the string where it actually belongs.
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select(CLINIC_COLUMNS)
    .ilike('address', `%${state}%`)
  if (error) {
    console.error('getClinicsByState error:', error)
    return []
  }
  return rowsToModels<Clinic>(data)
    .map(decorateClinic)
    .filter((clinic) => clinic.state === state)
}

/**
 * Clinics by explicit id list, decorated like every other read path.
 *
 * Exists so `/api/partners/clinics` does not have to query Supabase directly —
 * it used to, which meant it silently missed the normalization and derived
 * geography that every other surface gets.
 *
 * THROWS on a database error, unlike its neighbours here which log and return
 * []. That is deliberate: the partner map has a distinct "Connection Error /
 * Try Again" state, and swallowing the failure into an empty array would render
 * an outage as "there are no clinics" — which looks like data loss and gives
 * the user nothing to retry.
 */
export async function getClinicsByIds(
  ids: readonly string[]
): Promise<DecoratedClinic[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select(CLINIC_COLUMNS)
    .in('id', ids as string[])
  if (error) {
    console.error('getClinicsByIds error:', error)
    throw new Error(`getClinicsByIds failed: ${error.message}`)
  }
  return rowsToModels<Clinic>(data).map(decorateClinic)
}

export async function getClinicById(
  id: string
): Promise<DecoratedClinic | undefined> {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select(CLINIC_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return decorateClinic(rowToModel<Clinic>(data))
}

// Lawyers
const LAWYER_COLUMNS = 'id, name, address, lat, lng, phone, practice_areas, email, website, region, county, zip_code, available'

export async function getLawyers(): Promise<DecoratedLawyer[]> {
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .select(LAWYER_COLUMNS)
  if (error) {
    console.error('getLawyers error:', error)
    return []
  }
  return rowsToModels<Lawyer>(data).map(decorateLawyer)
}

export async function getLawyersByState(state: string): Promise<DecoratedLawyer[]> {
  // Same loose-superset-plus-JS-filter approach as getClinicsByState; see the
  // comment there for why the old `%, ST %` pattern was wrong.
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .select(LAWYER_COLUMNS)
    .ilike('address', `%${state}%`)
  if (error) {
    console.error('getLawyersByState error:', error)
    return []
  }
  return rowsToModels<Lawyer>(data)
    .map(decorateLawyer)
    .filter((lawyer) => lawyer.state === state)
}

export async function getLawyerById(id: string): Promise<DecoratedLawyer | undefined> {
  const { data, error } = await supabaseAdmin
    .from('lawyers')
    .select(LAWYER_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) return undefined
  return decorateLawyer(rowToModel<Lawyer>(data))
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
  // Match referrals where the clinic is either the SOURCE (`clinic_id`)
  // or the TARGET of a medical-specialist referral (`target_clinic_id`).
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select(REFERRAL_COLUMNS)
    .or(`clinic_id.eq.${clinicId},target_clinic_id.eq.${clinicId}`)
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
const RREF_COLUMNS = 'id, referrer_id, referrer_name, state, client_name, client_phone, client_email, client_address, service_needed, case_type, accident_date, notes, status, assigned_clinic_id, assigned_clinic_name, assigned_lawyer_id, assigned_lawyer_name, case_confirmed, admin_notes, created_at, updated_at'

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

// Settings
/**
 * Reads one row of the key/value `settings` table. Returns undefined
 * when the key was never saved, so callers can fall back to a default.
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) {
    console.error('getSetting error:', error)
    return undefined
  }
  return (data?.value as T) ?? undefined
}

/**
 * The practice-area list shown to users, ordered by the admin in
 * /admin/settings and falling back to the canonical catalog.
 *
 * Server-side on purpose: /api/admin/settings is requireAdmin, so a
 * directory user could never read `practice_areas_list` from the
 * client. Until this function existed the setting was written by the
 * admin UI and read by nothing.
 */
export async function getPracticeAreaCatalog(): Promise<string[]> {
  const stored = await getSetting<unknown>('practice_areas_list')
  return resolveCatalog(stored)
}
