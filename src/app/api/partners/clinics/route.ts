import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getClinicsByIds } from '@/lib/data'
import { toPublicClinics } from '@/lib/api/public-shape'
import { PARTNER_CLINIC_IDS } from '@/lib/partner-clinics'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { error: authError } = await requireAuth(['partner', 'admin'])
  if (authError) return authError

  try {
    const clinics = await getClinicsByIds(PARTNER_CLINIC_IDS)

    // Hide direct contact details, keep coarse location so the map can search
    // and filter by city/ZIP. See src/lib/api/public-shape.ts.
    const sanitized = toPublicClinics(clinics)

    return NextResponse.json(sanitized, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Partner clinics API error:', error)
    return NextResponse.json({ error: 'Failed to fetch clinics' }, { status: 500 })
  }
}
