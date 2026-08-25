/**
 * Verification code generation and hashing.
 *
 * Why SHA-256 with a pepper rather than bcrypt — this is the first
 * question any reviewer asks, so the answer lives next to the code:
 *
 * bcrypt's value is making an offline brute force expensive. A
 * six-digit code has a million possibilities, and a million bcrypt
 * evaluations is a coffee break, not a defense. What actually
 * protects the code is the five-attempt cap and the ten-minute
 * expiry, both enforced atomically in Postgres.
 *
 * The pepper is what makes the stored hash useless on its own. It
 * lives in the environment, never in the database, so an attacker
 * holding a full database dump still cannot turn `code_hash` back
 * into a code. bcrypt would add 60-100ms to a serverless invocation
 * and buy nothing the pepper does not already provide.
 */
import crypto from 'node:crypto'

export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_SECONDS = 60

/**
 * A uniformly random six-digit code.
 *
 * `crypto.randomInt`, never `Math.random()` — the latter is seeded
 * predictably and is not a security primitive.
 *
 * Codes that look "weak" (000000, 123456) are deliberately NOT
 * excluded. Filtering them shrinks the search space, which helps the
 * attacker rather than the user.
 */
export function generateOtpCode(): string {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0')
}

/**
 * Hash a code for storage.
 *
 * Bound to the user id as well as the pepper, so a hash lifted from
 * one row cannot be replayed against another user's verification.
 */
export function hashOtpCode(userId: string, code: string): string {
  const pepper = process.env.PHONE_OTP_PEPPER
  if (!pepper) {
    // Fail closed. Hashing with an empty pepper would silently
    // produce a value an attacker with the database could reverse,
    // and it would keep working, which is the dangerous part.
    throw new Error('PHONE_OTP_PEPPER is not set')
  }

  return crypto.createHash('sha256').update(`${userId}:${code}:${pepper}`).digest('hex')
}

export function otpExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MINUTES * 60_000)
}
