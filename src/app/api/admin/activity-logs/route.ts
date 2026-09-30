import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const targetType = searchParams.get('targetType')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  // Clamped: an unbounded `limit` let one request pull the whole table.
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))

  let query = supabaseAdmin
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (action) query = query.eq('action', action)
  if (targetType) query = query.eq('target_type', targetType)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`)

  const start = (page - 1) * limit
  query = query.range(start, start + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('activity-logs query failed:', error.code, error.message)
    return NextResponse.json({ error: 'Failed to load activity logs' }, { status: 500 })
  }

  return NextResponse.json({
    logs: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
