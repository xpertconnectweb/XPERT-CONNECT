import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { purgeExpired } from '@/lib/geocoding/shared-cache'

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

    // Drop expired geocode cache rows while we are already here.
    //
    // It rides this cron rather than getting a schedule of its own because the
    // table is small and this job already runs. It is NOT hygiene: the expiry
    // on those rows is a licence term — Google requires anything other than a
    // place id to be deleted within 30 days — so something has to actually do
    // the deleting. `purgeExpired` never throws, so a failure here cannot turn
    // the keep-alive red.
    const purged = await purgeExpired()

    return NextResponse.json({
      ok: true,
      counts: {
        clinics: clinics.count,
        users: users.count,
        lawyers: lawyers.count,
      },
      geocodeCachePurged: purged,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Keep-alive failed', message: String(err) },
      { status: 500 }
    )
  }
}
