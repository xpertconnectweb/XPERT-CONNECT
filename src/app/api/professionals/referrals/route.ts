import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getReferralsByLawyer,
  getReferralsByClinic,
  createReferral,
  getClinicById,
  getUsersByClinicId,
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
  const { clinicId, patientName, patientPhone, caseType, coverage, pip, notes } = body

  if (!clinicId || !patientName || !patientPhone || !caseType || !coverage || !pip) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const cleanName = sanitize(patientName)
  const cleanPhone = sanitize(patientPhone)
  const cleanCase = sanitize(caseType)
  const cleanCoverage = sanitize(coverage)
  const cleanPip = sanitize(pip)
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
    coverage: cleanCoverage,
    pip: cleanPip,
    notes: cleanNotes,
    status: 'received',
    createdAt: now,
    updatedAt: now,
  })

  // Collect all clinic emails: clinic entity email + clinic user emails
  const emailSet = new Set<string>()
  if (clinic.email) emailSet.add(clinic.email)

  const clinicUsers = await getUsersByClinicId(clinic.id)
  clinicUsers.forEach((user) => {
    if (user.email) emailSet.add(user.email)
  })

  const clinicEmails = Array.from(emailSet)

  // Send email to all clinic emails (non-blocking)
  clinicEmails.forEach((email) => {
    referralCreatedEmail(
      clinic.name,
      email,
      lawyerName,
      lawyerFirm,
      cleanName,
      cleanCase,
      cleanCoverage,
      cleanPip
    ).catch((err) => console.error(`Clinic email to ${email} failed:`, err))
  })

  // Send internal team notification (non-blocking)
  internalNotificationEmail(
    lawyerName,
    lawyerFirm,
    clinic.name,
    cleanName,
    cleanCase,
    cleanCoverage,
    cleanPip,
    now
  ).catch((err) => console.error('Internal email failed:', err))

  return NextResponse.json(referral, { status: 201 })
}
