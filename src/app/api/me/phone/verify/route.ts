/**
 * Step 2 of opting in: prove the number is yours.
 *
 * Succeeding here marks the phone verified and NOTHING ELSE. Turning
 * alerts on is a separate, deliberate act against
 * POST /api/me/notifications. Proving you own a number is not the
 * same as asking to be texted, and collapsing the two would mean the
 * verification message itself produced the consent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { hashOtpCode, OTP_LENGTH, OTP_MAX_ATTEMPTS } from '@/lib/sms/otp'
import { markPhoneVerified } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

const FAILURES: Record<string, { status: number; error: string }> = {
  none: { status: 400, error: 'Request a code first' },
  expired: { status: 400, error: 'That code has expired. Request a new one.' },
  locked: { status: 429, error: `Too many incorrect codes. Try again in 15 minutes.` },
  bad: { status: 400, error: 'That code is not correct' },
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
  }

  const code = String(body.code ?? '').trim()
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
    return NextResponse.json({ error: `Enter the ${OTP_LENGTH}-digit code` }, { status: 400 })
  }

  // The comparison and the attempt counter move together, in one
  // statement. Reading the row and deciding in JS would let a
  // parallel burst of guesses all read `attempts` before any of them
  // wrote it, which turns a 5-attempt cap into no cap at all.
  const { data: outcome, error: rpcError } = await supabaseAdmin.rpc('claim_otp_attempt', {
    p_user_id: session.user.id,
    p_code_hash: hashOtpCode(session.user.id, code),
  })

  if (rpcError) {
    console.error('claim_otp_attempt error:', rpcError)
    return NextResponse.json({ error: 'Could not verify right now' }, { status: 500 })
  }

  if (outcome !== 'ok') {
    const failure = FAILURES[outcome as string] ?? FAILURES.bad
    return NextResponse.json(
      { error: failure.error, attemptsAllowed: OTP_MAX_ATTEMPTS },
      { status: failure.status }
    )
  }

  await markPhoneVerified(session.user.id)
  await supabaseAdmin.from('phone_verifications').delete().eq('user_id', session.user.id)

  await logActivity({
    userId: session.user.id,
    userName: session.user.name ?? session.user.username ?? session.user.id,
    action: 'sms_consent_changed',
    targetType: 'user',
    targetId: session.user.id,
    details: { event: 'phone_verified' },
  })

  return NextResponse.json({ ok: true, phoneVerified: true, smsReferralAlerts: false })
}
