import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLawyers } from '@/lib/data'
import { supabaseAdmin } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lawyers = await getLawyers()
  return NextResponse.json(lawyers)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

    const { error } = await supabaseAdmin.from('lawyers').insert({
      id: randomUUID(),
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating lawyer:', error)
    return NextResponse.json(
      { error: 'Failed to create lawyer' },
      { status: 500 }
    )
  }
}
