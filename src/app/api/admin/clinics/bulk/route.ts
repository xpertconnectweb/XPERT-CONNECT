import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { ids, available } = await request.json()

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })
    }
    if (typeof available !== 'boolean') {
      return NextResponse.json({ error: 'available must be a boolean' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('clinics')
      .update({ available })
      .in('id', ids)

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'bulk_toggle_availability',
      targetType: 'clinic',
      details: { operation: 'toggle_availability', available, count: ids.length, ids },
    })

    return NextResponse.json({ success: true, count: ids.length })
  } catch (error) {
    console.error('Bulk clinic PATCH error:', error)
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { ids } = await request.json()

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('clinics')
      .delete()
      .in('id', ids)

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'bulk_delete',
      targetType: 'clinic',
      details: { operation: 'delete', count: ids.length, ids },
    })

    return NextResponse.json({ success: true, count: ids.length })
  } catch (error) {
    console.error('Bulk clinic DELETE error:', error)
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 })
  }
}
