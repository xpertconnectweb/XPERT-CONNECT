/**
 * Fan a referral alert out to the people entitled to receive one.
 *
 * This function is the whole consent gate. It is called from inside
 * the `waitUntil` blocks in the referrals route and MUST NEVER THROW
 * or reject — a rejected background promise on Vercel is an unhandled
 * rejection that can take the whole invocation with it, and the email
 * that matters is sent in the same block.
 */
import type { User } from '@/types/professionals'
import { sendSms, twilioConfig } from './base'
import { referralAlertSms } from './templates'
import {
  getActiveOptOuts,
  recordOptOut,
  recordSmsMessage,
  disableAlertsForPhone,
  markSmsSent,
  smsNotificationsEnabled,
} from '@/lib/data'
import { maskPhone } from '@/lib/phone'

/**
 * Gap between messages.
 *
 * Not the 600ms the email loop uses — that number is tuned to
 * Resend's free-tier rate limit and has nothing to do with Twilio.
 * `waitUntil` is bounded by the function's max duration, so every
 * millisecond here is one the email loop after it does not get.
 */
export const SMS_PACING_MS = 350

/**
 * A single referral cannot text more than this many people.
 *
 * A blast radius cap, not a business rule. Without it a clinic with
 * forty staff accounts turns one referral into forty messages.
 */
export const MAX_SMS_PER_REFERRAL = 10

/** Skip anyone already texted this recently. */
export const PER_USER_THROTTLE_MS = 60_000

// Indirected so tests can assert the pacing happened. tests/setup.ts
// replaces global setTimeout with a 0ms version, so asserting elapsed
// wall-clock time would silently pass no matter what.
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

interface ReferralContext {
  referralId: string
  /** The referring clinic or firm. Not patient data. */
  orgName?: string
}

/**
 * Who, of these users, may be texted right now.
 *
 * Exported for the unit tests, because every clause here is a
 * separate way to text somebody who did not agree to it.
 */
export function eligibleForSms(users: User[], now = Date.now()): User[] {
  const seenPhones = new Set<string>()
  const out: User[] = []

  for (const user of users) {
    if (!user.phoneE164) continue
    if (!user.phoneVerifiedAt) continue // typed but never proven
    if (!user.smsReferralAlerts) continue // no consent, or revoked

    // Dedupe by NUMBER rather than by user id: two staff accounts
    // sharing one front-desk mobile is one message and one charge,
    // not two of each.
    if (seenPhones.has(user.phoneE164)) continue

    if (user.smsLastSentAt) {
      const since = now - new Date(user.smsLastSentAt).getTime()
      if (since >= 0 && since < PER_USER_THROTTLE_MS) continue
    }

    seenPhones.add(user.phoneE164)
    out.push(user)
  }

  return out
}

export async function notifyUsersOfReferral(
  users: User[],
  ctx: ReferralContext
): Promise<void> {
  try {
    // Hard gate, fails closed. With no Twilio secrets present nothing
    // is sent and nothing is logged — which is also what makes a
    // checkout of this public repository inert.
    if (!twilioConfig()) return

    if (users.length === 0) return

    const candidates = eligibleForSms(users)
    if (candidates.length === 0) return

    // Soft gate. Read AFTER the cheap filters so a referral to people
    // who all opted out costs no query.
    if (!(await smsNotificationsEnabled())) return

    const optedOut = await getActiveOptOuts(candidates.map((u) => u.phoneE164 as string))
    const recipients = candidates
      .filter((u) => !optedOut.has(u.phoneE164 as string))
      .slice(0, MAX_SMS_PER_REFERRAL)

    if (candidates.length > MAX_SMS_PER_REFERRAL) {
      console.warn(
        `[sms] referral ${ctx.referralId}: capped at ${MAX_SMS_PER_REFERRAL} of ${candidates.length} recipients`
      )
    }

    const body = referralAlertSms(ctx.orgName)

    for (let i = 0; i < recipients.length; i++) {
      const user = recipients[i]
      const to = user.phoneE164 as string

      if (i > 0) await sleep(SMS_PACING_MS)

      const result = await sendSms({ to, body })

      if (result.ok) {
        await recordSmsMessage({
          userId: user.id,
          to,
          kind: 'referral_alert',
          twilioSid: result.sid,
          status: 'queued',
        })
        await markSmsSent(user.id)
        continue
      }

      await recordSmsMessage({
        userId: user.id,
        to,
        kind: 'referral_alert',
        status: 'failed',
        errorCode: result.code,
      })

      // Never the whole number: these logs end up quoted in issues,
      // and the repository is public.
      console.error(`[sms] ${maskPhone(to)} ${result.kind}: ${result.message}`)

      // The carrier says this number is unsubscribed. Believe it, or
      // we keep paying for messages nobody receives and keep telling
      // the user their alerts are on.
      if (result.kind === 'opted_out') {
        await recordOptOut(to, 'twilio_21610')
        await disableAlertsForPhone(to)
      }
    }
  } catch (err) {
    // The contract of this function is that it cannot fail the caller.
    console.error('[sms] notifyUsersOfReferral failed:', err)
  }
}
