import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { contactFormEmail, contactConfirmationEmail } from '@/lib/email'
import { isPublicEmail } from '@/lib/validation'
import { readJsonBody, str } from '@/lib/security/http'
import { RATE_LIMITS, clientIp, enforceRateLimits } from '@/lib/security/rate-limit'

const LIMITS = { name: 120, email: 254, phone: 40, service: 60, message: 2000 }

export async function POST(request: Request) {
  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response
  const body = parsed.body

  const name = str(body.name)
  const email = str(body.email)
  const phone = str(body.phone)
  const service = str(body.service)
  const message = str(body.message)

  if (!name || !email || !phone || !service) {
    return NextResponse.json({ ok: false, error: 'Missing required fields.' }, { status: 400 })
  }

  if (
    name.length > LIMITS.name ||
    phone.length > LIMITS.phone ||
    service.length > LIMITS.service
  ) {
    return NextResponse.json({ ok: false, error: 'One of the fields is too long.' }, { status: 400 })
  }

  if (!isPublicEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email.' }, { status: 400 })
  }

  const phoneDigits = phone.replace(/\D/g, '')
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    return NextResponse.json({ ok: false, error: 'Invalid phone number.' }, { status: 400 })
  }

  if (message.length > LIMITS.message) {
    return NextResponse.json({ ok: false, error: 'Message too long.' }, { status: 400 })
  }

  /**
   * This form emails a confirmation to whatever address is typed, with a
   * name the sender chose. Unthrottled, that is a free way to make our
   * domain spam a stranger — and to get it blocklisted. Per IP bounds a
   * single sender; per address bounds a victim, however many IPs are used.
   * Checked after validation so malformed requests do not burn the budget.
   */
  const limited = await enforceRateLimits([
    [RATE_LIMITS.contactPerIp, clientIp(request.headers)],
    [RATE_LIMITS.contactPerEmail, email],
  ])
  if (limited) return limited

  const { error } = await supabaseAdmin.from('contacts').insert({
    name,
    email,
    phone,
    service,
    message,
  })

  if (error) {
    console.error('Failed to save contact:', error.code, error.message)
    return NextResponse.json({ ok: false, error: 'Failed to save contact.' }, { status: 500 })
  }

  // Send both emails concurrently before responding (Vercel kills context after response)
  await Promise.allSettled([
    contactFormEmail(name, email, phone, service, message)
      .catch((err) => console.error('Contact email failed:', err)),
    contactConfirmationEmail(name, email, service)
      .catch((err) => console.error('Contact confirmation email failed:', err)),
  ])

  return NextResponse.json({ ok: true })
}
