/**
 * Twilio webhook signature verification.
 *
 * Twilio signs every inbound request with `X-Twilio-Signature`:
 * HMAC-SHA1, keyed by the account auth token, over the full public
 * URL with the POST parameters sorted by name and concatenated
 * key-then-value directly onto it. The digest is base64.
 *
 * Implemented here rather than pulled from the `twilio` SDK for one
 * reason that matters more than bundle size: as a plain exported
 * function it can be unit-tested against Twilio's own published test
 * vector. Trusting the SDK means trusting that the webhook is
 * verified; this way we prove it.
 */
import crypto from 'node:crypto'

/**
 * Build the string Twilio signed, then HMAC it.
 *
 * @param url    The exact public URL configured in the Twilio
 *               console — scheme, host and path, no query string
 *               unless the console has one.
 * @param params The POST body parameters.
 */
export function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string
): string {
  // Sort by key, then append key immediately followed by value. No
  // separators — that is the part everyone gets wrong.
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)

  return crypto.createHmac('sha1', authToken).update(Buffer.from(payload, 'utf-8')).digest('base64')
}

/**
 * Constant-time comparison of the expected and received signatures.
 *
 * `crypto.timingSafeEqual` throws a RangeError when the two buffers
 * differ in length, so an attacker sending a one-character signature
 * would turn a clean 403 into an unhandled 500 — and a 500 on a
 * webhook is a retry storm rather than a rejection. The length check
 * has to come first, and it leaks nothing: the length of a base64
 * SHA-1 digest is public knowledge.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  received: string | null
): boolean {
  if (!received) return false

  const expected = computeTwilioSignature(url, params, authToken)
  const a = Buffer.from(expected, 'utf-8')
  const b = Buffer.from(received, 'utf-8')

  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}
