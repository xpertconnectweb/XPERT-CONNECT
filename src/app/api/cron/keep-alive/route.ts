import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [clinics, users, lawyers] = await Promise.all([
      supabaseAdmin.from('clinics').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('lawyers').select('*', { count: 'exact', head: true }),
    ])

    const errors = [
      clinics.error && `clinics: ${clinics.error.message}`,
      users.error && `users: ${users.error.message}`,
      lawyers.error && `lawyers: ${lawyers.error.message}`,
    ].filter(Boolean)

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Partial failure', details: errors }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      counts: {
        clinics: clinics.count,
        users: users.count,
        lawyers: lawyers.count,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Keep-alive failed', message: String(err) },
      { status: 500 }
    )
  }
}
