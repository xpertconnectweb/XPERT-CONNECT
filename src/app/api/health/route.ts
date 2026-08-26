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

  // SMS is optional, so NONE of these being set is a valid state —
  // the feature is simply dormant, and failing the healthcheck for
  // that would page somebody about a feature nobody turned on.
  //
  // What IS a failure is a PARTIAL configuration: some variables set
  // and others missing means somebody believes texts are working when
  // they are not, and the send path fails closed and silently.
  checks.push(
    await timed('env_twilio', async () => {
      const keys = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_MESSAGING_SERVICE_SID',
        'TWILIO_WEBHOOK_URL',
        'PHONE_OTP_PEPPER',
      ]
      const missing = keys.filter((key) => !process.env[key])

      if (missing.length === keys.length) return // deliberately off
      if (missing.length > 0) {
        throw new Error(`partially configured — ${missing.join(', ')} missing`)
      }

      // A short pepper is worse than an obviously absent one: hashing
      // still works, so nothing looks broken.
      if ((process.env.PHONE_OTP_PEPPER ?? '').length < 32) {
        throw new Error('PHONE_OTP_PEPPER is shorter than 32 characters')
      }
    })
  )

  /**
   * Geocoding, on the same "off is fine, half-on is not" principle as Twilio.
   *
   * Leaving `GEOCODER_PROVIDER` unset is a valid state: address lookup falls
   * back to OpenStreetMap, which needs no key. The failure worth paging about
   * is a provider NAMED without its key present — the request then silently
   * falls back, so someone believes they are paying for coverage they are not
   * getting, and the address that prompted the whole exercise still will not
   * resolve.
   */
  checks.push(
    await timed('env_geocoder', async () => {
      const provider = process.env.GEOCODER_PROVIDER?.trim().toLowerCase()
      if (!provider || provider === 'nominatim') return // deliberately free

      const keyFor: Record<string, string> = {
        geoapify: 'GEOAPIFY_API_KEY',
        mapbox: 'MAPBOX_ACCESS_TOKEN',
        google: 'GOOGLE_MAPS_SERVER_KEY',
      }

      const envVar = keyFor[provider]
      if (!envVar) {
        throw new Error(`GEOCODER_PROVIDER="${provider}" is not a known provider`)
      }
      if (!process.env[envVar]) {
        throw new Error(`GEOCODER_PROVIDER=${provider} but ${envVar} is missing`)
      }
    })
  )

  const ok = checks.every((c) => c.ok)
  return NextResponse.json(
    { ok, timestamp: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } }
  )
}
