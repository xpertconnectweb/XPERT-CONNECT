import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getReferrerReferrals } from '@/lib/data'
import { isReferralStatus } from '@/lib/referral-status'

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const all = await getReferrerReferrals()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const state = searchParams.get('state')
  const referrerId = searchParams.get('referrerId')
  // `assignment` replaces the old `?status=pending` drill-down: routing is read
  // off the assigned clinic/lawyer now, not off a status value.
  const assignment = searchParams.get('assignment')

  if (status && !isReferralStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (assignment && assignment !== 'assigned' && assignment !== 'unassigned') {
    return NextResponse.json({ error: 'Invalid assignment' }, { status: 400 })
  }

  let filtered = all
  if (status) filtered = filtered.filter((r) => r.status === status)
  if (state) filtered = filtered.filter((r) => r.state === state)
  if (referrerId) filtered = filtered.filter((r) => r.referrerId === referrerId)
  if (assignment) {
    filtered = filtered.filter((r) => {
      const routed = Boolean(r.assignedClinicId || r.assignedLawyerId)
      return assignment === 'assigned' ? routed : !routed
    })
  }

  return NextResponse.json(filtered)
}
