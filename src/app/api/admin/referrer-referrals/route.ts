import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getReferrerReferrals } from '@/lib/data'

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

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
