import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rowsToModels } from '@/lib/mappers'
import type { Referral } from '@/types/professionals'

export async function GET() {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  // Build date ranges for last 6 months
  const now = new Date()
  const monthRanges: { label: string; start: string; end: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = d.toISOString()
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString()
    const label = d.toLocaleString('en-US', { month: 'short' })
    monthRanges.push({ label, start, end })
  }

  const [
    { count: totalUsers },
    { count: lawyers },
    { count: clinics },
    { count: totalReferrals },
    { count: received },
    { count: inProcess },
    { count: attended },
    { count: totalContacts },
    { count: totalSubscribers },
    referrals,
    // Monthly referral counts
    month0,
    month1,
    month2,
    month3,
    month4,
    month5,
    // All referrals (clinic_name + lawyer_name only) for top rankings
    allReferralNames,
    // Clinic entity counts
    { count: totalClinicsEntities },
    { count: availableClinics },
    // Recent activity logs
    activityResult,
  ] = await Promise.all([
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'lawyer'),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'clinic'),
    supabaseAdmin.from('referrals').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('referrals').select('*', { count: 'exact', head: true }).eq('status', 'received'),
    supabaseAdmin.from('referrals').select('*', { count: 'exact', head: true }).eq('status', 'in_process'),
    supabaseAdmin.from('referrals').select('*', { count: 'exact', head: true }).eq('status', 'attended'),
    supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('newsletter_subscribers').select('*', { count: 'exact', head: true }),
    // Only fetch the 5 most recent referrals for the dashboard preview
    supabaseAdmin
      .from('referrals')
      .select('id, lawyer_id, lawyer_name, lawyer_firm, clinic_id, clinic_name, patient_name, patient_phone, case_type, coverage, pip, notes, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => rowsToModels<Referral>(data ?? [])),
    // Monthly referral counts (6 months)
    ...monthRanges.map((m) =>
      supabaseAdmin
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', m.start)
        .lt('created_at', m.end)
    ),
    // All referral names for top rankings
    supabaseAdmin
      .from('referrals')
      .select('clinic_name, lawyer_name'),
    // Clinic entity counts
    supabaseAdmin.from('clinics').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('clinics').select('*', { count: 'exact', head: true }).eq('available', true),
    // Recent activity
    supabaseAdmin
      .from('activity_logs')
      .select('user_name, action, target_type, target_name, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // Build monthly referrals array
  const monthlyCounts = [month0, month1, month2, month3, month4, month5]
  const monthlyReferrals = monthRanges.map((m, i) => ({
    month: m.label,
    count: monthlyCounts[i]?.count ?? 0,
  }))

  // Build top 5 clinics by referral count
  const clinicCounts: Record<string, number> = {}
  const lawyerCounts: Record<string, number> = {}
  for (const row of (allReferralNames.data ?? []) as { clinic_name: string; lawyer_name: string }[]) {
    if (row.clinic_name) {
      clinicCounts[row.clinic_name] = (clinicCounts[row.clinic_name] || 0) + 1
    }
    if (row.lawyer_name) {
      lawyerCounts[row.lawyer_name] = (lawyerCounts[row.lawyer_name] || 0) + 1
    }
  }

  const topClinics = Object.entries(clinicCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const topLawyers = Object.entries(lawyerCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Recent activity
  const recentActivity = (activityResult.data ?? []).map((row) => ({
    userName: row.user_name,
    action: row.action,
    targetType: row.target_type,
    targetName: row.target_name,
    createdAt: row.created_at,
  }))

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    lawyers: lawyers ?? 0,
    clinics: clinics ?? 0,
    totalReferrals: totalReferrals ?? 0,
    received: received ?? 0,
    inProcess: inProcess ?? 0,
    attended: attended ?? 0,
    totalContacts: totalContacts ?? 0,
    totalSubscribers: totalSubscribers ?? 0,
    recentReferrals: referrals,
    monthlyReferrals,
    topClinics,
    topLawyers,
    totalClinicsEntities: totalClinicsEntities ?? 0,
    availableClinics: availableClinics ?? 0,
    recentActivity,
  })
}
