import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getReferrerReferralsByReferrer, createReferrerReferral } from '@/lib/data'
import { sanitize, isValidPhone } from '@/lib/sanitize'
import { EMAIL_RE, VALID_SERVICES, VALID_STATES } from '@/lib/validation'
import type { ReferrerReferral } from '@/types/professionals'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { session, error: authError } = await requireAuth(['partner', 'admin'])
  if (authError) return authError

  const all = await getReferrerReferralsByReferrer(session.user.id)

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const state = searchParams.get('state')

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

  const body = await request.json()
  const { clientName, clientPhone, clientEmail, clientAddress, state, serviceNeeded, caseType, notes } = body

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
    notes: notes ? sanitize(notes) : '',
    status: 'pending',
    caseConfirmed: 'pending',
    adminNotes: '',
    createdAt: now,
    updatedAt: now,
  }

  const created = await createReferrerReferral(referral)
  return NextResponse.json(created, { status: 201 })
}
