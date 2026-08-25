/**
 * Twilio transport.
 *
 * Raw fetch rather than the `twilio` SDK. The whole outbound surface
 * is one form-encoded POST with Basic auth, and the SDK would drag
 * axios, dayjs, xmlbuilder and friends into a serverless bundle to
 * save four lines. It also follows the house pattern for third-party
 * HTTP set by src/app/api/geocode/route.ts — named constants,
 * AbortController with a timeout, upstream shapes mapped to our own
 * types and never leaked.
 *
 * DELIBERATE DIVERGENCE FROM sendEmail: this returns a result and
 * never throws, where `sendEmail` (src/lib/email/base.ts:26) throws
 * and returns void. Read that as a decision, not an oversight:
 *
 *   * Every message costs money. Email failures currently vanish
 *     into console.error inside three catch blocks in the referrals
 *     route; repeating that for a paid channel means never noticing
 *     that SMS spend is 100% failing.
 *   * Failures here are semantic. Twilio 21610 means "this number
 *     told the carrier STOP" and must write an opt-out row so we
 *     stop paying and stop telling the user their alerts are on.
 *     Recovering that from a thrown Error means string-matching.
 *   * The only caller is a waitUntil background task that must never
 *     reject. A function that cannot throw keeps that integration to
 *     a single line with no try/catch.
 *
 * Do not "harmonise" sendEmail to match. Its throwing contract is
 * load-bearing for existing tests and is out of scope here.
 */
import { assertSingleSegment } from './gsm7'

const TWILIO_API_ROOT = 'https://api.twilio.com/2010-04-01/Accounts'
const UPSTREAM_TIMEOUT_MS = 8000

/**
 * Twilio error codes we treat as meaningful rather than generic.
 * https://www.twilio.com/docs/api/errors
 */
const TWILIO_OPTED_OUT = 21610
const TWILIO_UNDELIVERABLE = new Set([
  21211, // invalid 'To' number
  21614, // 'To' is not a mobile number
  30003, // unreachable handset
  30005, // unknown destination
  30006, // landline, or carrier cannot receive
])

export type SmsFailureKind =
  | 'config' // env missing — the hard, fail-closed gate
  | 'invalid_to' // not E.164; a bug upstream of here
  | 'too_long' // over one segment; a template bug
  | 'opted_out' // carrier has this number on STOP
  | 'undeliverable' // landline, disconnected, unreachable
  | 'upstream' // Twilio 5xx or an error code we do not classify
  | 'timeout'

export type SmsResult =
  | { ok: true; sid: string; to: string }
  | { ok: false; kind: SmsFailureKind; code?: number; message: string }

interface TwilioMessageResponse {
  sid?: string
  status?: string
  code?: number
  message?: string
}

/** All five must be present or the send path stays inert. */
export function twilioConfig(): { accountSid: string; authToken: string; messagingServiceSid: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  if (!accountSid || !authToken || !messagingServiceSid) return null
  return { accountSid, authToken, messagingServiceSid }
}

function classify(code: number | undefined, message: string): SmsResult {
  if (code === TWILIO_OPTED_OUT) {
    return { ok: false, kind: 'opted_out', code, message }
  }
  if (code !== undefined && TWILIO_UNDELIVERABLE.has(code)) {
    return { ok: false, kind: 'undeliverable', code, message }
  }
  return { ok: false, kind: 'upstream', code, message }
}

/**
 * Send one message.
 *
 * `to` must already be E.164 — normalize with toE164Us before
 * calling. Returns `{ ok: true }` when Twilio accepted the message,
 * which means QUEUED, not delivered: the failures that matter for a
 * new toll-free number (30032 not verified, 30007 filtered) arrive
 * later on a status callback we do not yet consume. Nothing may
 * render this as "Delivered".
 */
export async function sendSms(opts: { to: string; body: string }): Promise<SmsResult> {
  const config = twilioConfig()
  if (!config) {
    return { ok: false, kind: 'config', message: 'Twilio is not configured' }
  }

  if (!/^\+1\d{10}$/.test(opts.to)) {
    return { ok: false, kind: 'invalid_to', message: `Not an E.164 US number: ${opts.to}` }
  }

  try {
    assertSingleSegment(opts.body)
  } catch (err) {
    return { ok: false, kind: 'too_long', message: (err as Error).message }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')

    const res = await fetch(`${TWILIO_API_ROOT}/${config.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        // A Messaging Service rather than a bare From. It costs
        // nothing, it is what enables Twilio's Advanced Opt-Out to
        // enforce STOP for us, and it makes a future move from
        // toll-free to 10DLC a pure environment change.
        MessagingServiceSid: config.messagingServiceSid,
        To: opts.to,
        Body: opts.body,
      }),
      signal: controller.signal,
    })

    const payload = (await res.json().catch(() => ({}))) as TwilioMessageResponse

    if (!res.ok) {
      return classify(payload.code, payload.message || `Twilio responded ${res.status}`)
    }

    if (!payload.sid) {
      return { ok: false, kind: 'upstream', message: 'Twilio accepted the message but returned no sid' }
    }

    return { ok: true, sid: payload.sid, to: opts.to }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: `Twilio did not respond in ${UPSTREAM_TIMEOUT_MS}ms` }
    }
    return { ok: false, kind: 'upstream', message: (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
}
