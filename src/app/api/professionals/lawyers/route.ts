import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLawyers, getLawyersByState, getUserById } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

    // Strip phone and address from response (hidden from non-admin users)
    const sanitized = lawyers.map(({ phone, address, ...rest }) => rest)

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
