import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getClinics, getClinicsByState, getUserById } from '@/lib/data'
import { SPECIALTY_TYPE_TO_CLINIC_TAGS, type MedicalSpecialtyType } from '@/lib/medical-specialties'
import { VALID_MEDICAL_SPECIALTIES } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  if (session.user.role === 'referrer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const specialty = request.nextUrl.searchParams.get('specialty')
  if (specialty && !VALID_MEDICAL_SPECIALTIES.includes(specialty as MedicalSpecialtyType)) {
    return NextResponse.json({ error: 'Invalid specialty type' }, { status: 400 })
  }

  // Always read the user's current state from DB (JWT may be stale)
  let userState: string | undefined
  try {
    const dbUser = await getUserById(session.user.id)
    userState = dbUser?.state
  } catch {
    userState = session.user.state
  }

  const clinics = userState
    ? await getClinicsByState(userState)
    : await getClinics()

  let filtered = clinics
  if (specialty) {
    const tags = SPECIALTY_TYPE_TO_CLINIC_TAGS[specialty as MedicalSpecialtyType] ?? []
    if (tags.length > 0) {
      const tagsLower = tags.map((t) => t.toLowerCase())
      filtered = clinics.filter((c) =>
        c.specialties.some((s) => {
          const sLower = s.toLowerCase()
          return tagsLower.some((tag) => sLower.includes(tag) || tag.includes(sLower))
        })
      )
    }
  }

  // Exclude the user's own clinic so a clinic can't refer to itself.
  const sourceClinicId = session.user.clinicId
  if (sourceClinicId) {
    filtered = filtered.filter((c) => c.id !== sourceClinicId)
  }

  // Strip phone and address from response (hidden from non-admin users)
  const sanitized = filtered.map(({ phone, address, ...rest }) => rest)

  return NextResponse.json(sanitized, {
    headers: {
      'Cache-Control': 'private, no-store',
    },
  })
}
