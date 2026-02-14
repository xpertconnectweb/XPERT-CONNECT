import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getReferralsByLawyer,
  getReferralsByClinic,
  createReferral,
  getClinicById,
} from '@/lib/data'
import { referralCreatedEmail, internalNotificationEmail } from '@/lib/email'
import { sanitize, isValidPhone } from '@/lib/sanitize'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role, id, clinicId } = session.user

  if (role === 'lawyer') {
    return NextResponse.json(await getReferralsByLawyer(id))
  }

  if (role === 'clinic' && clinicId) {
    return NextResponse.json(await getReferralsByClinic(clinicId))
  }

  return NextResponse.json([])
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'lawyer') {
    return NextResponse.json({ error: 'Only lawyers can create referrals' }, { status: 403 })
  }

  const body = await request.json()
  const { clinicId, patientName, patientPhone, caseType, notes } = body

  if (!clinicId || !patientName || !patientPhone || !caseType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const cleanName = sanitize(patientName)
  const cleanPhone = sanitize(patientPhone)
  const cleanCase = sanitize(caseType)
  const cleanNotes = sanitize(notes || '')

  if (cleanName.length < 2 || cleanName.length > 100) {
    return NextResponse.json({ error: 'Patient name must be 2-100 characters' }, { status: 400 })
  }

  if (!isValidPhone(cleanPhone)) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  const clinic = await getClinicById(clinicId)
  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const lawyerName = session.user.name || 'Unknown'
  const lawyerFirm = session.user.firmName || ''

  const referral = await createReferral({
    id: `ref-${uuidv4()}`,
    lawyerId: session.user.id,
    lawyerName,
    lawyerFirm,
    clinicId: clinic.id,
    clinicName: clinic.name,
    patientName: cleanName,
    patientPhone: cleanPhone,
    caseType: cleanCase,
    notes: cleanNotes,
    status: 'received',
    createdAt: now,
    updatedAt: now,
  })

  // Send email to clinic (non-blocking)
  referralCreatedEmail(
    clinic.name,
    clinic.email,
    lawyerName,
    lawyerFirm,
    cleanName,
    cleanCase
  ).catch((err) => console.error('Clinic email failed:', err))

  // Send internal team notification (non-blocking)
  internalNotificationEmail(
    lawyerName,
    lawyerFirm,
    clinic.name,
    cleanName,
    cleanCase,
    now
  ).catch((err) => console.error('Internal email failed:', err))

  return NextResponse.json(referral, { status: 201 })
}
