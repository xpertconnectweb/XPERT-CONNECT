import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAdmin, buildSession } from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

// Build a programmable Supabase mock where each `.from(table).select(...).limit(N)`
// resolves to whatever was registered for that table.
const supabaseTableResults: Record<string, { error: unknown }> = {}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        limit: () =>
          Promise.resolve(supabaseTableResults[table] ?? { error: null }),
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
    expect(body.checks).toHaveLength(6)
    expect(body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true)
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
