import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  buildSupabaseChainMock,
} from './_helpers'

const sb = buildSupabaseChainMock({ data: [], error: null })

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { GET, PATCH } from '@/app/api/admin/settings/route'
import * as auth from '@/lib/api-auth'
import * as activityLog from '@/lib/activity-log'

const mockedAuth = vi.mocked(auth)
const mockedLog = vi.mocked(activityLog)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: [], error: null })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('GET /api/admin/settings', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('flattens an array of key/value rows into an object', async () => {
    sb.setResult({
      data: [
        { key: 'site_name', value: 'Xpert' },
        { key: 'referral_emails_enabled', value: true },
      ],
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      site_name: 'Xpert',
      referral_emails_enabled: true,
    })
  })

  it('returns 500 when Supabase errors', async () => {
    sb.setResult({ data: null, error: { message: 'denied' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/admin/settings', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await PATCH(
      buildRequest({ key: 'k', value: 'v' }) as Request
    )
    expect(res.status).toBe(401)
  })

  it('rejects missing key', async () => {
    const res = await PATCH(buildRequest({ value: 'v' }) as Request)
    expect(res.status).toBe(400)
  })

  it('rejects undefined value', async () => {
    const res = await PATCH(buildRequest({ key: 'k' }) as Request)
    expect(res.status).toBe(400)
  })

  it('upserts the row and logs activity', async () => {
    const res = await PATCH(
      buildRequest({ key: 'site_name', value: 'New' }) as Request
    )
    expect(res.status).toBe(200)
    expect(sb.calls).toContainEqual({ method: 'from', args: ['settings'] })
    const upsert = sb.calls.find((c) => c.method === 'upsert')
    expect(upsert).toBeDefined()
    const payload = upsert?.args[0] as Record<string, unknown>
    expect(payload.key).toBe('site_name')
    expect(payload.value).toBe('New')
    expect(payload.updated_by).toBe(ADMIN.user.id)
    expect(mockedLog.logActivity).toHaveBeenCalledOnce()
  })

  it('returns 500 when upsert fails', async () => {
    sb.setResult({ data: null, error: { message: 'rls block' } })
    const res = await PATCH(
      buildRequest({ key: 'k', value: 'v' }) as Request
    )
    expect(res.status).toBe(500)
  })
})
