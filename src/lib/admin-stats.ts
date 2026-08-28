import { supabaseAdmin } from '@/lib/supabase'
import { rowsToModels } from '@/lib/mappers'
import {
  ACTIVE_REFERRAL_STATUSES,
  REFERRAL_STATUSES,
  isReferralStatus,
  isTerminal,
} from '@/lib/referral-status'
import type { Referral, ReferralStatus } from '@/types/professionals'

/**
 * Admin dashboard analytics. One broad fetch per table + in-JS aggregation
 * (mirrors the existing app pattern of pulling full result sets, e.g.
 * `getReferrals()` / `getClinics()`), so a single call powers every figure
 * on the dashboard. Read-only; admin auth is enforced by the route.
 */

export type StatsRange = '7d' | '30d' | '90d' | '12mo'
export const STATS_RANGES: StatsRange[] = ['7d', '30d', '90d', '12mo']

export interface NameCount { name: string; count: number }
export interface LabelCount { label: string; count: number }

export interface AdminStats {
  range: StatsRange
  generatedAt: string
  kpis: {
    referralsPeriod: number
    referralsPrev: number
    referralsDeltaPct: number | null
    activePipeline: number
    partnerUnassigned: number
    clinicsAvailable: number
    clinicsTotal: number
    totalReferrals: number
    totalUsers: number
  }
  /** Keyed by the raw status, so a new lifecycle stage needs no new field. */
  funnel: Record<ReferralStatus, number>
  trend: LabelCount[]
  mix: {
    byKind: { lawyer: number; medicalSpecialist: number }
    byCreator: { lawyer: number; clinic: number; admin: number; unknown: number }
    topCaseTypes: NameCount[]
  }
  partner: {
    total: number
    /** Keyed by the raw status, like `funnel` — a new stage needs no new field. */
    byStatus: Record<ReferralStatus, number>
    /** No clinic AND no lawyer attached. The real "awaiting assignment". */
    unassigned: number
    confirmed: number
    /** Surfaced as a raw count because `drop` stays inside `confirmedRate`'s
     *  denominator — otherwise a lost case hides behind a lower percentage. */
    dropped: number
    confirmedRate: number | null
    byService: { clinic: number; lawyer: number; both: number }
    byState: { FL: number; MN: number; other: number }
  }
  network: {
    clinicsTotal: number
    clinicsAvailable: number
    clinicsByState: { FL: number; MN: number; other: number }
    clinicsAvailableByState: { FL: number; MN: number }
    lawyersTotal: number
    lawyersAvailable: number
    lawyersByState: { FL: number; MN: number; other: number }
  }
  topClinics: NameCount[]
  topLawyers: NameCount[]
  usersByRole: { admin: number; lawyer: number; clinic: number; referrer: number; partner: number }
  contacts: { total: number; periodCount: number; topServices: NameCount[] }
  newsletter: { total: number; periodCount: number; prevCount: number }
  alerts: { stuckReferrals: number; partnerUnassigned: number; clinicsUnavailable: number }
  recentReferrals: {
    id: string
    patientName: string
    lawyerName: string
    clinicName: string
    status: string
    createdAt: string
  }[]
  recentActivity: {
    userName: string
    action: string
    targetType: string
    targetName: string
    createdAt: string
  }[]
}

// ── Date helpers ──────────────────────────────────────────────────────────
function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}
function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

interface Bucket { label: string; start: number; end: number }
interface RangeInfo { periodStart: number; prevStart: number; buckets: Bucket[] }

function resolveRange(range: StatsRange, now: Date): RangeInfo {
  const buckets: Bucket[] = []

  if (range === '12mo') {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      buckets.push({ label: start.toLocaleString('en-US', { month: 'short' }), start: start.getTime(), end: end.getTime() })
    }
  } else if (range === '90d') {
    // 13 weekly buckets (~91 days)
    for (let i = 12; i >= 0; i--) {
      const start = startOfDay(addDays(now, -7 * i - 6))
      const end = startOfDay(addDays(now, -7 * i + 1))
      buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start: start.getTime(), end: end.getTime() })
    }
  } else {
    const days = range === '7d' ? 7 : 30
    for (let i = days - 1; i >= 0; i--) {
      const start = startOfDay(addDays(now, -i))
      const end = startOfDay(addDays(now, -i + 1))
      buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start: start.getTime(), end: end.getTime() })
    }
  }

  const periodStart = buckets[0].start
  const periodMs = now.getTime() - periodStart
  const prevStart = periodStart - periodMs
  return { periodStart, prevStart, buckets }
}

// ── Aggregation helpers ───────────────────────────────────────────────────
function tally(values: (string | null | undefined)[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    m.set(v, (m.get(v) ?? 0) + 1)
  }
  return m
}

