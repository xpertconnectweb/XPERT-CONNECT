/**
 * Remove your own number.
 *
 * Clears the phone, the verification, and the consent record — but
 * deliberately leaves any `sms_opt_outs` row alone. That row belongs
 * to the NUMBER, not to the account, and deleting it here would let
 * someone erase the proof that their STOP was honoured simply by
 * removing the phone from their profile.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { clearUserPhone } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  const { session, error } = await requireAuth()
  if (error) return error

  await clearUserPhone(session.user.id)

  await logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.username ?? session.user.id,
    action: 'sms_consent_changed',
    targetType: 'user',
    targetId: session.user.id,
    details: { event: 'phone_removed' },
  })

  return NextResponse.json({ ok: true })
}
