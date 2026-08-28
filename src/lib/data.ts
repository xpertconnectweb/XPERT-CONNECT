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

// Widening this list puts the new columns into EVERY user read path:
// getUsers, getUserByUsername, getUserById, getUsersByClinicId and
// getLawyerUsersByEntityId. `phone_e164` is PII, so the two responses
// that return user records to a browser must run it through
// toAdminSafeUser (lib/api/public-shape.ts). NextAuth's authorize()
// is safe because it returns an explicit field list — keep it that
// way rather than "simplifying" it to a spread.
// Kept as ONE string literal each, not a concatenation: supabase-js
// parses these select lists at the type level, and `'a' + 'b'` widens
// to `string`, which collapses every row type in this file into an
// error type. Long lines, but the alternative is losing the typing.
const USER_COLUMNS = 'id, username, password, name, role, clinic_id, lawyer_id, firm_name, email, state, phone_e164, phone_verified_at, sms_referral_alerts, sms_consent_at, sms_consent_version, sms_consent_text, sms_last_sent_at'

/**
 * The login path, deliberately narrower.
 *
 * PostgREST rejects an entire select that names a column the database
 * does not have, so a schema that lags the code breaks every query
 * using the wide list above. Authentication does not need a single
 * SMS column, and keeping it off them is the difference between "the
 * new feature is broken" and "nobody can sign in" — the second is how
 * a missing migration takes the whole site down and reads like an
 * auth bug.
 *
 * `scripts/validate-schema.ts` still fails loudly on the drift, so
 * this narrows the blast radius without hiding the problem.
 */
const USER_AUTH_COLUMNS = 'id, username, password, name, role, clinic_id, lawyer_id, firm_name, email, state'
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
  // USER_AUTH_COLUMNS, not USER_COLUMNS — see the note on that
  // constant. This is the query whose failure locks everyone out.
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_AUTH_COLUMNS)
    .eq('username', username)
    .single()
  if (error || !data) return undefined
  return rowToModel<User>(data)
}

/**
 * Reads every row of a query, a page at a time.
 *
 * PostgREST answers with at most 1000 rows and says nothing whatsoever about
 * the ones it left behind — no error, no flag, no count. A truncated answer
 * and a complete one are the same shape.
 *
 * This was latent for as long as the directory was smaller than that. The
 * August 2026 orthopedic import took it to 1031 clinics, and the map started
 * reporting "999 results" — 1000 rows minus the one legacy row sitting at
 * (0, 0) that `hasRealCoordinates` drops. Thirty-two clinics existed, were
 * geocoded, were tagged, and could not be found by anyone.
 *
 * A stable `order` is not optional: without it PostgREST may return pages in
 * different orders and paging would both skip and repeat rows.
 */
const PAGE_SIZE = 1000

async function readAll<Row>(
  page: (from: number, to: number) => PromiseLike<{
    data: Row[] | null
    error: { message: string } | null
  }>
): Promise<{ rows: Row[]; error: string | null }> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { rows: [], error: error.message }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return { rows, error: null }
  }
}
// Clinics
//
// ONE string literal, not a concatenation. `'a' + 'b'` widens to `string`,
// which collapses the row typing for every query in this file — the same trap
// documented on USER_COLUMNS above.
//
// Widened by 2026-08-structured-addresses.sql. PostgREST rejects an entire
// select that names a column which does not exist, so this list and that
// migration have to land in that order: migration first, then deploy.
const CLINIC_COLUMNS =
  'id, name, address, lat, lng, phone, specialties, email, website, region, county, available, street, city, state, zip_code, place_id, place_provider, geocode_precision, geocoded_at'

/**
 * Attaches derived geography and canonicalizes the messy free-text columns.
 *
 * Applied on every read path, which is the single choke point every consumer
 * goes through — API routes, admin pages, scripts and future SSR alike. Doing
 * it here rather than per-route is what keeps the four map/list surfaces from
 * drifting apart.
 *
 * DUAL READ, for the length of the backfill. The structured column wins where
 * it is populated; `parseAddress` remains the fallback where it is NULL. That
 * is what lets the migration and the deploy happen at different times, and it
 * is why those columns have no defaults — NULL is the signal, not an absence.
 *
 * Delete the fallback only once
 *   SELECT count(*) FROM clinics WHERE geocoded_at IS NULL
 * returns 0 in production.
 */
function decorateClinic(clinic: Clinic): DecoratedClinic {
  const structured = clinic.city != null || clinic.state != null
  const parts = structured ? null : parseAddress(clinic.address)
  return {
    ...clinic,
    city: clinic.city ?? parts?.city ?? null,
    state: clinic.state ?? parts?.state ?? null,
    zipCode: normalizeZip(clinic.zipCode) ?? parts?.zip ?? null,
    region: sanitizeRegion(clinic.region) ?? undefined,
    county: canonicalizeCounty(clinic.county) ?? undefined,
    specialties: sanitizeSpecialties(clinic.specialties),
  }
}