function topN(map: Map<string, number>, n: number): NameCount[] {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

function stateOf(address: string | null | undefined): 'FL' | 'MN' | 'other' {
  if (!address) return 'other'
  if (/,\s*FL\b/i.test(address)) return 'FL'
  if (/,\s*MN\b/i.test(address)) return 'MN'
  return 'other'
}

// ── Main ──────────────────────────────────────────────────────────────────
export async function getAdminStats(range: StatsRange): Promise<AdminStats> {
  const now = new Date()
  const { periodStart, prevStart, buckets } = resolveRange(range, now)
  const STUCK_MS = 7 * 24 * 60 * 60 * 1000
  const stuckBefore = now.getTime() - STUCK_MS

  const [
    referralRows,
    partnerRows,
    clinicRows,
    lawyerRows,
    contactRows,
    userRows,
    newsletterRows,
    recentReferralRows,
    activityRows,
  ] = await Promise.all([
    supabaseAdmin.from('referrals').select('status, referral_kind, creator_role, case_type, clinic_name, lawyer_name, created_at, updated_at'),
    supabaseAdmin.from('referrer_referrals').select('status, case_confirmed, service_needed, state, created_at, assigned_clinic_id, assigned_lawyer_id'),
    supabaseAdmin.from('clinics').select('address, available'),
    supabaseAdmin.from('lawyers').select('address, available'),
    supabaseAdmin.from('contacts').select('service, created_at'),
    supabaseAdmin.from('users').select('role'),
    supabaseAdmin.from('newsletter_subscribers').select('subscribed_at'),
    supabaseAdmin
      .from('referrals')
      .select('id, lawyer_name, clinic_name, patient_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('activity_logs')
      .select('user_name, action, target_type, target_name, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const refs = (referralRows.data ?? []) as {
    status: string; referral_kind: string | null; creator_role: string | null
    case_type: string | null; clinic_name: string | null; lawyer_name: string | null
    created_at: string; updated_at: string
  }[]
  const partners = (partnerRows.data ?? []) as {
    status: string; case_confirmed: string | null; service_needed: string | null; state: string | null; created_at: string
    assigned_clinic_id: string | null; assigned_lawyer_id: string | null
  }[]
  const clinics = (clinicRows.data ?? []) as { address: string | null; available: boolean }[]
  const lawyers = (lawyerRows.data ?? []) as { address: string | null; available: boolean }[]
  const contacts = (contactRows.data ?? []) as { service: string | null; created_at: string }[]
  const users = (userRows.data ?? []) as { role: string | null }[]
  const subs = (newsletterRows.data ?? []) as { subscribed_at: string }[]

  // ── Referral status funnel ──
  const funnel = Object.fromEntries(
    REFERRAL_STATUSES.map((s) => [s, 0])
  ) as Record<ReferralStatus, number>
  for (const r of refs) if (isReferralStatus(r.status)) funnel[r.status]++

  // ── Referral trend + period/prev counts + stuck alert ──
  const trend: LabelCount[] = buckets.map((b) => ({ label: b.label, count: 0 }))
  let referralsPeriod = 0
  let referralsPrev = 0
  let stuckReferrals = 0
  for (const r of refs) {
    const t = new Date(r.created_at).getTime()
    if (t >= periodStart) {
      referralsPeriod++
      for (let i = 0; i < buckets.length; i++) {
        if (t >= buckets[i].start && t < buckets[i].end) { trend[i].count++; break }
      }
    } else if (t >= prevStart) {
      referralsPrev++
    }
    // Staleness is measured from the LAST MOVE, not from creation. Reaching
    // Final MMI legitimately takes months, so "created 7+ days ago and not
    // terminal" would flag the whole active book; "nobody has advanced this in
    // a week" is the question this alert is actually asking.
    if (!isTerminal(r.status) && new Date(r.updated_at).getTime() < stuckBefore) stuckReferrals++
  }
  const referralsDeltaPct = referralsPrev === 0
    ? (referralsPeriod > 0 ? null : 0)
    : Math.round(((referralsPeriod - referralsPrev) / referralsPrev) * 100)

  // ── Referral mix ──
  const byKind = { lawyer: 0, medicalSpecialist: 0 }
  const byCreator = { lawyer: 0, clinic: 0, admin: 0, unknown: 0 }
  for (const r of refs) {
    if (r.referral_kind === 'medical_specialist') byKind.medicalSpecialist++
    else byKind.lawyer++
    if (r.creator_role === 'lawyer') byCreator.lawyer++
    else if (r.creator_role === 'clinic') byCreator.clinic++
    else if (r.creator_role === 'admin') byCreator.admin++
    else byCreator.unknown++
  }
  const topCaseTypes = topN(tally(refs.map((r) => r.case_type)), 5)
  const topClinics = topN(tally(refs.map((r) => r.clinic_name)), 5)
  const topLawyers = topN(tally(refs.map((r) => r.lawyer_name)), 5)

  // ── Partner (referrer) pipeline ──
  const partner = {
    total: partners.length,
    byStatus: Object.fromEntries(REFERRAL_STATUSES.map((s) => [s, 0])) as Record<ReferralStatus, number>,
    unassigned: 0,
    confirmed: 0,
    dropped: 0,
    confirmedRate: null as number | null,
    byService: { clinic: 0, lawyer: 0, both: 0 },
    byState: { FL: 0, MN: 0, other: 0 },
  }
  for (const p of partners) {
    if (isReferralStatus(p.status)) partner.byStatus[p.status]++
    if (p.case_confirmed === 'confirmed') partner.confirmed++
    else if (p.case_confirmed === 'drop') partner.dropped++
    // Awaiting assignment is read off the assignment columns, not aliased from
    // a status. It used to be a verbatim copy of `status === 'pending'`, which
    // could disagree with reality in both directions: a row could carry a
    // clinic and still be counted as awaiting one. `!x` rather than
    // `x === null` because the PATCH route writes `body.… || null`, so an
    // empty-string id could have landed historically and is equally unassigned.
    if (!p.assigned_clinic_id && !p.assigned_lawyer_id) partner.unassigned++
    if (p.service_needed === 'clinic') partner.byService.clinic++
    else if (p.service_needed === 'lawyer') partner.byService.lawyer++
    else if (p.service_needed === 'both') partner.byService.both++
    const st = p.state === 'FL' ? 'FL' : p.state === 'MN' ? 'MN' : 'other'
    partner.byState[st]++
  }
  // Denominator stays `total`: a dropped case counts against the rate, so the
  // raw `dropped` figure is surfaced everywhere the percentage is.
  partner.confirmedRate = partner.total === 0 ? null : Math.round((partner.confirmed / partner.total) * 100)

  // ── Network (availability + geography) ──
  const network = {
    clinicsTotal: clinics.length,
    clinicsAvailable: 0,
    clinicsByState: { FL: 0, MN: 0, other: 0 },
    clinicsAvailableByState: { FL: 0, MN: 0 },
    lawyersTotal: lawyers.length,
    lawyersAvailable: 0,
    lawyersByState: { FL: 0, MN: 0, other: 0 },
  }
  for (const c of clinics) {
    if (c.available) network.clinicsAvailable++
    const st = stateOf(c.address)
    network.clinicsByState[st]++
    if (c.available && st !== 'other') network.clinicsAvailableByState[st]++
  }
  for (const l of lawyers) {
    if (l.available) network.lawyersAvailable++
    network.lawyersByState[stateOf(l.address)]++
  }
  const clinicsUnavailable = network.clinicsTotal - network.clinicsAvailable

  // ── Users by role ──
  const usersByRole = { admin: 0, lawyer: 0, clinic: 0, referrer: 0, partner: 0 }
  for (const u of users) {
    if (u.role && u.role in usersByRole) usersByRole[u.role as keyof typeof usersByRole]++
  }

  // ── Contacts ──
  const contactsPeriod = contacts.filter((c) => new Date(c.created_at).getTime() >= periodStart).length
  const topServices = topN(tally(contacts.map((c) => c.service)), 4)

  // ── Newsletter growth ──
  let nlPeriod = 0
  let nlPrev = 0
  for (const s of subs) {
    const t = new Date(s.subscribed_at).getTime()
    if (t >= periodStart) nlPeriod++
    else if (t >= prevStart) nlPrev++
  }

  // ── Recent ──
  const recentReferrals = rowsToModels<Referral>(
    (recentReferralRows.data ?? []).slice(0, 5) as Record<string, unknown>[]
  ).map((r) => ({
    id: r.id,
    patientName: r.patientName,
    lawyerName: r.lawyerName ?? '—',
    clinicName: r.clinicName,
    status: r.status,
    createdAt: r.createdAt,
  }))
  const recentActivity = ((activityRows.data ?? []) as {
    user_name: string; action: string; target_type: string; target_name: string; created_at: string
  }[]).slice(0, 5).map((a) => ({
    userName: a.user_name,
    action: a.action,
    targetType: a.target_type,
    targetName: a.target_name,
    createdAt: a.created_at,
  }))

  return {
    range,
    generatedAt: now.toISOString(),
    kpis: {
      referralsPeriod,
      referralsPrev,
      referralsDeltaPct,
      activePipeline: ACTIVE_REFERRAL_STATUSES.reduce((n, s) => n + funnel[s], 0),
      partnerUnassigned: partner.unassigned,
      clinicsAvailable: network.clinicsAvailable,
      clinicsTotal: network.clinicsTotal,
      totalReferrals: refs.length,
      totalUsers: users.length,
    },
    funnel,
    trend,
    mix: { byKind, byCreator, topCaseTypes },
    partner,
    network,
    topClinics,
    topLawyers,
    usersByRole,
    contacts: { total: contacts.length, periodCount: contactsPeriod, topServices },
    newsletter: { total: subs.length, periodCount: nlPeriod, prevCount: nlPrev },
    alerts: {
      stuckReferrals,
      partnerUnassigned: partner.unassigned,
      clinicsUnavailable,
    },
    recentReferrals,
    recentActivity,
  }
}
