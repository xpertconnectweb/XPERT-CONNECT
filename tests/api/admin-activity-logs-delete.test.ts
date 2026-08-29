import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAdmin, buildSession, buildRequest, buildSupabaseChainMock } from './_helpers'

vi.mock('@/lib/api-auth', () => ({ requireAdmin: vi.fn() }))

const sb = buildSupabaseChainMock()
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { DELETE } from '@/app/api/admin/activity-logs/[id]/route'
import * as auth from '@/lib/api-auth'
import * as activity from '@/lib/activity-log'

const mockedAuth = vi.mocked(auth)
const mockedActivity = vi.mocked(activity)

const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null, count: 1 })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('DELETE /api/admin/activity-logs/[id] — auth', () => {
  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await DELETE(buildRequest(null), params('1'))
    expect(res.status).toBe(401)
    expect(sb.calls).toHaveLength(0)
  })

  it.each(['lawyer', 'clinic', 'partner', 'directory'] as const)(
    'turns a %s away',
    async (role) => {
      mockedAuth.requireAdmin.mockImplementation(
        buildRequireAdmin(buildSession({ role, id: 'u-x', name: 'X' }))
      )
      const res = await DELETE(buildRequest(null), params('1'))
      expect(res.status).toBe(401)
      expect(sb.calls).toHaveLength(0)
    }
  )
})

describe('DELETE /api/admin/activity-logs/[id]', () => {
  it('deletes the entry', async () => {
    const res = await DELETE(buildRequest(null), params('42'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(sb.calls).toContainEqual({ method: 'from', args: ['activity_logs'] })
    expect(sb.calls).toContainEqual({ method: 'eq', args: ['id', 42] })
  })

  // Erasing a name must not write that same name straight back into the table
  // it was just removed from, so this handler deliberately does not audit.
  it('does not write a new audit entry for the deletion', async () => {
    await DELETE(buildRequest(null), params('42'))
    expect(mockedActivity.logActivity).not.toHaveBeenCalled()
  })

  // `parseInt` would turn "12abc" into 12 and delete an unrelated row.
  it.each(['abc', '12abc', '', '1.5', 'NaN'])(
    'rejects the non-integer id %o without touching the table',
    async (id) => {
      const res = await DELETE(buildRequest(null), params(id))
      expect(res.status).toBe(400)
      expect(sb.calls).toHaveLength(0)
    }
  )

  it('returns 404 when no row matched', async () => {
    sb.setResult({ data: null, error: null, count: 0 })
    const res = await DELETE(buildRequest(null), params('99'))
    expect(res.status).toBe(404)
  })

  it('surfaces a driver error as a 500', async () => {
    sb.setResult({ data: null, error: { message: 'boom' } })
    const res = await DELETE(buildRequest(null), params('1'))
    expect(res.status).toBe(500)
  })
})
