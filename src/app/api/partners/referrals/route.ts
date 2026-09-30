import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { readJsonBody } from '@/lib/security/http'
import { RATE_LIMITS, enforceRateLimits } from '@/lib/security/rate-limit'
import { getReferrerReferralsByReferrer, createReferrerReferral } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'
import { sanitize, isValidPhone } from '@/lib/sanitize'
import { EMAIL_RE, VALID_SERVICES, VALID_STATES, checkReferralTextFields, isValidIsoDate } from '@/lib/validation'
import { DEFAULT_REFERRAL_STATUS, isReferralStatus } from '@/lib/referral-status'
import { DEFAULT_CASE_CONFIRMED } from '@/lib/case-confirmed'
import type { ReferrerReferral } from '@/types/professionals'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { session, error: authError } = await requireAuth(['partner', 'admin'])
  if (authError) return authError

  const all = await getReferrerReferralsByReferrer(session.user.id)

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const state = searchParams.get('state')

  // Reject an unrecognised status rather than silently returning an empty list,
  // which used to make a stale bookmark look like "you have no referrals".
  if (status && !isReferralStatus(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  let filtered = all
  if (status) filtered = filtered.filter((r) => r.status === status)
  if (state) filtered = filtered.filter((r) => r.state === state)

  // Strip adminNotes from response
  const safe = filtered.map(({ adminNotes: _, ...rest }) => rest)

  return NextResponse.json(safe, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: NextRequest) {
  const { session, error: authError } = await requireAuth(['partner', 'admin'])
  if (authError) return authError

  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response
  const body = parsed.body as Record<string, any> // fields are checked one by one below
  const { clientName, clientPhone, clientEmail, clientAddress, state, serviceNeeded, caseType, accidentDate, notes } = body

  const invalidText = checkReferralTextFields(body)
  if (invalidText) return NextResponse.json({ error: invalidText }, { status: 400 })

  if (!clientName?.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  }
  if (!clientPhone?.trim() || !isValidPhone(clientPhone)) {
    return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 })
  }
  if (clientEmail && !EMAIL_RE.test(clientEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }
  if (!state || !VALID_STATES.includes(state)) {
    return NextResponse.json({ error: 'State must be FL or MN' }, { status: 400 })
  }
  if (!serviceNeeded || !VALID_SERVICES.includes(serviceNeeded)) {
    return NextResponse.json({ error: 'Service needed must be clinic, lawyer, or both' }, { status: 400 })
  }
  if (!caseType?.trim()) {
    return NextResponse.json({ error: 'Case type is required' }, { status: 400 })
  }
  const cleanAccidentDate = typeof accidentDate === 'string' ? sanitize(accidentDate) : ''
  if (cleanAccidentDate && !isValidIsoDate(cleanAccidentDate)) {
    return NextResponse.json({ error: 'Invalid accident date format (expected YYYY-MM-DD)' }, { status: 400 })
  }

  // Each referral fans out emails and SMS; bound what one account can send.
  const limited = await enforceRateLimits([[RATE_LIMITS.referralPerUser, session.user.id]])
  if (limited) return limited

  const now = new Date().toISOString()
  const referral: ReferrerReferral = {
    id: crypto.randomUUID(),
    referrerId: session.user.id,
    referrerName: session.user.name || 'Unknown Partner',
    state: sanitize(state),
    clientName: sanitize(clientName),
    clientPhone: sanitize(clientPhone),
    clientEmail: clientEmail ? sanitize(clientEmail) : '',
    clientAddress: clientAddress ? sanitize(clientAddress) : '',
    serviceNeeded,
    caseType: sanitize(caseType),
    accidentDate: cleanAccidentDate || undefined,
    notes: notes ? sanitize(notes) : '',
    status: DEFAULT_REFERRAL_STATUS,
    caseConfirmed: DEFAULT_CASE_CONFIRMED,
    adminNotes: '',
    createdAt: now,
    updatedAt: now,
  }

  const created = await createReferrerReferral(referral)

  await logActivity({
    userId: session.user.id,
    userName: referral.referrerName,
    action: 'referral_created',
    targetType: 'referral',
    targetId: referral.id,
    targetName: referral.clientName,
    details: { service: serviceNeeded, state: referral.state },
  })

  return NextResponse.json(created, { status: 201 })
}
