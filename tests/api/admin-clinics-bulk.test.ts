import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  buildSupabaseChainMock,
} from './_helpers'

const sb = buildSupabaseChainMock({ data: null, error: null })

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { PATCH, DELETE } from '@/app/api/admin/clinics/bulk/route'
import * as auth from '@/lib/api-auth'

const mockedAuth = vi.mocked(auth)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('PATCH /api/admin/clinics/bulk', () => {
  it('returns 401 for non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await PATCH(
      buildRequest({ ids: ['c-1'], available: false }) as Request
    )
    expect(res.status).toBe(401)
  })

  it('rejects empty ids', async () => {
    const res = await PATCH(
      buildRequest({ ids: [], available: false }) as Request
    )
    expect(res.status).toBe(400)
  })

  it('rejects missing ids array', async () => {
    const res = await PATCH(
      buildRequest({ available: false }) as Request
    )
    expect(res.status).toBe(400)
  })

  it('rejects non-boolean available', async () => {
    const res = await PATCH(
      buildRequest({ ids: ['c-1'], available: 'yes' }) as Request
    )
    expect(res.status).toBe(400)
  })

  it('toggles availability on the supplied ids', async () => {
    const res = await PATCH(
      buildRequest({ ids: ['c-1', 'c-2', 'c-3'], available: false }) as Request
    )
    expect(res.status).toBe(200)
    expect(sb.calls).toContainEqual({ method: 'from', args: ['clinics'] })
    const inCall = sb.calls.find((c) => c.method === 'in')
    expect(inCall?.args).toEqual(['id', ['c-1', 'c-2', 'c-3']])
    const body = await res.json()
    expect(body.count).toBe(3)
  })

  it('returns 500 when Supabase fails', async () => {
    sb.reset({ data: null, error: { message: 'boom' } })
    const res = await PATCH(
      buildRequest({ ids: ['c-1'], available: false }) as Request
    )
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/clinics/bulk', () => {
  it('returns 401 for non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await DELETE(buildRequest({ ids: ['c-1'] }) as Request)
    expect(res.status).toBe(401)
  })

  it('rejects empty ids', async () => {
    const res = await DELETE(buildRequest({ ids: [] }) as Request)
    expect(res.status).toBe(400)
  })

  it('bulk-deletes the supplied ids', async () => {
    const res = await DELETE(buildRequest({ ids: ['c-1', 'c-2'] }) as Request)
    expect(res.status).toBe(200)
    expect(sb.calls.some((c) => c.method === 'delete')).toBe(true)
    expect(sb.calls.some((c) => c.method === 'in')).toBe(true)
  })
})