function decorateLawyer(lawyer: Lawyer): DecoratedLawyer {
  const structured = lawyer.city != null || lawyer.state != null
  const parts = structured ? null : parseAddress(lawyer.address)
  return {
    ...lawyer,
    city: lawyer.city ?? parts?.city ?? null,
    state: lawyer.state ?? parts?.state ?? null,
    // `lawyers.zip_code` is populated on every row; the parsed value is only a
    // fallback for records added without it.
    zipCode: normalizeZip(lawyer.zipCode) ?? parts?.zip ?? undefined,
    county: canonicalizeCounty(lawyer.county) ?? undefined,
    // NB: `lawyers.region` holds a CITY name, not a region. Left alone rather
    // than run through the region canonicalizer, which would reject all of it.
  }
}

export async function getClinics(): Promise<DecoratedClinic[]> {
  const { rows, error } = await readAll((from, to) =>
    supabaseAdmin.from('clinics').select(CLINIC_COLUMNS).order('id').range(from, to)
  )
  if (error) {
    console.error('getClinics error:', error)
    return []
  }
  return rowsToModels<Clinic>(rows).map(decorateClinic)
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
  //
  // TRANSITION PHASE. Two queries, unioned:
  //   - rows the backfill has reached go through the indexed `state` column
  //   - rows it has not still get the loose ILIKE, exactly as before
  // The second query shrinks to zero as the backfill progresses, and then this
  // whole branch can go. The JS filter below stays either way: it is the
  // authoritative decision, and it is what makes the union provably harmless.
  const [structured, legacy] = await Promise.all([
    readAll((from, to) =>
      supabaseAdmin.from('clinics').select(CLINIC_COLUMNS).eq('state', state).order('id').range(from, to)
    ),
    readAll((from, to) =>
      supabaseAdmin
        .from('clinics')
        .select(CLINIC_COLUMNS)
        .is('state', null)
        .ilike('address', `%${state}%`)
        .order('id')
        .range(from, to)
    ),
  ])

  if (structured.error || legacy.error) {
    console.error('getClinicsByState error:', structured.error ?? legacy.error)
    return []
  }

  return rowsToModels<Clinic>([...structured.rows, ...legacy.rows])
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
// One string literal, same reason as CLINIC_COLUMNS. Widened by
// 2026-08-structured-addresses.sql — apply that migration before deploying.
const LAWYER_COLUMNS = 'id, name, address, lat, lng, phone, practice_areas, email, website, region, county, zip_code, available, street, city, state, place_id, place_provider, geocode_precision, geocoded_at'

export async function getLawyers(): Promise<DecoratedLawyer[]> {
  const { rows, error } = await readAll((from, to) =>
    supabaseAdmin.from('lawyers').select(LAWYER_COLUMNS).order('id').range(from, to)
  )
  if (error) {
    console.error('getLawyers error:', error)
    return []
  }
  return rowsToModels<Lawyer>(rows).map(decorateLawyer)
}

export async function getLawyersByState(state: string): Promise<DecoratedLawyer[]> {
  // Same loose-superset-plus-JS-filter approach as getClinicsByState, and the
  // same transition-phase union; see the comments there.
  const [structured, legacy] = await Promise.all([
    readAll((from, to) =>
      supabaseAdmin.from('lawyers').select(LAWYER_COLUMNS).eq('state', state).order('id').range(from, to)
    ),
    readAll((from, to) =>
      supabaseAdmin
        .from('lawyers')
        .select(LAWYER_COLUMNS)
        .is('state', null)
        .ilike('address', `%${state}%`)
        .order('id')
        .range(from, to)
    ),
  ])

  if (structured.error || legacy.error) {
    console.error('getLawyersByState error:', structured.error ?? legacy.error)
    return []
  }

  return rowsToModels<Lawyer>([...structured.rows, ...legacy.rows])
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

// SMS notifications
/**
 * The global kill switch for referral texts.
 *
 * Note the failure direction. `getSetting` returns undefined both
 * when the key was never written AND when the query errored, so a
 * transient database blip must not silently stop every alert —
 * absent means enabled. The gate that fails CLOSED is the presence
 * of the Twilio environment variables (see lib/sms/base.ts), which
 * is what keeps a checkout with no secrets completely inert.
 *
 * Unlike `referral_notifications`, which the admin UI has written
 * since May and no send path has ever read, this one is consulted on
 * every referral. If you are adding another toggle, read it.
 */
export async function smsNotificationsEnabled(): Promise<boolean> {
  const stored = await getSetting<{ enabled?: boolean }>('sms_notifications')
  return stored?.enabled !== false
}

/**
 * Which of these numbers have told the carrier STOP.
 *
 * One query for the whole fan-out rather than one per recipient.
 * `resumed_at` non-null means they later texted START.
 */
export async function getActiveOptOuts(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set()

  const { data, error } = await supabaseAdmin
    .from('sms_opt_outs')
    .select('phone_e164')
    .in('phone_e164', phones)
    .is('resumed_at', null)

  if (error) {
    // Fail CLOSED: if we cannot tell who opted out, send to nobody.
    // Texting someone who said STOP is a statutory penalty per
    // message; a missed alert is an email they still received.
    console.error('getActiveOptOuts error:', error)
    return new Set(phones)
  }

  return new Set((data ?? []).map((row) => row.phone_e164 as string))
}

export async function isPhoneOptedOut(phone: string): Promise<boolean> {
  return (await getActiveOptOuts([phone])).has(phone)
}

/**
 * Record a STOP. Never deletes, only upserts — the row is the proof
 * that the opt-out was honoured, and it outlives the user account.
 */
export async function recordOptOut(
  phone: string,
  reason: string,
  rawKeyword?: string
): Promise<void> {
  const { error } = await supabaseAdmin.from('sms_opt_outs').upsert(
    {
      phone_e164: phone,
      reason,
      raw_keyword: rawKeyword ?? null,
      opted_out_at: new Date().toISOString(),
      resumed_at: null,
    },
    { onConflict: 'phone_e164' }
  )
  if (error) console.error('recordOptOut error:', error)
}

/**
 * Handle START / UNSTOP.
 *
 * Marks the number resumed but deliberately does NOT switch alerts
 * back on — re-consent has to be a deliberate act in the product, not
 * a side effect of a keyword. Texting START says "you may contact me
 * again", not "resume the specific alerts I turned off".
 */
export async function recordOptIn(phone: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sms_opt_outs')
    .update({ resumed_at: new Date().toISOString() })
    .eq('phone_e164', phone)
  if (error) console.error('recordOptIn error:', error)
}

/** Mirror a carrier-side opt-out onto every account using that number. */
export async function disableAlertsForPhone(phone: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ sms_referral_alerts: false })
    .eq('phone_e164', phone)
  if (error) console.error('disableAlertsForPhone error:', error)
}

