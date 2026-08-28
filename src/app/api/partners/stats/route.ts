import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getReferrerReferralsByReferrer } from '@/lib/data'
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_LIST,
  TERMINAL_REFERRAL_STATUS,
  isReferralStatus,
} from '@/lib/referral-status'
import type { ReferralStatus } from '@/types/professionals'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error: authError } = await requireAuth(['partner', 'admin'])
  if (authError) return authError

  const referrals = await getReferrerReferralsByReferrer(session.user.id)

  const total = referrals.length
  const byStatus = Object.fromEntries(
    REFERRAL_STATUSES.map((s) => [s, 0])
  ) as Record<ReferralStatus, number>
  let confirmed = 0
  let dropped = 0
  let unassigned = 0
  for (const r of referrals) {
    if (isReferralStatus(r.status)) byStatus[r.status]++
    if (r.caseConfirmed === 'confirmed') confirmed++
    else if (r.caseConfirmed === 'drop') dropped++
    // Routing is read off the assignment columns, never off a status value.
    if (!r.assignedClinicId && !r.assignedLawyerId) unassigned++
  }

  // The raw key is what the client colours by, so the pie is no longer coupled
  // to array position; the label rides along so the response explains itself.
  const statusBreakdown = REFERRAL_STATUS_LIST.map((m) => ({
    status: m.value,
    label: m.label,
    value: byStatus[m.value as ReferralStatus],
  }))

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
      byStatus,
      completed: byStatus[TERMINAL_REFERRAL_STATUS],
      confirmed,
      dropped,
      unassigned,
      statusBreakdown,
      recentReferrals,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
