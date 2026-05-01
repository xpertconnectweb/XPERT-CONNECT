import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { deleteUser } from '@/lib/data'
import { logActivity } from '@/lib/activity-log'

export async function DELETE(request: Request) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { ids } = await request.json()

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })
    }

    // Prevent self-deletion
    if (ids.includes(session.user.id)) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    let deleted = 0
    for (const id of ids) {
      const success = await deleteUser(id)
      if (success) deleted++
    }

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'bulk_delete',
      targetType: 'user',
      details: { operation: 'delete', count: deleted, ids },
    })

    return NextResponse.json({ success: true, count: deleted })
  } catch (error) {
    console.error('Bulk user DELETE error:', error)
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 })
  }
}
