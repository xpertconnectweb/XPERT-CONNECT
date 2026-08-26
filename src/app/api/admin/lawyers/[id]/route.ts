import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { sanitizePracticeAreas } from '@/lib/practice-areas'
import { validateCoordinates } from '@/lib/validation'

/**
 * Payload key to database column, for the ones that differ.
 *
 * Unmapped keys are passed through under their own name, so a camelCase field
 * with no entry here reaches Postgres as an unknown column and 500s. That is
 * what these four exist to prevent.
 */
const COLUMN_FOR: Record<string, string> = {
  practiceAreas: 'practice_areas',
  zipCode: 'zip_code',
  placeId: 'place_id',
  placeProvider: 'place_provider',
  geocodePrecision: 'geocode_precision',
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { id } = await params
    const body = await request.json()

    // Validated as a PAIR, before anything is written. A latitude on its own
    // cannot be range-checked, and every caller that moves a firm sends both.
    if (body.lat !== undefined || body.lng !== undefined) {
      if (body.lat === undefined || body.lng === undefined) {
        return NextResponse.json({ error: 'lat and lng must be sent together' }, { status: 400 })
      }
      const coords = validateCoordinates(body.lat, body.lng)
      if (!coords.ok) {
        return NextResponse.json({ error: coords.reason }, { status: 400 })
      }
      body.lat = coords.lat
      body.lng = coords.lng
    }

    // Convert camelCase fields to snake_case for Supabase
    const updateData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      // Same gate as POST — canonicalize synonyms, drop CSV-header junk.
      if (key === 'practiceAreas') updateData['practice_areas'] = sanitizePracticeAreas(value)
      else updateData[COLUMN_FOR[key] ?? key] = value
    }

    // A geocoded save is dated, so the backfill knows to leave it alone.
    if (body.placeId !== undefined && body.placeId !== null) {
      updateData.geocoded_at = new Date().toISOString()
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
