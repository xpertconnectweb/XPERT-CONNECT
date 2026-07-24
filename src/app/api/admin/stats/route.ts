import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getAdminStats, STATS_RANGES, type StatsRange } from '@/lib/admin-stats'

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const rangeParam = new URL(request.url).searchParams.get('range')
  const range: StatsRange = STATS_RANGES.includes(rangeParam as StatsRange)
    ? (rangeParam as StatsRange)
    : '30d'

  try {
    const stats = await getAdminStats(range)
    return NextResponse.json(stats)
  } catch (err) {
    console.error('GET /api/admin/stats failed:', err)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
