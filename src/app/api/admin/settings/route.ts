import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('key, value')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Convert array of {key, value} to object
  const settings: Record<string, unknown> = {}
  for (const row of data || []) {
    settings[row.key] = row.value
  }

  return NextResponse.json(settings)
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { key, value } = await request.json()

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: session.user.id,
      }, { onConflict: 'key' })

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'settings_updated',
      targetType: 'settings',
      targetId: key,
      targetName: key,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Settings PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
  }
}
