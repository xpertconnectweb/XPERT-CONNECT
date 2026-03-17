import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rowsToModels } from '@/lib/mappers'
import type { Referral } from '@/types/professionals'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use count queries instead of fetching all rows
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
  ])

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
  })
}
