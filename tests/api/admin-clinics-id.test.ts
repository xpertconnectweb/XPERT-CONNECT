import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  buildSupabaseChainMock,
} from './_helpers'

const sb = buildSupabaseChainMock({ data: [{ id: 'c-1', name: 'A' }], error: null })

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
  requireAuth: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/sanitize', () => ({
  sanitize: vi.fn((s: string) => s.trim()),
}))

import { PATCH, DELETE } from '@/app/api/admin/clinics/[id]/route'
import * as auth from '@/lib/api-auth'

const mockedAuth = vi.mocked(auth)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: [{ id: 'c-1', name: 'A' }], error: null })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/admin/clinics/[id]', () => {
  it('returns 401 for non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await PATCH(buildRequest({ name: 'New' }) as Request, params('c-1'))
    expect(res.status).toBe(401)
  })

  it('rejects empty update payload', async () => {
    const res = await PATCH(buildRequest({}) as Request, params('c-1'))
    expect(res.status).toBe(400)
  })

  it('rejects non-finite lat', async () => {
    const res = await PATCH(
      buildRequest({ lat: 'oops' }) as Request,
      params('c-1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects specialties that is not an array', async () => {
    const res = await PATCH(
      buildRequest({ specialties: 'not-an-array' }) as Request,
      params('c-1')
    )
    expect(res.status).toBe(400)
  })

  it('rejects invalid email format', async () => {
    const res = await PATCH(
      buildRequest({ email: 'not-an-email' }) as Request,
      params('c-1')
    )
    expect(res.status).toBe(400)
  })

  it('updates allowed fields and logs activity', async () => {
    const res = await PATCH(
      buildRequest({ name: 'Updated Clinic' }) as Request,
      params('c-1')
    )
    expect(res.status).toBe(200)
    expect(sb.calls).toContainEqual({ method: 'from', args: ['clinics'] })
    expect(sb.calls.some((c) => c.method === 'update')).toBe(true)
    expect(sb.calls.some((c) => c.method === 'eq' && c.args[0] === 'id')).toBe(true)
  })

  it('returns 500 when Supabase fails', async () => {
    sb.reset({ data: null, error: { message: 'boom' } })
    const res = await PATCH(
      buildRequest({ name: 'X' }) as Request,
      params('c-1')
    )
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/clinics/[id]', () => {
  it('returns 401 for non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await DELETE(buildRequest({}) as Request, params('c-1'))
    expect(res.status).toBe(401)
  })

  it('deletes the row and logs activity', async () => {
    sb.reset({ data: null, error: null })
    const res = await DELETE(buildRequest({}) as Request, params('c-1'))
    expect(res.status).toBe(200)
    expect(sb.calls).toContainEqual({ method: 'from', args: ['clinics'] })
    expect(sb.calls.some((c) => c.method === 'delete')).toBe(true)
  })

  it('returns 500 when Supabase fails', async () => {
    sb.reset({ data: null, error: { message: 'fk violation' } })
    const res = await DELETE(buildRequest({}) as Request, params('c-1'))
    expect(res.status).toBe(500)
  })
})
