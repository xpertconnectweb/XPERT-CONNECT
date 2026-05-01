import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getClinics } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
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
    const body = await request.json()
    const {
      name,
      address,
      lat,
      lng,
      phone,
      email,
      specialties,
      website,
      region,
      county,
      available,
    } = body

    const newId = randomUUID()
    const { error } = await supabaseAdmin.from('clinics').insert({
      id: newId,
      name,
      address,
      lat,
      lng,
      phone: phone || '',
      email: email || '',
      specialties: specialties || [],
      website: website || null,
      region: region || null,
      county: county || null,
      available: available !== false,
    })

    if (error) throw error

    await logActivity({
      userId: session.user.id,
      userName: session.user.name || 'Unknown',
      action: 'clinic_created',
      targetType: 'clinic',
      targetId: newId,
      targetName: name,
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
