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

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: [], error: null, count: 0 })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('GET /api/admin/stats — auth', () => {
  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 401 for non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'lawyer' }))
    )
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('GET /api/admin/stats — aggregation', () => {
  it('returns a payload with all expected keys for an admin', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      totalUsers: expect.any(Number),
      lawyers: expect.any(Number),
      clinics: expect.any(Number),
      totalReferrals: expect.any(Number),
      received: expect.any(Number),
      inProcess: expect.any(Number),
      attended: expect.any(Number),
      totalContacts: expect.any(Number),
      totalSubscribers: expect.any(Number),
      monthlyReferrals: expect.any(Array),
      topClinics: expect.any(Array),
      topLawyers: expect.any(Array),
      recentActivity: expect.any(Array),
    })
    expect(body.monthlyReferrals).toHaveLength(6)
  })

  it('queries all the expected tables', async () => {
    await GET()
    const tables = sb.calls
      .filter((c) => c.method === 'from')
      .map((c) => c.args[0] as string)
    expect(tables).toContain('users')
    expect(tables).toContain('referrals')
    expect(tables).toContain('contacts')
    expect(tables).toContain('newsletter_subscribers')
    expect(tables).toContain('clinics')
    expect(tables).toContain('activity_logs')
  })
})
