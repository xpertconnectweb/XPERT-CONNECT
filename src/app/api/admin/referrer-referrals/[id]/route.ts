import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getReferrerReferralById, updateReferrerReferral, deleteReferrerReferral } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'
import { sanitize } from '@/lib/sanitize'
import { isReferralStatus } from '@/lib/referral-status'
import { isCaseConfirmed } from '@/lib/case-confirmed'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const existing = await getReferrerReferralById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
  }

  const body = await request.json()
  const fields: Record<string, unknown> = {}

  // `!== undefined`, not truthiness: `status: ''` used to be dropped silently
  // and answered 200 having written nothing.
  if (body.status !== undefined) {
    if (!isReferralStatus(body.status)) {
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

  if (body.caseConfirmed !== undefined) {
    if (!isCaseConfirmed(body.caseConfirmed)) {
      return NextResponse.json({ error: 'Invalid case confirmed status' }, { status: 400 })
    }
    fields.caseConfirmed = body.caseConfirmed
  }

  if (body.adminNotes !== undefined) {
    fields.adminNotes = sanitize(body.adminNotes || '')
  }

  fields.updatedAt = new Date().toISOString()

  const updated = await updateReferrerReferral(id, fields)
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update referral' }, { status: 500 })
  }

  // Compare against what was stored, not against the truthiness of the incoming
  // body: the admin modal always sends all seven keys, so CLEARING an
  // assignment used to be logged as a plain update.
  const assignmentChanged =
    (fields.assignedClinicId !== undefined && fields.assignedClinicId !== (existing.assignedClinicId ?? null)) ||
    (fields.assignedLawyerId !== undefined && fields.assignedLawyerId !== (existing.assignedLawyerId ?? null))
  const statusChanged = fields.status !== undefined && fields.status !== existing.status
  const caseChanged = fields.caseConfirmed !== undefined && fields.caseConfirmed !== existing.caseConfirmed

  await logActivity({
    userId: session.user.id,
    userName: session.user.name || 'Unknown',
    action: assignmentChanged
      ? 'referrer_referral_assigned'
      : statusChanged
        ? 'referrer_referral_status_changed'
        : 'referrer_referral_updated',
    targetType: 'referrer_referral',
    targetId: id,
    targetName: existing.clientName,
    // The medical status is what the referrer watches, so a change to it leaves
    // a from -> to trail like the `referrals` PATCH already does.
    details: {
      ...(statusChanged && { status: { from: existing.status, to: fields.status } }),
      ...(caseChanged && { caseConfirmed: { from: existing.caseConfirmed, to: fields.caseConfirmed } }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

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
