/**
 * The consent language, versioned and append-only.
 *
 * This string is the product's legal position. It appears in three
 * places that must never disagree:
 *
 *   1. Beside the checkbox on /professionals/notifications.
 *   2. On the public /sms-terms page — which exists because the
 *      opt-in screen sits behind a login and the carrier reviewing
 *      the toll-free application cannot see it.
 *   3. In the `UseCaseSummary` / opt-in section of the toll-free
 *      verification form submitted to Twilio.
 *
 * A copy of the exact text is written to `users.sms_consent_text` at
 * the moment of opt-in. That is not redundancy with the version id:
 * a TCPA defense rests on producing WHAT the user agreed to, and a
 * version id only points at whatever this constant says today.
 *
 * NEVER edit an existing entry. Add a new version and bump
 * CURRENT_CONSENT_VERSION, or every historic consent record starts
 * describing terms its signer never saw.
 */

export const SMS_CONSENT_TEXTS: Record<string, string> = {
  'sms-consent-v1':
    'I agree to receive text message alerts from Xpert Connect at the ' +
    'mobile number above when a new patient referral is sent to me. ' +
    'Message frequency varies with referral volume. Message and data ' +
    'rates may apply. Reply STOP at any time to unsubscribe, or HELP ' +
    'for help. Consent is not a condition of using Xpert Connect, and ' +
    'no patient information is ever included in these messages.',
}

export const CURRENT_CONSENT_VERSION = 'sms-consent-v1'

export function currentConsentText(): string {
  return SMS_CONSENT_TEXTS[CURRENT_CONSENT_VERSION]
}

/**
 * The roles that can receive a referral, and therefore the only ones
 * for whom SMS alerts mean anything.
 *
 * A `partner` and a `referrer` submit referrals; a `directory` user
 * browses attorneys; an `admin` uses the internal email. Letting any
 * of them opt in would produce a switch that turns nothing on — and
 * a number we would still be paying to verify.
 */
export const SMS_ELIGIBLE_ROLES = ['clinic', 'lawyer'] as const

export function isSmsEligibleRole(role: string | undefined): boolean {
  return (SMS_ELIGIBLE_ROLES as readonly string[]).includes(role ?? '')
}
