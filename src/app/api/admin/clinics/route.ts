import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getClinics } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { checkProviderFields, validateCoordinates } from '@/lib/validation'
import { readJsonBody } from '@/lib/security/http'
import { normalizeWebsite } from '@/lib/security/url'
import { randomUUID } from 'crypto'

export async function GET() {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const clinics = await getClinics()
  return NextResponse.json(clinics)
}

export async function POST(request: Request) {
  const { session, error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body

    const invalid = checkProviderFields(body, { requireName: true })
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    const website = normalizeWebsite(body.website)
    if (website === null) {
      return NextResponse.json({ error: 'Website must be an http(s) address' }, { status: 400 })
    }
    if (body.specialties !== undefined && !Array.isArray(body.specialties)) {
      return NextResponse.json({ error: 'specialties must be an array' }, { status: 400 })
    }
    const {
      name,
      address,
      lat,
      lng,
      phone,
      email,
      specialties,
      region,
      county,
      available,
      street,
      city,
      state,
      zipCode,
      placeId,
      placeProvider,
      geocodePrecision,
    } = body

    // The form can now fill these from a geocoded suggestion, but a client can
    // post anything — and for a long time it did: `parseFloat(value) || 0` in
    // the admin form turned an empty field into 0, and nothing here looked.
    // Those rows are still in the table.
    const coords = validateCoordinates(lat, lng)
    if (!coords.ok) {
      return NextResponse.json({ error: coords.reason }, { status: 400 })
    }

    const newId = randomUUID()
    const { error } = await supabaseAdmin.from('clinics').insert({
      id: newId,
      name,
      address,
      lat: coords.lat,
      lng: coords.lng,
      phone: phone || '',
      email: email || '',
      specialties: specialties || [],
      website: website || null,
      region: region || null,
      county: county || null,
      available: available !== false,
      // Null when the address was typed rather than chosen. That NULL is what
      // tells `decorateClinic` to fall back to parseAddress, so a record
      // created by hand still behaves exactly as it did before.
      street: street ?? null,
      city: city ?? null,
      state: state ?? null,
      zip_code: zipCode ?? null,
      place_id: placeId ?? null,
      place_provider: placeProvider ?? null,
      geocode_precision: geocodePrecision ?? null,
      geocoded_at: placeId ? new Date().toISOString() : null,
    })

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'clinic_created',
      targetType: 'clinic',
      targetId: newId,
      targetName: String(name), // checked by checkProviderFields
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating clinic:', error)
    return NextResponse.json(
      { error: 'Failed to create clinic' },
      { status: 500 }
    )
  }
}
