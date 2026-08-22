import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getLawyers, getLawyersByState, getUserById } from '@/lib/data'
import { toPublicLawyers } from '@/lib/api/public-shape'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  if (session.user.role === 'referrer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Always read the user's current state from DB (JWT may be stale)
    let userState: string | undefined
    try {
      const dbUser = await getUserById(session.user.id)
      userState = dbUser?.state
    } catch {
      // Fallback to session state if DB lookup fails
      userState = session.user.state
    }

    const lawyers = userState
      ? await getLawyersByState(userState)
      : await getLawyers()

    // Hide direct contact details, keep coarse location so the map can search
    // and filter by city/ZIP. See src/lib/api/public-shape.ts.
    const sanitized = toPublicLawyers(lawyers)

    return NextResponse.json(sanitized, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Lawyers API error:', error)
    return NextResponse.json({ error: 'Failed to fetch lawyers' }, { status: 500 })
  }
}
