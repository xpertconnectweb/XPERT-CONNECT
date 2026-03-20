import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getReferrerReferrals } from '@/lib/data'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const all = await getReferrerReferrals()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const state = searchParams.get('state')
  const referrerId = searchParams.get('referrerId')

  let filtered = all
  if (status) filtered = filtered.filter((r) => r.status === status)
  if (state) filtered = filtered.filter((r) => r.state === state)
  if (referrerId) filtered = filtered.filter((r) => r.referrerId === referrerId)

  return NextResponse.json(filtered)
}
