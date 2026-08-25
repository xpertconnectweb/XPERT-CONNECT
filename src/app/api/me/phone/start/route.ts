/**
 * Step 1 of opting in: save a number and text it a code.
 *
 * Lives under /api/me rather than being folded into the admin user
 * routes on purpose. Consent has to be an act by the person who owns
 * the phone; an endpoint an admin can reach is an endpoint that
 * produces consent records nobody actually gave.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { toE164Us } from '@/lib/phone'
import { sendSms } from '@/lib/sms/base'
import { verificationCodeSms } from '@/lib/sms/templates'
import { generateOtpCode, hashOtpCode, otpExpiresAt, OTP_RESEND_COOLDOWN_SECONDS } from '@/lib/sms/otp'
import { isSmsEligibleRole, currentConsentText, CURRENT_CONSENT_VERSION } from '@/lib/sms/consent'
import { isPhoneOptedOut, recordSmsMessage, setPendingPhone } from '@/lib/data'

export const dynamic = 'force-dynamic'

/** Maps the RPC's status string to a response. */
const GATE_MESSAGES: Record<string, string> = {
  cooldown: `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
  locked: 'Too many incorrect codes. Try again in 15 minutes.',
  daily_cap: 'Too many codes requested today. Try again tomorrow.',
  phone_cap: 'Too many codes requested for this number today.',
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  if (!isSmsEligibleRole(session.user.role)) {
    // A partner submits referrals and a directory user browses
    // attorneys; neither can ever receive one, so alerts would be a
    // switch that turns nothing on.
    return NextResponse.json(
      { error: 'SMS alerts are only available to clinic and attorney accounts' },
      { status: 403 }
    )
  }

  let body: { phone?: string; consent?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
  }

  if (body.consent !== true) {
    return NextResponse.json({ error: 'Consent is required' }, { status: 400 })
  }

  const phone = toE164Us(String(body.phone ?? ''))
  if (!phone) {
    return NextResponse.json(
      { error: 'Enter a valid 10-digit US mobile number' },
      { status: 400 }
    )
  }

  // Refuse before spending anything. If this number told the carrier
  // STOP, Twilio will reject every send with 21610 anyway — the user
  // would see "alerts on" and never receive one, with nothing on
  // screen explaining why.
  if (await isPhoneOptedOut(phone)) {
    return NextResponse.json(
      {
        error:
          'This number has unsubscribed from our messages. Text START to our number to re-enable it, then try again.',
      },
      { status: 409 }
    )
  }

  const code = generateOtpCode()
  const expiresAt = otpExpiresAt()

  // The cooldown, attempt and daily caps are claimed atomically in
  // Postgres. Doing the read-modify-write in JS races: two concurrent
  // requests both read the old row and both send.
  const { data: gate, error: gateError } = await supabaseAdmin.rpc('claim_otp_send', {
    p_user_id: session.user.id,
    p_phone: phone,
    p_code_hash: hashOtpCode(session.user.id, code),
    p_expires_at: expiresAt.toISOString(),
  })

  if (gateError) {
    console.error('claim_otp_send error:', gateError)
    return NextResponse.json({ error: 'Could not send a code right now' }, { status: 500 })
  }

  if (gate !== 'ok') {
    return NextResponse.json(
      { error: GATE_MESSAGES[gate as string] ?? 'Too many attempts' },
      { status: 429 }
    )
  }

  const result = await sendSms({ to: phone, body: verificationCodeSms(code) })

  await recordSmsMessage({
    userId: session.user.id,
    to: phone,
    kind: 'otp',
    twilioSid: result.ok ? result.sid : undefined,
    status: result.ok ? 'queued' : 'failed',
    errorCode: result.ok ? undefined : result.code,
  })

  if (!result.ok) {
    if (result.kind === 'config') {
      return NextResponse.json({ error: 'SMS is not enabled yet' }, { status: 503 })
    }
    if (result.kind === 'undeliverable') {
      return NextResponse.json(
        { error: 'That number cannot receive text messages. Is it a landline?' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Could not send the code. Try again.' }, { status: 502 })
  }

  // Store the number, but reset everything downstream of it. Changing
  // the phone invalidates the previous verification and consent —
  // otherwise a verified user could swap in an arbitrary number and
  // keep the "verified" state that was earned by a different one.
  await setPendingPhone(session.user.id, phone, {
    version: CURRENT_CONSENT_VERSION,
    text: currentConsentText(),
  })

  return NextResponse.json({ ok: true, cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS })
}
