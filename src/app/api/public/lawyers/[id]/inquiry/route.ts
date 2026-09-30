import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { supabaseAdmin } from '@/lib/supabase'
import { getPublicDirectoryLawyerById } from '@/lib/data'
import { toDirectoryContact, toDirectoryListing } from '@/lib/api/public-shape'
import { directoryInquiryEmail } from '@/lib/email'
import { isPublicEmail } from '@/lib/validation'
import { readJsonBody, str } from '@/lib/security/http'
import { RATE_LIMITS, clientIp, enforceRateLimits } from '@/lib/security/rate-limit'

/** What `contacts.service` says for these rows, so /admin/contacts can tell them apart. */
const DIRECTORY_INQUIRY_SERVICE = 'Lawyer directory'

/**
 * The public directory's "Get information" form.
 *
 * The listing no longer carries phone, website or address (client
 * request, 2026-09-30). A visitor leaves a name, phone and email, and in
 * return gets the firm's contact details on the page. The lead is kept
 * twice: a row in `contacts`, which /admin/contacts already lists, and
 * an email to INTERNAL_EMAIL.
 *
 * Unauthenticated, like /api/contact. Two defences: the honeypot
 * `company` field (a filled one gets a 200 with nothing in it, so a
 * script learns nothing), and a per-IP limit — without it this route
 * hands every firm's contact details to anyone who loops over the ids,
 * which is exactly what the form exists to prevent.
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

  const lawyer = await getPublicDirectoryLawyerById(id)
  if (!lawyer) {
    return NextResponse.json({ ok: false, error: 'This firm is no longer listed.' }, { status: 404 })
  }

  const contact = toDirectoryContact(lawyer)
  const listing = toDirectoryListing(lawyer)
  const place = [listing.city, listing.county].filter(Boolean).join(', ')

  const { error } = await supabaseAdmin.from('contacts').insert({
    name,
    email,
    phone,
    service: DIRECTORY_INQUIRY_SERVICE,
    message: `Requested information on ${lawyer.name} (${lawyer.id})${place ? ` — ${place}` : ''}.`,
  })
  // Logged, not fatal: the email below still carries the lead, and a
  // visitor who filled in the form should not be refused the number
  // because of a database hiccup on our side.
  if (error) console.error('Failed to save directory inquiry:', error.code, error.message)

  waitUntil(
    directoryInquiryEmail({ name, email, phone }, { ...contact, ...listing }).catch((err) =>
      console.error('Directory inquiry email failed:', err)
    )
  )

  return NextResponse.json({ ok: true, contact }, { headers: { 'Cache-Control': 'no-store' } })
}
