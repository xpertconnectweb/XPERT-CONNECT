/**
 * The user's own notification state, and the switch itself.
 *
 * The UI reads GET rather than deriving anything from the session:
 * the JWT refreshes from the database only every five minutes
 * (lib/auth.ts), and a consent flag that can be five minutes stale is
 * a consent flag that keeps texting somebody who just turned it off.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getUserById, isPhoneOptedOut, setSmsAlerts } from '@/lib/data'
import { phoneLast4 } from '@/lib/phone'
import { currentConsentText, isSmsEligibleRole, CURRENT_CONSENT_VERSION } from '@/lib/sms/consent'
import { sendSms, twilioConfig } from '@/lib/sms/base'
import { optInConfirmationSms } from '@/lib/sms/templates'
import { recordSmsMessage } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const user = await getUserById(session.user.id)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const optedOut = user.phoneE164 ? await isPhoneOptedOut(user.phoneE164) : false

  return NextResponse.json({
    eligible: isSmsEligibleRole(user.role),
    // Never the whole number, not even to its owner: this response
    // is the one an XSS would read.
    phoneLast4: user.phoneE164 ? phoneLast4(user.phoneE164) : null,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    smsReferralAlerts: Boolean(user.smsReferralAlerts),
    optedOut,
    consentText: currentConsentText(),
    consentVersion: CURRENT_CONSENT_VERSION,
    smsAvailable: Boolean(twilioConfig()),
  })
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  let body: { smsReferralAlerts?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
  }

  if (typeof body.smsReferralAlerts !== 'boolean') {
    return NextResponse.json({ error: 'smsReferralAlerts must be a boolean' }, { status: 400 })
  }

  const enable = body.smsReferralAlerts

  // Turning alerts OFF is never blocked — not by eligibility, not by
  // a missing phone, not by an opt-out. A revocation path with
  // preconditions is a revocation path that fails when it matters.
  if (!enable) {
    await setSmsAlerts(session.user.id, false)
    await logActivity({
      userId: session.user.id,
      userName: session.user.name ?? session.user.username ?? session.user.id,
      action: 'sms_consent_changed',
      targetType: 'user',
      targetId: session.user.id,
      details: { event: 'alerts_disabled' },
    })
    return NextResponse.json({ ok: true, smsReferralAlerts: false })
  }

  const user = await getUserById(session.user.id)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!isSmsEligibleRole(user.role)) {
    return NextResponse.json(
      { error: 'SMS alerts are only available to clinic and attorney accounts' },
      { status: 403 }
    )
  }

  if (!user.phoneE164 || !user.phoneVerifiedAt) {
    return NextResponse.json({ error: 'Verify a phone number first' }, { status: 400 })
  }

  if (await isPhoneOptedOut(user.phoneE164)) {
    return NextResponse.json(
      { error: 'This number has unsubscribed. Text START to our number to re-enable it.' },
      { status: 409 }
    )
  }

  await setSmsAlerts(session.user.id, true)

  await logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.username ?? session.user.id,
    action: 'sms_consent_changed',
    targetType: 'user',
    targetId: session.user.id,
    details: { event: 'alerts_enabled', consentVersion: user.smsConsentVersion },
  })

  // The confirmation Twilio's toll-free form declares as
  // OptInConfirmationMessage. Best-effort: a failure here must not
  // undo a switch the user successfully flipped.
  const result = await sendSms({ to: user.phoneE164, body: optInConfirmationSms() })
  await recordSmsMessage({
    userId: user.id,
    to: user.phoneE164,
    kind: 'opt_in_confirmation',
    twilioSid: result.ok ? result.sid : undefined,
    status: result.ok ? 'queued' : 'failed',
    errorCode: result.ok ? undefined : result.code,
  })

  return NextResponse.json({ ok: true, smsReferralAlerts: true })
}
