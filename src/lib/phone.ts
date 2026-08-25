/**
 * US phone normalization to E.164.
 *
 * This exists alongside `isValidPhone` in sanitize.ts rather than
 * replacing it. That validator is a character-class check —
 * `/^[+\d\s().-]{7,20}$/` — which accepts '305-555' (six digits) and
 * '(((((((' . Its looseness is deliberate for the free-text phone
 * fields on referral records, and tests/unit/sanitize.test.ts pins
 * that behaviour, so it stays exactly as it is.
 *
 * Nothing loose may reach Twilio. A malformed number is not a
 * rejected send, it is a send to SOMEBODY — a wrong digit is a real
 * person receiving alerts about cases that are not theirs. So this
 * module is strict and returns null rather than guessing.
 *
 * US/Canada only (+1), which is all the data has: every one of the
 * 696 clinics and 176 firms is a NANP number.
 */

/**
 * Normalize a typed US phone to E.164 (+1XXXXXXXXXX), or null.
 *
 * Accepts the shapes people actually type — '(305) 555-1212',
 * '305.555.1212', '1 305 555 1212', '+13055551212' — and rejects
 * anything that is not a valid NANP number.
 */
export function toE164Us(raw: string): string | null {
  if (!raw) return null

  // A letter means a vanity number ('1-800-FLOWERS'). Stripping
  // non-digits would silently truncate it into a different, valid,
  // WRONG number, so refuse instead of guessing.
  if (/[a-z]/i.test(raw)) return null

  const digits = raw.replace(/\D/g, '')

  let national: string
  if (digits.length === 11 && digits.startsWith('1')) {
    national = digits.slice(1)
  } else if (digits.length === 10) {
    national = digits
  } else {
    return null
  }

  // NANP: area code and exchange both start 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null

  return `+1${national}`
}

/** Last four digits, for UI that must not show the whole number. */
export function phoneLast4(e164: string): string {
  return e164.slice(-4)
}

/**
 * '+13055551212' -> '+1305***1212'
 *
 * For logs and activity_logs. The admin panel renders activity_logs,
 * so writing whole numbers there would reintroduce through the back
 * door the PII we strip from the users API.
 */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return '***'
  return `${e164.slice(0, 5)}***${e164.slice(-4)}`
}
