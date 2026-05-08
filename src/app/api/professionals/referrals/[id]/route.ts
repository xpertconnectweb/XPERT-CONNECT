import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/api-auth'
import {
  getReferralById,
  updateReferralFields,
  type ReferralPatch,
} from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import {
  VALID_REFERRAL_STATUSES,
  REFERRAL_MUTABLE_FIELDS,
  EMAIL_RE,
} from '@/lib/validation'
import { sanitize, isValidPhone } from '@/lib/sanitize'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const referral = await getReferralById(id)
  if (!referral) {
    return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
  }

  const { role } = session.user
  const isAdmin = role === 'admin'
  // Lawyer authorization is tied to the firm (lawyer entity), NOT the
  // individual user — any lawyer user linked to the firm can edit
  // referrals targeted at the firm.
  const isFirmLawyer =
    role === 'lawyer' &&
    !!session.user.lawyerId &&
    session.user.lawyerId === referral.lawyerId
  const isOwningClinic =
    role === 'clinic' && session.user.clinicId === referral.clinicId

  if (!isAdmin && !isFirmLawyer && !isOwningClinic) {
    return NextResponse.json({ error: 'Not authorized for this referral' }, { status: 403 })
  }

  const body = await request.json() as Record<string, unknown>
  const patch: ReferralPatch = {}
  const MAX_OPTIONAL_FIELD = 200

  for (const key of REFERRAL_MUTABLE_FIELDS) {
    const raw = body[key]
    if (raw === undefined) continue
    if (key === 'status') {
      if (typeof raw !== 'string' || !VALID_REFERRAL_STATUSES.includes(raw as typeof VALID_REFERRAL_STATUSES[number])) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      patch.status = raw as typeof VALID_REFERRAL_STATUSES[number]
      continue
    }
    if (typeof raw !== 'string') continue
    const clean = sanitize(raw)
    if (clean.length > MAX_OPTIONAL_FIELD) {
      return NextResponse.json({ error: `${key} exceeds ${MAX_OPTIONAL_FIELD} characters` }, { status: 400 })
    }
    if (key === 'adjusterEmail' && clean && !EMAIL_RE.test(clean)) {
      return NextResponse.json({ error: 'Invalid adjuster email format' }, { status: 400 })
    }
    if (key === 'adjusterPhone' && clean && !isValidPhone(clean)) {
      return NextResponse.json({ error: 'Invalid adjuster phone format' }, { status: 400 })
    }
    patch[key] = clean
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await updateReferralFields(id, patch)
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update referral' }, { status: 500 })
  }
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
