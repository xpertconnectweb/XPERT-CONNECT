/**
 * Every SMS body the platform can send.
 *
 * Three rules hold for all of them:
 *
 *  1. One segment. Each body is asserted under 160 GSM-7 characters
 *     at construction, so a template that outgrows the budget fails
 *     in the unit tests rather than doubling the bill in production.
 *  2. No patient data. Not a name, not a phone, not an injury, not a
 *     date. The referral email carries all of that; SMS travels
 *     unencrypted across carrier networks, and keeping PHI out of it
 *     is what avoids needing a signed BAA with Twilio.
 *  3. Opt-out language in every body, per TCPA and the carriers'
 *     own filtering rules.
 */
import { assertSingleSegment, toGsm7, MAX_SEGMENT_CHARS } from './gsm7'
import { COMPANY_PHONE } from '@/lib/constants'

/**
 * Short link, so a long firm name still fits in one segment.
 * '844xpert.com/r' is 14 characters against 44 for the full URL.
 *
 * Deliberately our own domain. Carriers filter shared shorteners
 * (bit.ly and friends) aggressively, and the result is silent
 * non-delivery — the message is accepted, billed, and never arrives.
 */
export const SMS_SHORT_LINK = '844xpert.com/r'

/** Beyond this, a firm name is truncated rather than dropped. */
export const MAX_ORG_CHARS = 40

/**
 * Fit an organisation name into the alert.
 *
 * Truncates on a word boundary where possible. Returns null when
 * nothing usable survives — an all-emoji name, or one that reduces
 * to whitespace — so the caller can fall back to the generic body
 * rather than sending "new referral from .".
 */
export function truncateOrg(rawName: string, max = MAX_ORG_CHARS): string | null {
  const clean = toGsm7(rawName).replace(/\s+/g, ' ').trim()
  if (!clean) return null
  if (clean.length <= max) return clean

  const cut = clean.slice(0, max)

  // The cut already lands on a word boundary — no need to back off.
  if (clean[max] === ' ') return cut.trim() || null

  const lastSpace = cut.lastIndexOf(' ')

  // Back off to a word boundary, but only if that leaves something
  // recognisable. "Morgan" beats "M" as an abbreviation of a firm.
  const trimmed = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut
  return trimmed.trim() || null
}

/**
 * The alert itself.
 *
 * `orgName` is the referring clinic or firm — not patient data, and
 * it is the single most useful thing the recipient can be told in 40
 * characters. Pass undefined to send the generic body.
 */
export function referralAlertSms(orgName?: string): string {
  const org = orgName ? truncateOrg(orgName) : null

  if (org) {
    return assertSingleSegment(
      `Xpert Connect: new referral from ${org}. Sign in: ${SMS_SHORT_LINK} Reply STOP to end.`
    )
  }

  return assertSingleSegment(
    `Xpert Connect: you have a new referral. Sign in to view: ${SMS_SHORT_LINK} Reply STOP to end.`
  )
}

/**
 * The verification code.
 *
 * Deliberately contains NO link. Carriers filter one-time-code
 * traffic that also carries a URL far more aggressively than plain
 * code messages, and a filtered OTP is indistinguishable to the user
 * from a broken product.
 */
export function verificationCodeSms(code: string): string {
  return assertSingleSegment(
    `Xpert Connect: your verification code is ${code}. It expires in 10 minutes. Reply STOP to end, HELP for help.`
  )
}

/**
 * Sent once, when alerts are switched on.
 *
 * This is the `OptInConfirmationMessage` declared on the toll-free
 * verification form; keep the two in step.
 */
export function optInConfirmationSms(): string {
  return assertSingleSegment(
    `Xpert Connect: SMS alerts are on. We text you when a referral arrives. Msg&data rates may apply. Reply STOP to end.`
  )
}

/**
 * HELP and STOP replies.
 *
 * We do not send these ourselves. With a Messaging Service and
 * Advanced Opt-Out enabled, Twilio owns both the enforcement and the
 * reply, and our webhook answers with empty TwiML so the user is not
 * texted twice. They live here because they are the authoritative
 * source for the strings pasted into the Twilio console and onto the
 * verification form — if they drift, the console is wrong.
 */
export const HELP_REPLY = assertSingleSegment(
  `Xpert Connect referral alerts. Msg&data rates may apply. Reply STOP to end. Help: 844xpert.com or ${COMPANY_PHONE}`
)

export const STOP_REPLY = assertSingleSegment(
  'Xpert Connect: you are unsubscribed and will get no more messages. Reply START to resume.'
)

/** Exposed so tests can assert the budget rather than restate it. */
export const SEGMENT_LIMIT = MAX_SEGMENT_CHARS
