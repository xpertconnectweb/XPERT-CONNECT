import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  buildRequireAdmin,
  buildSession,
  buildSupabaseChainMock,
  fakeActivityLog,
} from './_helpers'

const sb = buildSupabaseChainMock({ data: [], error: null, count: 0 })

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))

import { GET } from '@/app/api/admin/activity-logs/route'
import * as auth from '@/lib/api-auth'

const mockedAuth = vi.mocked(auth)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

function buildNextRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: [], error: null, count: 0 })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('GET /api/admin/activity-logs', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET(
      buildNextRequest('http://localhost/api/admin/activity-logs')
    )
    expect(res.status).toBe(401)
  })

  it('returns a paginated payload with defaults', async () => {
    sb.setResult({ data: [fakeActivityLog()], error: null, count: 1 })
    const res = await GET(
      buildNextRequest('http://localhost/api/admin/activity-logs')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.logs).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(50)
    expect(body.totalPages).toBe(1)
  })

  it('applies action + targetType filters', async () => {
    await GET(
      buildNextRequest(
        'http://localhost/api/admin/activity-logs?action=clinic_created&targetType=clinic'
      )
    )
    const actionEq = sb.calls.find(
      (c) => c.method === 'eq' && c.args[0] === 'action'
    )
    const typeEq = sb.calls.find(
      (c) => c.method === 'eq' && c.args[0] === 'target_type'
    )
    expect(actionEq?.args[1]).toBe('clinic_created')
    expect(typeEq?.args[1]).toBe('clinic')
  })

  it('applies date range filters', async () => {
    await GET(
      buildNextRequest(
        'http://localhost/api/admin/activity-logs?from=2026-01-01&to=2026-01-31'
      )
    )
    const gte = sb.calls.find((c) => c.method === 'gte')
    const lte = sb.calls.find((c) => c.method === 'lte')
    expect(gte?.args).toEqual(['created_at', '2026-01-01'])
    expect(lte?.args[0]).toBe('created_at')
    expect(String(lte?.args[1])).toMatch(/2026-01-31T23:59:59/)
  })

  it('passes pagination through to range()', async () => {
    await GET(
      buildNextRequest('http://localhost/api/admin/activity-logs?page=2&limit=10')
    )
    const range = sb.calls.find((c) => c.method === 'range')
    expect(range?.args).toEqual([10, 19])
  })

  it('returns 500 when Supabase errors', async () => {
    sb.reset({ data: null, error: { message: 'permission denied' }, count: 0 })
    const res = await GET(
      buildNextRequest('http://localhost/api/admin/activity-logs')
    )
    expect(res.status).toBe(500)
  })
})
