import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getLawyers } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { sanitizePracticeAreas } from '@/lib/practice-areas'
import { validateCoordinates } from '@/lib/validation'
import { randomUUID } from 'crypto'

export async function GET() {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const lawyers = await getLawyers()
  return NextResponse.json(lawyers)
}

export async function POST(request: Request) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const body = await request.json()
    const {
      name,
      address,
      lat,
      lng,
      phone,
      email,
      practiceAreas,
      website,
      region,
      county,
      zipCode,
      available,
      street,
      city,
      state,
      placeId,
      placeProvider,
      geocodePrecision,
    } = body

    // See the clinic route: the admin form's `parseFloat(value) || 0` turned an
    // empty field into 0, and nothing here looked.
    const coords = validateCoordinates(lat, lng)
    if (!coords.ok) {
      return NextResponse.json({ error: coords.reason }, { status: 400 })
    }

    const newId = randomUUID()
    const { error } = await supabaseAdmin.from('lawyers').insert({
      id: newId,
      name,
      address,
      lat: coords.lat,
      lng: coords.lng,
      phone: phone || '',
      email: email || '',
      // The real gate on practice-area data: canonicalizes synonyms and
      // strips the CSV-header junk that once got imported as firms.
      practice_areas: sanitizePracticeAreas(practiceAreas),
      website: website || null,
      region: region || null,
      county: county || null,
      zip_code: zipCode || null,
      available: available !== false,
      // Null when the address was typed rather than chosen — and null is what
      // tells `decorateLawyer` to fall back to parseAddress.
      street: street ?? null,
      city: city ?? null,
      state: state ?? null,
      place_id: placeId ?? null,
      place_provider: placeProvider ?? null,
      geocode_precision: geocodePrecision ?? null,
      geocoded_at: placeId ? new Date().toISOString() : null,
    })

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'lawyer_created',
      targetType: 'lawyer',
      targetId: newId,
      targetName: name,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating lawyer:', error)
    return NextResponse.json(
      { error: 'Failed to create lawyer' },
      { status: 500 }
    )
  }
}