export async function recordSmsMessage(entry: {
  userId?: string
  to: string
  kind: 'otp' | 'referral_alert' | 'opt_in_confirmation'
  twilioSid?: string
  status: 'queued' | 'failed'
  errorCode?: number
}): Promise<void> {
  const { error } = await supabaseAdmin.from('sms_messages').insert({
    user_id: entry.userId ?? null,
    to_e164: entry.to,
    kind: entry.kind,
    twilio_sid: entry.twilioSid ?? null,
    status: entry.status,
    error_code: entry.errorCode ?? null,
  })
  // Never throw: logging a send must not break the send.
  if (error) console.error('recordSmsMessage error:', error)
}

/**
 * These four write the SMS columns directly rather than going through
 * `updateUser`, because they need to write NULL.
 *
 * `modelToRow` keeps keys whose value is undefined, but the Supabase
 * client serializes with JSON.stringify, which drops them — so
 * `updateUser(id, { phoneVerifiedAt: undefined })` silently leaves the
 * old timestamp in place. That failure is invisible and it is the
 * dangerous direction: a user swaps in a new number and keeps the
 * "verified" state earned by the previous one.
 */
export async function setPendingPhone(
  userId: string,
  phone: string,
  consent: { version: string; text: string }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      phone_e164: phone,
      phone_verified_at: null,
      sms_referral_alerts: false,
      sms_consent_at: new Date().toISOString(),
      sms_consent_version: consent.version,
      sms_consent_text: consent.text,
    })
    .eq('id', userId)
  if (error) {
    console.error('setPendingPhone error:', error)
    throw new Error('Failed to save phone')
  }
}

export async function markPhoneVerified(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ phone_verified_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) {
    console.error('markPhoneVerified error:', error)
    throw new Error('Failed to mark verified')
  }
}

export async function setSmsAlerts(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ sms_referral_alerts: enabled })
    .eq('id', userId)
  if (error) {
    console.error('setSmsAlerts error:', error)
    throw new Error('Failed to update alerts')
  }
}

/**
 * Full revocation. Note it does NOT touch `sms_opt_outs` — that row
 * belongs to the phone and must outlive any account decision.
 */
export async function clearUserPhone(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      phone_e164: null,
      phone_verified_at: null,
      sms_referral_alerts: false,
      sms_consent_at: null,
      sms_consent_version: null,
      sms_consent_text: null,
    })
    .eq('id', userId)
  if (error) {
    console.error('clearUserPhone error:', error)
    throw new Error('Failed to clear phone')
  }

  await supabaseAdmin.from('phone_verifications').delete().eq('user_id', userId)
}

export async function markSmsSent(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ sms_last_sent_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) console.error('markSmsSent error:', error)
}
