import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rowsToModels } from '@/lib/mappers'
import { PARTNER_CLINIC_IDS } from '@/lib/partner-clinics'
import type { Clinic } from '@/types/professionals'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { error: authError } = await requireAuth(['partner', 'admin'])
  if (authError) return authError

  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('id, name, address, lat, lng, phone, specialties, email, website, region, county, available')
    .in('id', PARTNER_CLINIC_IDS)

  if (error) {
    console.error('Partner clinics API error:', error)
    return NextResponse.json({ error: 'Failed to fetch clinics' }, { status: 500 })
  }

  const clinics = rowsToModels<Clinic>(data)

  // Strip phone and address from response
  const sanitized = clinics.map(({ phone, address, ...rest }) => rest)

  return NextResponse.json(sanitized, {
    headers: {
      'Cache-Control': 'private, no-store',
    },
  })
}
