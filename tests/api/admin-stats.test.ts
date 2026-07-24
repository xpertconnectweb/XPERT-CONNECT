import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildSupabaseChainMock,
} from './_helpers'

const sb = buildSupabaseChainMock({ data: [], error: null, count: 0 })

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/mappers', () => ({
  rowsToModels: vi.fn((rows: unknown[]) => rows),
}))

import { GET } from '@/app/api/admin/stats/route'
import * as auth from '@/lib/api-auth'

const mockedAuth = vi.mocked(auth)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

// Minimal NextRequest-shaped object — the route only reads `.url`.
const req = (url = 'http://localhost/api/admin/stats') => ({ url }) as never

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: [], error: null, count: 0 })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('GET /api/admin/stats — auth', () => {
  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 401 for non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'lawyer' }))
    )
    const res = await GET(req())
    expect(res.status).toBe(401)
  })
})

describe('GET /api/admin/stats — aggregation', () => {
  it('returns the full nested payload for an admin', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      range: '30d',
      generatedAt: expect.any(String),
      kpis: {
        referralsPeriod: expect.any(Number),
        referralsPrev: expect.any(Number),
        activePipeline: expect.any(Number),
        partnerPending: expect.any(Number),
        clinicsAvailable: expect.any(Number),
        clinicsTotal: expect.any(Number),
        totalReferrals: expect.any(Number),
        totalUsers: expect.any(Number),
      },
      funnel: { received: expect.any(Number), inProcess: expect.any(Number), attended: expect.any(Number) },
      trend: expect.any(Array),
      mix: { byKind: expect.any(Object), byCreator: expect.any(Object), topCaseTypes: expect.any(Array) },
      partner: expect.any(Object),
      network: expect.any(Object),
      topClinics: expect.any(Array),
      topLawyers: expect.any(Array),
      usersByRole: expect.any(Object),
      contacts: expect.any(Object),
      newsletter: expect.any(Object),
      alerts: expect.any(Object),
      recentReferrals: expect.any(Array),
      recentActivity: expect.any(Array),
    })
  })

  it('defaults to a 30-point daily trend and honors ?range', async () => {
    const d30 = await (await GET(req())).json()
    expect(d30.trend).toHaveLength(30)

    const yr = await (await GET(req('http://localhost/api/admin/stats?range=12mo'))).json()
    expect(yr.range).toBe('12mo')
    expect(yr.trend).toHaveLength(12)

    const wk = await (await GET(req('http://localhost/api/admin/stats?range=7d'))).json()
    expect(wk.trend).toHaveLength(7)
  })

  it('falls back to 30d for an invalid range', async () => {
    const body = await (await GET(req('http://localhost/api/admin/stats?range=bogus'))).json()
    expect(body.range).toBe('30d')
  })

  it('queries all the expected tables', async () => {
    await GET(req())
    const tables = sb.calls
      .filter((c) => c.method === 'from')
      .map((c) => c.args[0] as string)
    for (const t of ['referrals', 'referrer_referrals', 'clinics', 'lawyers', 'contacts', 'users', 'newsletter_subscribers', 'activity_logs']) {
      expect(tables).toContain(t)
    }
  })
})
