import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { newsletterSubscriptionEmail, newsletterWelcomeEmail } from '@/lib/email'
import { isPublicEmail } from '@/lib/validation'
import { readJsonBody, str } from '@/lib/security/http'
import { RATE_LIMITS, clientIp, enforceRateLimits } from '@/lib/security/rate-limit'

export async function POST(request: Request) {
  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response

  const email = str(parsed.body.email)

  if (!email) {
    return NextResponse.json({ ok: false, error: 'Email is required.' }, { status: 400 })
  }

  if (!isPublicEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email.' }, { status: 400 })
  }

  // Sends a welcome email to the address typed — same abuse as /api/contact.
  const limited = await enforceRateLimits([
    [RATE_LIMITS.newsletterPerIp, clientIp(request.headers)],
    [RATE_LIMITS.newsletterPerEmail, email],
  ])
  if (limited) return limited

  /**
   * `ignoreDuplicates` + `select` returns a row only when the address is
   * new. The upsert used to succeed either way and both emails went out
   * on every submit, so re-posting one address mailed it again each time.
   */
  const { data, error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
    .select('id')

  if (error) {
    console.error('Failed to save newsletter subscriber:', error.code, error.message)
    return NextResponse.json({ ok: false, error: 'Failed to subscribe.' }, { status: 500 })
  }

  const isNew = Array.isArray(data) && data.length > 0
  if (isNew) {
    // Send both emails concurrently before responding (Vercel kills context after response)
    await Promise.allSettled([
      newsletterSubscriptionEmail(email)
        .catch((err) => console.error('Newsletter email failed:', err)),
      newsletterWelcomeEmail(email)
        .catch((err) => console.error('Newsletter welcome email failed:', err)),
    ])
  }

  // Same answer either way, so the form does not reveal who is subscribed.
  return NextResponse.json({ ok: true })
}
