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

    // Convert camelCase fields to snake_case for Supabase
    const updateData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (key === 'practiceAreas') updateData['practice_areas'] = value
      else if (key === 'zipCode') updateData['zip_code'] = value
      else updateData[key] = value
    }

    const { data, error } = await supabaseAdmin
      .from('lawyers')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'lawyer_updated',
      targetType: 'lawyer',
      targetId: id,
      targetName: data?.[0]?.name || id,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating lawyer:', error)
    return NextResponse.json(
      { error: 'Failed to update lawyer' },
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
      .from('lawyers')
      .delete()
      .eq('id', id)

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'lawyer_deleted',
      targetType: 'lawyer',
      targetId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting lawyer:', error)
    return NextResponse.json(
      { error: 'Failed to delete lawyer' },
      { status: 500 }
    )
  }
}
