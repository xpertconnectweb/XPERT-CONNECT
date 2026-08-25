/**
 * Admin revocation of a user's phone and SMS consent.
 *
 * Note what is missing: there is no PATCH, no POST, no way for an
 * admin to SET a phone number or switch alerts on. That asymmetry is
 * deliberate and it is the whole point of this file — consent typed
 * in by a third party is not consent, and it is exactly the fact
 * pattern a TCPA claim is built on. Revocation is always safe, and
 * it is needed for the real cases: a user leaves, a number is
 * recycled, or somebody phones in to be taken off the list.
 *
 * Its own route rather than a key on the user PATCH so that a stray
 * field in a form submission can never trigger it, and so it gets its
 * own audit entry.
 */
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getUserById, clearUserPhone } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin()
  if (error) return error

  const { id } = await params

  const user = await getUserById(id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await clearUserPhone(id)

  await logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.username ?? session.user.id,
    action: 'sms_consent_changed',
    targetType: 'user',
    targetId: id,
    targetName: user.name,
    details: { event: 'admin_cleared_phone' },
  })

  return NextResponse.json({ ok: true })
}
