import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface Check {
  name: string
  ok: boolean
  error?: string
  latencyMs: number
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<Check> {
  const start = Date.now()
  try {
    await fn()
    return { name, ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? err.message : 'unknown error',
      latencyMs: Date.now() - start,
    }
  }
}

/**
 * Admin-only operational health endpoint.
 *
 * Verifies that the Supabase connection is alive and that the data
 * model has every column the post-2026-05 codebase expects. A 200
 * response means the app is safe to serve traffic; 503 means at
 * least one critical check failed.
 *
 * Locked behind `requireAdmin` so the schema topology and connection
 * latency are not exposed publicly.
 */
export async function GET() {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  const checks: Check[] = []

  checks.push(
    await timed('supabase_users_table', async () => {
      const { error } = await supabaseAdmin
        .from('users')
        .select('id, lawyer_id, clinic_id, role')
        .limit(1)
      if (error) throw new Error(error.message)
    })
  )

  checks.push(
    await timed('supabase_referrals_columns', async () => {
      const { error } = await supabaseAdmin
        .from('referrals')
        .select(
          'id, lawyer_id, clinic_id, created_by_user_id, creator_role, insurance_company, claim_number, adjuster_name, adjuster_phone, adjuster_email'
        )
        .limit(1)
      if (error) throw new Error(error.message)
    })
  )

  checks.push(
    await timed('supabase_lawyers_table', async () => {
      const { error } = await supabaseAdmin.from('lawyers').select('id').limit(1)
      if (error) throw new Error(error.message)
    })
  )

  checks.push(
    await timed('supabase_clinics_table', async () => {
      const { error } = await supabaseAdmin.from('clinics').select('id').limit(1)
      if (error) throw new Error(error.message)
    })
  )

  checks.push(
    await timed('env_resend_key', async () => {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing')
    })
  )

  checks.push(
    await timed('env_nextauth_secret', async () => {
      if (!process.env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET missing')
    })
  )

  const ok = checks.every((c) => c.ok)
  return NextResponse.json(
    { ok, timestamp: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } }
  )
}
