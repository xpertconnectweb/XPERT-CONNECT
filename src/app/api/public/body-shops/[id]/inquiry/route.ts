import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin } from '@/lib/supabase'
import { getBodyShopById } from '@/lib/body-shops'
import { countyLabel } from '@/lib/counties'
import { bodyShopInquiryEmail } from '@/lib/email'
import { isPublicEmail } from '@/lib/validation'
import { readJsonBody, str } from '@/lib/security/http'
import { RATE_LIMITS, clientIp, enforceRateLimits } from '@/lib/security/rate-limit'

/** What `contacts.service` says for these rows, so /admin/contacts can tell them apart. */
const BODY_SHOP_INQUIRY_SERVICE = 'Body shop directory'

/**
 * The Body Shops Directory's "Get information" form.
 *
 * The same contract as /api/public/lawyers/[id]/inquiry, which the client
 * asked this directory to copy. The visitor leaves a name, phone and email,
 * and gets the shop's phone, website and address in return. The lead is
 * kept twice: a `contacts` row, which /admin/contacts lists, and an email
 * to INTERNAL_EMAIL.
 *
 * Two defences, as there: the honeypot `company` field (a filled one gets
 * a 200 with nothing in it), and the per-IP limit, which this route
 * shares with the lawyers form. Without the limit, looping over the ids
 * would hand out every shop's contact details, which is what the form
 * exists to prevent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response
  const body = parsed.body

  const name = str(body.name)
  const email = str(body.email)
  const phone = str(body.phone)
  const honeypot = str(body.company)

  if (!name || !email || !phone) {
    return NextResponse.json({ ok: false, error: 'Please fill in every field.' }, { status: 400 })
  }
  if (name.length > 120 || email.length > 200 || phone.length > 40) {
    return NextResponse.json({ ok: false, error: 'One of the fields is too long.' }, { status: 400 })
  }
  if (!isPublicEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400 })
  }
  const phoneDigits = phone.replace(/\D/g, '')
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid phone number.' }, { status: 400 })
  }

  if (honeypot) return NextResponse.json({ ok: true })

  const limited = await enforceRateLimits([[RATE_LIMITS.inquiryPerIp, clientIp(request.headers)]])
  if (limited) return limited

  const shop = getBodyShopById(id)
  if (!shop) {
    return NextResponse.json({ ok: false, error: 'This shop is no longer listed.' }, { status: 404 })
  }

  const { listing, contact } = shop
  const place = [listing.city, countyLabel(listing.county), listing.state].filter(Boolean).join(', ')

  const { error } = await supabaseAdmin.from('contacts').insert({
    name,
    email,
    phone,
    service: BODY_SHOP_INQUIRY_SERVICE,
    message: `Requested information on ${listing.name} (${listing.id})${place ? ` — ${place}` : ''}.`,
  })
  // Logged, not fatal: the email below still carries the lead, and a
  // visitor who filled in the form should not be refused the number
  // because of a database hiccup on our side.
  if (error) console.error('Failed to save body shop inquiry:', error.code, error.message)

  waitUntil(
    bodyShopInquiryEmail({ name, email, phone }, { ...contact, ...listing }).catch((err) =>
      console.error('Body shop inquiry email failed:', err)
    )
  )

  return NextResponse.json({ ok: true, contact }, { headers: { 'Cache-Control': 'no-store' } })
}
