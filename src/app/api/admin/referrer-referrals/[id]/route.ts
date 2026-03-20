import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getReferrerReferralById, updateReferrerReferral, deleteReferrerReferral } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'
import { sanitize } from '@/lib/sanitize'

const VALID_STATUSES = ['pending', 'assigned', 'in_process', 'completed']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await getReferrerReferralById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
  }

  const body = await request.json()
  const fields: Record<string, unknown> = {}

  if (body.status) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    fields.status = body.status
  }

  if (body.assignedClinicId !== undefined) {
    fields.assignedClinicId = body.assignedClinicId || null
    fields.assignedClinicName = body.assignedClinicName ? sanitize(body.assignedClinicName) : null
  }

  if (body.assignedLawyerId !== undefined) {
    fields.assignedLawyerId = body.assignedLawyerId || null
    fields.assignedLawyerName = body.assignedLawyerName ? sanitize(body.assignedLawyerName) : null
  }

  if (body.adminNotes !== undefined) {
    fields.adminNotes = sanitize(body.adminNotes || '')
  }

  fields.updatedAt = new Date().toISOString()

  const updated = await updateReferrerReferral(id, fields)
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update referral' }, { status: 500 })
  }

  await logActivity({
    userId: session.user.id,
    userName: session.user.name || 'Unknown',
    action: body.assignedClinicId || body.assignedLawyerId ? 'referrer_referral_assigned' : 'referrer_referral_updated',
    targetType: 'referrer_referral',
    targetId: id,
    targetName: existing.clientName,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await getReferrerReferralById(id)
  const success = await deleteReferrerReferral(id)
  if (!success) {
    return NextResponse.json({ error: 'Failed to delete referral' }, { status: 500 })
  }

  await logActivity({
    userId: session.user.id,
    userName: session.user.name || 'Unknown',
    action: 'referrer_referral_deleted',
    targetType: 'referrer_referral',
    targetId: id,
    targetName: existing?.clientName,
  })

  return NextResponse.json({ success: true })
}
