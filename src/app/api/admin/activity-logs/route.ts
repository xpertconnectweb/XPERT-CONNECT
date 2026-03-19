import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const targetType = searchParams.get('targetType')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    logs: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
