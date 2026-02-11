import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateReferralStatus, getReferralById } from '@/lib/data'
import type { ReferralStatus } from '@/types/professionals'

const VALID_STATUSES: ReferralStatus[] = ['received', 'in_process', 'attended']

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'clinic') {
    return NextResponse.json({ error: 'Only clinics can update referral status' }, { status: 403 })
  }

  // Verify clinic owns this referral
  const referral = getReferralById(params.id)
  if (!referral) {
    return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
  }

  if (referral.clinicId !== session.user.clinicId) {
    return NextResponse.json({ error: 'Not authorized for this referral' }, { status: 403 })
  }

  const body = await request.json()
  const { status } = body

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = updateReferralStatus(params.id, status)
  return NextResponse.json(updated)
}
