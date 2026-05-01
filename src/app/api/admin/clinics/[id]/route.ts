import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { id } = await params
    const body = await request.json()

    console.log('Updating clinic:', id, 'with data:', body)

    const { data, error } = await supabaseAdmin
      .from('clinics')
      .update(body)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    console.log('Update successful:', data)

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'clinic_updated',
      targetType: 'clinic',
      targetId: id,
      targetName: data?.[0]?.name || id,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating clinic:', error)
    return NextResponse.json(
      { error: 'Failed to update clinic' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { id } = await params
    const { error } = await supabaseAdmin
      .from('clinics')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'clinic_deleted',
      targetType: 'clinic',
      targetId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting clinic:', error)
    return NextResponse.json(
      { error: 'Failed to delete clinic' },
      { status: 500 }
    )
  }
}
