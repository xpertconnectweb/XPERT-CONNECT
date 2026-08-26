import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { sanitize } from '@/lib/sanitize'
import { EMAIL_RE, validateCoordinates } from '@/lib/validation'

const ALLOWED_FIELDS = [
  'name', 'address', 'lat', 'lng', 'phone', 'specialties',
  'email', 'website', 'region', 'county', 'available',
  // Structured address, set when the admin picks a geocoded suggestion.
  'street', 'city', 'state', 'zipCode',
  'placeId', 'placeProvider', 'geocodePrecision',
] as const

/**
 * Payload key to database column, for the ones that differ.
 *
 * Everything else is already identical, which is why the loop below could get
 * away with using the key directly until these columns arrived.
 */
const COLUMN_FOR: Partial<Record<(typeof ALLOWED_FIELDS)[number], string>> = {
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
    const body = await request.json() as Record<string, unknown>

    // Validated as a PAIR, before the field loop. A latitude on its own cannot
    // be range-checked against anything meaningful, and every caller that moves
    // a clinic sends both — so requiring both is the honest contract, and it is
    // what lets `validateCoordinates` reject the (0, 0) that used to get in.
    const movingPin = body.lat !== undefined || body.lng !== undefined
    if (movingPin) {
      if (body.lat === undefined || body.lng === undefined) {
        return NextResponse.json(
          { error: 'lat and lng must be sent together' },
          { status: 400 }
        )
      }
      const coords = validateCoordinates(body.lat, body.lng)
      if (!coords.ok) {
        return NextResponse.json({ error: coords.reason }, { status: 400 })
      }
      body.lat = coords.lat
      body.lng = coords.lng
    }

    const update: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      const raw = body[key]
      if (raw === undefined) continue
      const column = COLUMN_FOR[key] ?? key

      if (key === 'lat' || key === 'lng') {
        // Already validated above.
        update[column] = raw as number
        continue
      }

      if (key === 'available') {
        update[column] = !!raw
        continue
      }

      if (key === 'specialties') {
        if (!Array.isArray(raw)) {
          return NextResponse.json({ error: 'specialties must be an array' }, { status: 400 })
        }
        update[column] = raw.map((s) => typeof s === 'string' ? sanitize(s) : '').filter(Boolean)
        continue
      }

      // The structured address columns are nullable, and null is meaningful:
      // it is what tells `decorateClinic` to fall back to parseAddress. Passing
      // it through rather than skipping it lets an admin clear a stale value.
      if (raw === null) {
        update[column] = null
        continue
      }

      if (typeof raw !== 'string') continue
      const clean = sanitize(raw)
      if (key === 'email' && clean && !EMAIL_RE.test(clean)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
      }
      if (clean.length > 500) {
        return NextResponse.json({ error: `${key} exceeds 500 characters` }, { status: 400 })
      }
      update[column] = clean
    }

    // A geocoded save is dated, so the backfill knows to leave it alone and the
    // 30-day refresh a Google-sourced coordinate would need has something to
    // measure from.
    if (body.placeId !== undefined && body.placeId !== null) {
      update.geocoded_at = new Date().toISOString()
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('clinics')
      .update(update)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Supabase error updating clinic:', error.message)
      throw error
    }

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
    console.error('Error updating clinic:', error instanceof Error ? error.message : 'unknown')
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
    console.error('Error deleting clinic:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json(
      { error: 'Failed to delete clinic' },
      { status: 500 }
    )
  }
}
