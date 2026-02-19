import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateReferralStatus, getReferralById } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import type { ReferralStatus } from '@/types/professionals'

const VALID_STATUSES: ReferralStatus[] = ['received', 'in_process', 'attended']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Admin can update any referral status
  if (session.user.role === 'admin') {
    const body = await request.json()
    const { status } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const updated = await updateReferralStatus(id, status)
    return NextResponse.json(updated)
  }

  // Clinics can only update their own referrals
  if (session.user.role !== 'clinic') {
    return NextResponse.json({ error: 'Only clinics and admins can update referral status' }, { status: 403 })
  }

  // Verify clinic owns this referral
  const referral = await getReferralById(id)
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

  const updated = await updateReferralStatus(id, status)
  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { error } = await supabaseAdmin
      .from('referrals')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting referral:', error)
    return NextResponse.json(
      { error: 'Failed to delete referral' },
      { status: 500 }
    )
  }
}
