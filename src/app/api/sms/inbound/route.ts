/**
 * Inbound SMS webhook — STOP, START and HELP.
 *
 * This is the only unauthenticated route the SMS feature adds.
 * `src/middleware.ts` matches only /professionals, /admin and
 * /partners, so nothing upstream guards it: the signature check
 * below is the entire door.
 *
 * Twilio's Advanced Opt-Out already enforces STOP at the sender and
 * sends the reply, so this handler answers with empty TwiML rather
 * than texting the user a second time. What it is FOR is our own
 * bookkeeping: without a local record we keep paying for messages the
 * carrier drops, keep telling the user in the UI that their alerts
 * are on, and have no audit trail if the opt-out is ever disputed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyTwilioSignature } from '@/lib/sms/signature'
import { toE164Us } from '@/lib/phone'
import { recordOptOut, recordOptIn, disableAlertsForPhone } from '@/lib/data'

export const dynamic = 'force-dynamic'

// The carrier keyword sets, per CTIA guidelines.
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout'])
const START_WORDS = new Set(['start', 'unstop', 'yes', 'optin'])
const HELP_WORDS = new Set(['help', 'info'])

/** Empty TwiML: acknowledged, and Twilio owns the reply. */
function twiml(): NextResponse {
  return new NextResponse('<Response/>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL

  // Fail closed and loudly. The keep-alive route compares against
  // `Bearer ${process.env.CRON_SECRET}` with no presence check, so an
  // unset variable there means a literal "Bearer undefined" is
  // accepted. Do not reproduce that here: a missing secret is a
  // misconfiguration, not an open door.
  if (!authToken || !webhookUrl) {
    console.error('[sms] inbound webhook is not configured (TWILIO_AUTH_TOKEN / TWILIO_WEBHOOK_URL)')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  let params: Record<string, string>
  try {
    const form = await request.formData()
    params = Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [key, String(value)])
    )
  } catch {
    // Twilio posts application/x-www-form-urlencoded, never JSON.
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 })
  }

  // The signed URL must be the public one, taken from configuration.
  // Behind Vercel's proxy `request.url` can report http:// and a
  // deployment hostname, and a single character of difference makes
  // every legitimate signature fail — which would silently reject
  // every STOP.
  const signature = request.headers.get('x-twilio-signature')
  if (!verifyTwilioSignature(webhookUrl, params, authToken, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const from = toE164Us(params.From ?? '')
  if (!from) return twiml()

  const keyword = (params.Body ?? '').trim().toLowerCase()

  if (STOP_WORDS.has(keyword)) {
    // Both writes matter, and they are not redundant. The opt-out row
    // is the source of truth and survives the account being deleted;
    // the user flag is the UI mirror, so the settings page does not
    // keep claiming alerts are on.
    await recordOptOut(from, 'stop_keyword', keyword)
    await disableAlertsForPhone(from)
    return twiml()
  }

  if (START_WORDS.has(keyword)) {
    // Lifts the block on the number but deliberately does NOT switch
    // alerts back on. Texting START says "you may contact me again",
    // not "resume the specific alerts I turned off" — re-consent is
    // an act in the product.
    await recordOptIn(from)
    return twiml()
  }

  if (HELP_WORDS.has(keyword)) {
    // Twilio's Messaging Service answers HELP from the string
    // configured in the console. Keep that console string in step
    // with HELP_REPLY in lib/sms/templates.ts.
    return twiml()
  }

  // Anything else is a human replying to an alert. Acknowledge it so
  // Twilio does not retry, and do nothing.
  return twiml()
}
