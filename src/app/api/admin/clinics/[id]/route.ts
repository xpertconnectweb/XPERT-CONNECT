import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { sanitize } from '@/lib/sanitize'
import { EMAIL_RE } from '@/lib/validation'

const ALLOWED_FIELDS = [
  'name', 'address', 'lat', 'lng', 'phone', 'specialties',
  'email', 'website', 'region', 'county', 'available',
] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { id } = await params
    const body = await request.json() as Record<string, unknown>

    const update: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      const raw = body[key]
      if (raw === undefined) continue

      if (key === 'lat' || key === 'lng') {
        const n = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: `${key} must be a number` }, { status: 400 })
        }
        update[key] = n
        continue
      }

      if (key === 'available') {
        update[key] = !!raw
        continue
      }

      if (key === 'specialties') {
        if (!Array.isArray(raw)) {
          return NextResponse.json({ error: 'specialties must be an array' }, { status: 400 })
        }
        update[key] = raw.map((s) => typeof s === 'string' ? sanitize(s) : '').filter(Boolean)
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
      update[key] = clean
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
