import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getReferrals } from '@/lib/data'
import { VALID_REFERRAL_STATUSES } from '@/lib/validation'
import type { ReferralStatus } from '@/types/professionals'

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const referrals = await getReferrals()

  // Optional query filters
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const lawyerId = searchParams.get('lawyerId')
  const clinicId = searchParams.get('clinicId')

  let filtered = referrals
  if (status && VALID_REFERRAL_STATUSES.includes(status as ReferralStatus)) {
    filtered = filtered.filter((r) => r.status === status)
  }
  if (lawyerId) filtered = filtered.filter((r) => r.lawyerId === lawyerId)
  if (clinicId) filtered = filtered.filter((r) => r.clinicId === clinicId)

  return NextResponse.json(filtered)
}
