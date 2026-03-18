import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLawyers, getLawyersByState } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const lawyers = session.user.state
      ? await getLawyersByState(session.user.state)
      : await getLawyers()
    return NextResponse.json(lawyers, {
      headers: {
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('Lawyers API error:', error)
    return NextResponse.json({ error: 'Failed to fetch lawyers' }, { status: 500 })
  }
}
