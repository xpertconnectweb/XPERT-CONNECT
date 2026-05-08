import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import {
  getReferralsByLawyerEntity,
  getReferralsByClinic,
  createReferral,
  getClinicById,
  getLawyerById,
  getUsersByClinicId,
  getLawyerUsersByEntityId,
  getUserById,
} from '@/lib/data'
import {
  referralCreatedEmail,
  internalNotificationEmail,
  clinicToLawyerReferralEmail,
  type ReferralExtras,
} from '@/lib/email'
import { sanitize, isValidPhone } from '@/lib/sanitize'
import { EMAIL_RE } from '@/lib/validation'
import { v4 as uuidv4 } from 'uuid'
import { waitUntil } from '@vercel/functions'
import type { Referral } from '@/types/professionals'

const MAX_OPTIONAL_FIELD = 200

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const { role, clinicId, lawyerId } = session.user

  if (role === 'referrer') {
    return NextResponse.json([])
  }

  if (role === 'lawyer') {
    if (!lawyerId) {
      // Lawyer user not yet linked to a firm — surface empty list
      // rather than a confusing 500. Admin must link via /admin/users.
      return NextResponse.json([])
    }
    return NextResponse.json(await getReferralsByLawyerEntity(lawyerId))
  }

  if (role === 'clinic' && clinicId) {
    return NextResponse.json(await getReferralsByClinic(clinicId))
  }

  return NextResponse.json([])
}

function pickExtras(body: Record<string, unknown>): ReferralExtras {
  const pickStr = (k: string) => (typeof body[k] === 'string' ? sanitize(body[k] as string) : '')
  return {
    coverage: pickStr('coverage') || undefined,
    pip: pickStr('pip') || undefined,
    insuranceCompany: pickStr('insuranceCompany') || undefined,
    claimNumber: pickStr('claimNumber') || undefined,
    adjusterName: pickStr('adjusterName') || undefined,
    adjusterPhone: pickStr('adjusterPhone') || undefined,
    adjusterEmail: pickStr('adjusterEmail') || undefined,
  }
}

function validateExtras(extras: ReferralExtras): NextResponse | null {
  for (const [key, value] of Object.entries(extras)) {
    if (typeof value === 'string' && value.length > MAX_OPTIONAL_FIELD) {
      return NextResponse.json(
        { error: `${key} exceeds ${MAX_OPTIONAL_FIELD} characters` },
        { status: 400 }
      )
    }
  }
  if (extras.adjusterEmail && !EMAIL_RE.test(extras.adjusterEmail)) {
    return NextResponse.json({ error: 'Invalid adjuster email format' }, { status: 400 })
  }
  if (extras.adjusterPhone && !isValidPhone(extras.adjusterPhone)) {
    return NextResponse.json({ error: 'Invalid adjuster phone format' }, { status: 400 })
  }
  return null
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth(['lawyer', 'clinic'])
  if (error) return error

  const body = await request.json()
  const { patientName, patientPhone, caseType, notes } = body

  if (!patientName || !patientPhone || !caseType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const cleanName = sanitize(patientName)
  const cleanPhone = sanitize(patientPhone)
  const cleanCase = sanitize(caseType)
  const cleanNotes = sanitize(notes || '')

  if (cleanName.length < 2 || cleanName.length > 100) {
    return NextResponse.json({ error: 'Patient name must be 2-100 characters' }, { status: 400 })
  }
  if (cleanCase.length > 100) {
    return NextResponse.json({ error: 'Case type exceeds 100 characters' }, { status: 400 })
  }
  if (cleanNotes.length > 1000) {
    return NextResponse.json({ error: 'Notes exceed 1000 characters' }, { status: 400 })
  }
  if (!isValidPhone(cleanPhone)) {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  const extras = pickExtras(body)
  const extrasError = validateExtras(extras)
  if (extrasError) return extrasError

  const now = new Date().toISOString()

  if (session.user.role === 'lawyer') {
    return await handleLawyerToClinic({ session, body, cleanName, cleanPhone, cleanCase, cleanNotes, extras, now })
  }
  return await handleClinicToLawyer({ session, body, cleanName, cleanPhone, cleanCase, cleanNotes, extras, now })
}

interface CreateArgs {
  session: { user: { id: string; name?: string | null; role: string; clinicId?: string; lawyerId?: string; firmName?: string } }
  body: Record<string, unknown>
  cleanName: string
  cleanPhone: string
  cleanCase: string
  cleanNotes: string
  extras: ReferralExtras
  now: string
}

async function handleLawyerToClinic(args: CreateArgs) {
  const { session, body, cleanName, cleanPhone, cleanCase, cleanNotes, extras, now } = args
  const clinicId = typeof body.clinicId === 'string' ? body.clinicId : ''

  if (!clinicId) {
    return NextResponse.json({ error: 'clinicId is required' }, { status: 400 })
  }

  const lawyerEntityId = session.user.lawyerId
  if (!lawyerEntityId) {
    return NextResponse.json(
      { error: 'Your lawyer account is not linked to a firm. Please contact an admin.' },
      { status: 403 }
    )
  }

  const clinic = await getClinicById(clinicId)
  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
  }

  const lawyerEntity = await getLawyerById(lawyerEntityId)
  if (!lawyerEntity) {
    return NextResponse.json(
      { error: 'Your firm record was not found. Please contact an admin.' },
      { status: 403 }
    )
  }

  // Verify the user still exists (JWT may outlive deleted users)
  const lawyerUser = await getUserById(session.user.id)
  if (!lawyerUser) {
    return NextResponse.json(
      { error: 'Your account was not found. Please log out and log in again.' },
      { status: 403 }
    )
  }

  const lawyerName = session.user.name || lawyerEntity.name
  const lawyerFirm = session.user.firmName || lawyerEntity.name

  let referral: Referral
  try {
    referral = await createReferral({
      id: `ref-${uuidv4()}`,
      lawyerId: lawyerEntity.id,
      lawyerName,
      lawyerFirm,
      clinicId: clinic.id,
      clinicName: clinic.name,
      createdByUserId: session.user.id,
      creatorRole: 'lawyer',
      patientName: cleanName,
      patientPhone: cleanPhone,
      caseType: cleanCase,
      coverage: extras.coverage,
      pip: extras.pip,
      insuranceCompany: extras.insuranceCompany,
      claimNumber: extras.claimNumber,
      adjusterName: extras.adjusterName,
      adjusterPhone: extras.adjusterPhone,
      adjusterEmail: extras.adjusterEmail,
      notes: cleanNotes,
      status: 'received',
      createdAt: now,
      updatedAt: now,
    })
  } catch (err) {
    console.error('POST /referrals (lawyer→clinic) createReferral failed:', err)
    return NextResponse.json(
      { error: 'Failed to create referral. Please try again.' },
      { status: 500 }
    )
  }

  const emailSet = new Set<string>()
  if (clinic.email) emailSet.add(clinic.email)

  const clinicUsers = await getUsersByClinicId(clinic.id)
  clinicUsers.forEach((user) => {
    if (user.email) emailSet.add(user.email)
  })

  const clinicEmails = Array.from(emailSet)

  waitUntil(
    (async () => {
      try {
        for (const email of clinicEmails) {
          try {
            await referralCreatedEmail(
              clinic.name,
              email,
              lawyerName,
              lawyerFirm,
              cleanName,
              cleanCase,
              extras
            )
            if (clinicEmails.indexOf(email) < clinicEmails.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 600))
            }
          } catch (err) {
            console.error(`Clinic email to ${email} failed:`, err)
          }
        }

        await new Promise(resolve => setTimeout(resolve, 600))

        await internalNotificationEmail(
          lawyerName,
          lawyerFirm,
          clinic.name,
          cleanName,
          cleanCase,
          now,
          extras,
          'lawyer-to-clinic'
        )
      } catch (err) {
        console.error('Internal email failed:', err)
      }
    })()
  )

  return NextResponse.json(referral, { status: 201 })
}

