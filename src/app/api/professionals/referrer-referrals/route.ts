import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getReferrerReferralsByReferrer, createReferrerReferral } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'
import { referrerReferralNotificationEmail } from '@/lib/email'
import { sanitize, isValidPhone } from '@/lib/sanitize'
import { VALID_SERVICES, VALID_STATES, isValidIsoDate } from '@/lib/validation'
import { DEFAULT_REFERRAL_STATUS } from '@/lib/referral-status'
import { DEFAULT_CASE_CONFIRMED } from '@/lib/case-confirmed'
import { v4 as uuidv4 } from 'uuid'
import { waitUntil } from '@vercel/functions'

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  if (session.user.role === 'referrer') {
    const referrals = await getReferrerReferralsByReferrer(session.user.id)
    const sanitized = referrals.map(({ assignedClinicId, assignedClinicName, assignedLawyerId, assignedLawyerName, ...rest }) => rest)
    return NextResponse.json(sanitized)
  }

  return NextResponse.json([])
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth(['referrer'])
  if (error) return error

  const body = await request.json()
  const { state, clientName, clientPhone, clientEmail, clientAddress, serviceNeeded, caseType, accidentDate, notes } = body

  if (!state || !clientName || !clientPhone || !clientAddress || !serviceNeeded || !caseType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!VALID_STATES.includes(state)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  if (!VALID_SERVICES.includes(serviceNeeded)) {
    return NextResponse.json({ error: 'Invalid service type' }, { status: 400 })
  }

  const cleanName = sanitize(clientName)
  const cleanPhone = sanitize(clientPhone)
  const cleanEmail = sanitize(clientEmail || '')
  const cleanAddress = sanitize(clientAddress)
  const cleanCase = sanitize(caseType)
  const cleanNotes = sanitize(notes || '')
  const cleanAccidentDate = typeof accidentDate === 'string' ? sanitize(accidentDate) : ''
  if (cleanAccidentDate && !isValidIsoDate(cleanAccidentDate)) {
    return NextResponse.json({ error: 'Invalid accident date format (expected YYYY-MM-DD)' }, { status: 400 })
  }

  if (cleanName.length < 2 || cleanName.length > 100) {
    return NextResponse.json({ error: 'Client name must be 2-100 characters' }, { status: 400 })
  }

  if (!isValidPhone(cleanPhone)) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  if (cleanAddress.length < 5 || cleanAddress.length > 300) {
    return NextResponse.json({ error: 'Address must be 5-300 characters' }, { status: 400 })
  }

  if (cleanCase.length < 2 || cleanCase.length > 100) {
    return NextResponse.json({ error: 'Case type must be 2-100 characters' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const referrerName = session.user.name || 'Unknown'

  let referral
  try {
    referral = await createReferrerReferral({
      id: `rref-${uuidv4()}`,
      referrerId: session.user.id,
      referrerName,
      state,
      clientName: cleanName,
      clientPhone: cleanPhone,
      clientEmail: cleanEmail,
      clientAddress: cleanAddress,
      serviceNeeded,
      caseType: cleanCase,
      accidentDate: cleanAccidentDate || undefined,
      notes: cleanNotes,
      status: DEFAULT_REFERRAL_STATUS,
      caseConfirmed: DEFAULT_CASE_CONFIRMED,
      adminNotes: '',
      createdAt: now,
      updatedAt: now,
    })
  } catch (err) {
    console.error('POST /referrer-referrals create failed:', err)
    return NextResponse.json(
      { error: 'Failed to create referral. Please try again.' },
      { status: 500 }
    )
  }

  await logActivity({
    userId: session.user.id,
    userName: referrerName,
    action: 'referral_created',
    targetType: 'referral',
    targetId: referral.id,
    targetName: cleanName,
    details: { service: serviceNeeded, state },
  })

  waitUntil(
    (async () => {
      try {
        await referrerReferralNotificationEmail(
          referrerName,
          state,
          cleanName,
          cleanPhone,
          cleanAddress,
          serviceNeeded,
          cleanCase,
          cleanNotes,
          now,
          cleanAccidentDate || undefined
        )
        console.log('Partner referral internal notification sent')
      } catch (err) {
        console.error('Partner referral email failed:', err)
      }
    })()
  )

  return NextResponse.json(referral, { status: 201 })
}
