import crypto from 'node:crypto'

/**
 * Constant-time string comparison.
 *
 * `!==` returns as soon as the first byte differs, which leaks how much
 * of a guessed secret was right. Hashing both sides first makes the
 * inputs equal-length, so `timingSafeEqual` never throws and the length
 * of the real secret is not revealed either.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest()
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest()
  return crypto.timingSafeEqual(ha, hb)
}

/**
 * Does the request carry `Authorization: Bearer <process.env[envName]>`?
 *
 * Fails CLOSED when the variable is unset or empty. The old inline check
 * compared against the template string `Bearer ${process.env.X}`, which
 * with X unset is the literal "Bearer undefined" — a header anyone can
 * send.
 */
export function hasBearerSecret(
  headers: Headers,
  envName: string
): boolean {
  const secret = process.env[envName]
  if (!secret) return false
  const header = headers.get('authorization') ?? ''
  return safeEqual(header, `Bearer ${secret}`)
}
