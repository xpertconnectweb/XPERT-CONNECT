import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/api-auth'
import { updateReferralStatus, getReferralById } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import { VALID_REFERRAL_STATUSES } from '@/lib/validation'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  // Admin can update any referral status
  if (session.user.role === 'admin') {
    const body = await request.json()
    const { status } = body

    if (!status || !VALID_REFERRAL_STATUSES.includes(status)) {
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

  if (!status || !VALID_REFERRAL_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = await updateReferralStatus(id, status)
  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

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
