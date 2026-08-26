import { createHash } from 'node:crypto'

/**
 * Session tokens for the providers that bill per session rather than per
 * keystroke.
 *
 * Google and Mapbox both price autocomplete as "N cheap suggestions plus one
 * chargeable resolution", and the token is what ties those calls together. Get
 * it wrong and every keystroke becomes its own billable session — the
 * difference between a few dollars a month and a few hundred.
 *
 * The API key lives on the server, so the token has to originate somewhere the
 * client can influence. Three options were considered:
 *
 *  (a) The client generates the UUID and it is forwarded verbatim. Rejected: a
 *      client can then reuse one token forever, or send a value that is not a
 *      UUID at all, and we would be passing unvalidated user input straight to
 *      a paid upstream.
 *  (b) The client supplies an opaque id and the SERVER namespaces it. Chosen.
 *  (c) Server-only, keyed by user id. Rejected: two tabs would collide, and
 *      more importantly module state is per-lambda, so the token would differ
 *      by instance and the session grouping — the entire point — would break.
 *
 * Rotation is the CLIENT's job, because only the client knows when a search
 * episode ended. Deliberately not attempted here: a "spent tokens" set in
 * module scope would be wrong on the first cold start and silently
 * over-bill from then on, which is worse than not trying.
 */

/** What the client is allowed to send as `sid`. */
const SID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidSid(sid: string | null | undefined): sid is string {
  return typeof sid === 'string' && SID_PATTERN.test(sid)
}

/**
 * Namespaces the caller's session id with their user id.
 *
 * Two users who happen to send the same `sid` — a copied URL, a shared test
 * fixture, a client with a weak generator — must not land in the same upstream
 * session, or one user's keystrokes get billed against the other's resolution
 * and the grouping is wrong for both.
 *
 * The output is shaped as a v4 UUID because Mapbox requires that form and
 * Google recommends it. The version and variant nibbles are forced rather than
 * hashed, which is what makes it a valid v4 rather than merely 32 hex
 * characters with dashes in the right places.
 */
export function deriveSessionToken(userId: string, sid: string): string {
  const hex = createHash('sha256').update(`${userId}:${sid}`).digest('hex')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}
