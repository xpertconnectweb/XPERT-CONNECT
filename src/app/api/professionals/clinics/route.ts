import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getClinics } from '@/lib/data'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clinics = await getClinics()
  return NextResponse.json(clinics, {
    headers: { 'Cache-Control': 'private, max-age=300' }, // 5 min cache
  })
}
