import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getReferrerReferralsByReferrer } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error: authError } = await requireAuth(['partner', 'admin'])
  if (authError) return authError

  const referrals = await getReferrerReferralsByReferrer(session.user.id)

  const total = referrals.length
  const pending = referrals.filter((r) => r.status === 'pending').length
  const assigned = referrals.filter((r) => r.status === 'assigned').length
  const inProcess = referrals.filter((r) => r.status === 'in_process').length
  const completed = referrals.filter((r) => r.status === 'completed').length
  const confirmed = referrals.filter((r) => r.caseConfirmed === 'confirmed').length

  const statusBreakdown = [
    { name: 'Pending', value: pending },
    { name: 'Assigned', value: assigned },
    { name: 'In Process', value: inProcess },
    { name: 'Completed', value: completed },
  ]

  const recentReferrals = referrals.slice(0, 5).map((r) => ({
    id: r.id,
    clientName: r.clientName,
    serviceNeeded: r.serviceNeeded,
    status: r.status,
    caseConfirmed: r.caseConfirmed,
    state: r.state,
    createdAt: r.createdAt,
  }))

  return NextResponse.json(
    {
      total,
      pending,
      active: assigned + inProcess,
      completed,
      confirmed,
      statusBreakdown,
      recentReferrals,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
