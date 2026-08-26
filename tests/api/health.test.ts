import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAdmin, buildSession } from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

// Build a programmable Supabase mock where each `.from(table).select(...).limit(N)`
// resolves to whatever was registered for that table.
//
// `count` is part of the shape because the env_geocoder check counts
// `geo_street` rather than reading a row from it. A deploy pointed at a database
// where the address index was never loaded fails EVERY address lookup, and does
// it silently by falling back to another provider — which is precisely the kind
// of failure a health check exists to refuse to hide. The default is a healthy
// count, so only the cases that care have to say anything.
const supabaseTableResults: Record<string, { error: unknown; count?: number }> = {}

/** Comfortably above the 500,000 the health check treats as a finished load. */
const LOADED_STREETS = 567_767

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        limit: () =>
          Promise.resolve(supabaseTableResults[table] ?? { error: null, count: LOADED_STREETS }),
      }),
    }),
  },
}))

import { GET } from '@/app/api/health/route'
import * as auth from '@/lib/api-auth'

const mockedAuth = vi.mocked(auth)

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(supabaseTableResults)) {
    delete supabaseTableResults[key]
  }
  process.env.RESEND_API_KEY = 'test'
  process.env.NEXTAUTH_SECRET = 'test'
  // Restored here, not just in tests/setup.ts: the env_twilio cases
  // below delete and shorten these, and without a reset the first one
  // to run would silently change the result of every test after it.
  process.env.TWILIO_ACCOUNT_SID = 'ACtest00000000000000000000000000'
  process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token'
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MGtest00000000000000000000000000'
  process.env.TWILIO_WEBHOOK_URL = 'https://test.local/api/sms/inbound'
  process.env.PHONE_OTP_PEPPER = 'test-pepper-at-least-32-characters-long'
})

describe('GET /api/health', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 200 + ok=true when all checks pass', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'admin' }))
    )
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // Eight since `env_geocoder` joined them: naming a paid provider without
    // its key makes the app fall back to OpenStreetMap silently, so somebody
    // believes they are paying for coverage they are not getting.
    expect(body.checks).toHaveLength(8)
    expect(body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true)
  })

  describe('env_twilio', () => {
    const TWILIO_KEYS = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_MESSAGING_SERVICE_SID',
      'TWILIO_WEBHOOK_URL',
      'PHONE_OTP_PEPPER',
    ]

    const twilioCheck = (body: { checks: Array<{ name: string; ok: boolean; error?: string }> }) =>
      body.checks.find((c) => c.name === 'env_twilio')!

    beforeEach(() => {
      mockedAuth.requireAdmin.mockImplementation(
        buildRequireAdmin(buildSession({ role: 'admin' }))
      )
    })

    // SMS is an optional feature. Failing the healthcheck because
    // nobody turned it on would page someone about nothing.
    it('passes when Twilio is entirely absent — the feature is simply off', async () => {
      for (const key of TWILIO_KEYS) delete process.env[key]
      const res = await GET()
      expect(res.status).toBe(200)
      expect(twilioCheck(await res.json()).ok).toBe(true)
    })

    // A partial configuration is the dangerous state: someone believes
    // texts are working, and the send path fails closed and silently.
    it('fails when Twilio is only partly configured', async () => {
      delete process.env.TWILIO_AUTH_TOKEN
      const res = await GET()
      expect(res.status).toBe(503)
      const check = twilioCheck(await res.json())
      expect(check.ok).toBe(false)
      expect(check.error).toContain('TWILIO_AUTH_TOKEN')
    })

    it('fails on a pepper too short to be worth having', async () => {
      process.env.PHONE_OTP_PEPPER = 'short'
      const res = await GET()
      expect(res.status).toBe(503)
      expect(twilioCheck(await res.json()).error).toContain('32 characters')
    })
  })

  it('returns 503 when a Supabase check fails', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'admin' }))
    )
    supabaseTableResults.referrals = { error: { message: 'column missing' } }
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    const referralsCheck = body.checks.find(
      (c: { name: string }) => c.name === 'supabase_referrals_columns'
    )
    expect(referralsCheck.ok).toBe(false)
    expect(referralsCheck.error).toContain('column missing')
  })

  it('returns 503 when an env var is missing', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'admin' }))
    )
    delete process.env.RESEND_API_KEY
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    const envCheck = body.checks.find(
      (c: { name: string }) => c.name === 'env_resend_key'
    )
    expect(envCheck.ok).toBe(false)
  })

  it('every check has a latency measurement', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'admin' }))
    )
    const res = await GET()
    const body = await res.json()
    for (const c of body.checks) {
      expect(typeof c.latencyMs).toBe('number')
      expect(c.latencyMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('sets cache-control no-store', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'admin' }))
    )
    const res = await GET()
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
