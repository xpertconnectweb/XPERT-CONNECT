import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getReferrerReferralsByReferrer, createReferrerReferral } from '@/lib/data'
import { referrerReferralNotificationEmail } from '@/lib/email'
import { sanitize, isValidPhone } from '@/lib/sanitize'
import { v4 as uuidv4 } from 'uuid'
import { waitUntil } from '@vercel/functions'

const VALID_SERVICES = ['clinic', 'lawyer', 'both']
const VALID_STATES = ['FL', 'MN']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role === 'referrer') {
    return NextResponse.json(await getReferrerReferralsByReferrer(session.user.id))
  }

  return NextResponse.json([])
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'referrer') {
    return NextResponse.json({ error: 'Only referrers can submit referrals' }, { status: 403 })
  }

  const body = await request.json()
  const { state, clientName, clientPhone, clientEmail, clientAddress, serviceNeeded, caseType, notes } = body

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
      notes: cleanNotes,
      status: 'pending',
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
          now
        )
        console.log('Partner referral internal notification sent')
      } catch (err) {
        console.error('Partner referral email failed:', err)
      }
    })()
  )

  return NextResponse.json(referral, { status: 201 })
}
