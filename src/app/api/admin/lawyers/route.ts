import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getLawyers } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
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
    } = body

    const newId = randomUUID()
    const { error } = await supabaseAdmin.from('lawyers').insert({
      id: newId,
      name,
      address,
      lat,
      lng,
      phone: phone || '',
      email: email || '',
      practice_areas: practiceAreas || [],
      website: website || null,
      region: region || null,
      county: county || null,
      zip_code: zipCode || null,
      available: available !== false,
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
