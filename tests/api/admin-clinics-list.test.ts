import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAdmin, buildSession, fakeClinic } from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  getClinics: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { GET } from '@/app/api/admin/clinics/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)

const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('GET /api/admin/clinics — auth gating', () => {
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

describe('GET /api/admin/clinics — happy path', () => {
  it('returns the list of clinics for an admin', async () => {
    const rows = [fakeClinic({ id: 'c-1' }), fakeClinic({ id: 'c-2' })]
    mockedData.getClinics.mockResolvedValue(rows as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe('c-1')
  })

  it('returns an empty array when there are no clinics', async () => {
    mockedData.getClinics.mockResolvedValue([] as never)
    const res = await GET()
    expect(await res.json()).toEqual([])
  })
})
