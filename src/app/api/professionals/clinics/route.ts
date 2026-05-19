import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getClinics, getClinicsByState, getUserById } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  if (session.user.role === 'referrer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  // Exclude the user's own clinic so a clinic can't refer to itself.
  const sourceClinicId = session.user.clinicId
  const filtered = sourceClinicId
    ? clinics.filter((c) => c.id !== sourceClinicId)
    : clinics

  // Strip phone and address from response (hidden from non-admin users)
  const sanitized = filtered.map(({ phone, address, ...rest }) => rest)

  return NextResponse.json(sanitized, {
    headers: {
      'Cache-Control': 'private, no-store',
    },
  })
}