async function handleClinicToLawyer(args: CreateArgs) {
  const { session, body, cleanName, cleanPhone, cleanCase, cleanNotes, extras, now } = args
  const lawyerId = typeof body.lawyerId === 'string' ? body.lawyerId : ''
  const clinicId = session.user.clinicId

  if (!lawyerId) {
    return NextResponse.json({ error: 'lawyerId is required' }, { status: 400 })
  }
  if (!clinicId) {
    return NextResponse.json({ error: 'Your account is not linked to a clinic' }, { status: 403 })
  }

  const lawyer = await getLawyerById(lawyerId)
  if (!lawyer) {
    return NextResponse.json({ error: 'Specialist not found' }, { status: 404 })
  }

  const clinic = await getClinicById(clinicId)
  if (!clinic) {
    return NextResponse.json({ error: 'Originating clinic not found' }, { status: 404 })
  }

  let referral: Referral
  try {
    referral = await createReferral({
      id: `ref-${uuidv4()}`,
      lawyerId: lawyer.id,
      lawyerName: lawyer.name,
      lawyerFirm: lawyer.name,
      clinicId: clinic.id,
      clinicName: clinic.name,
      createdByUserId: session.user.id,
      creatorRole: 'clinic',
      patientName: cleanName,
      patientPhone: cleanPhone,
      caseType: cleanCase,
      coverage: extras.coverage,
      pip: extras.pip,
      insuranceCompany: extras.insuranceCompany,
      claimNumber: extras.claimNumber,
      adjusterName: extras.adjusterName,
      adjusterPhone: extras.adjusterPhone,
      adjusterEmail: extras.adjusterEmail,
      notes: cleanNotes,
      status: 'received',
      createdAt: now,
      updatedAt: now,
    })
  } catch (err) {
    console.error('POST /referrals (clinic→lawyer) createReferral failed:', err)
    return NextResponse.json(
      { error: 'Failed to create referral. Please try again.' },
      { status: 500 }
    )
  }

  // Notify the firm (entity email) plus every lawyer user linked to it.
  const emailSet = new Set<string>()
  if (lawyer.email) emailSet.add(lawyer.email)
  const lawyerUsers = await getLawyerUsersByEntityId(lawyer.id)
  lawyerUsers.forEach((user) => { if (user.email) emailSet.add(user.email) })
  const lawyerEmails = Array.from(emailSet)

  waitUntil(
    (async () => {
      try {
        for (const email of lawyerEmails) {
          try {
            await clinicToLawyerReferralEmail(
              lawyer.name,
              email,
              clinic.name,
              cleanName,
              cleanPhone,
              cleanCase,
              extras
            )
            if (lawyerEmails.indexOf(email) < lawyerEmails.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 600))
            }
          } catch (err) {
            console.error(`Specialist email to ${email} failed:`, err)
          }
        }

        if (lawyerEmails.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 600))
        }

        await internalNotificationEmail(
          clinic.name,
          '',
          lawyer.name,
          cleanName,
          cleanCase,
          now,
          extras,
          'clinic-to-lawyer'
        )
      } catch (err) {
        console.error('Internal email failed:', err)
      }
    })()
  )

  return NextResponse.json(referral, { status: 201 })
}
