import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getReferrals } from '@/lib/data'
import type { ReferralStatus } from '@/types/professionals'

const VALID_STATUSES: ReferralStatus[] = ['received', 'in_process', 'attended']

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const referrals = await getReferrals()

  // Optional query filters
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const lawyerId = searchParams.get('lawyerId')
  const clinicId = searchParams.get('clinicId')

  let filtered = referrals
  if (status && VALID_STATUSES.includes(status as ReferralStatus)) {
    filtered = filtered.filter((r) => r.status === status)
  }
  if (lawyerId) filtered = filtered.filter((r) => r.lawyerId === lawyerId)
  if (clinicId) filtered = filtered.filter((r) => r.clinicId === clinicId)

  return NextResponse.json(filtered)
}
