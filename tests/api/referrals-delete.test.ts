import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  buildSupabaseChainMock,
  fakeReferral,
} from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  getReferralById: vi.fn(),
  updateReferralFields: vi.fn(),
}))

const sb = buildSupabaseChainMock()
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { DELETE } from '@/app/api/professionals/referrals/[id]/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'
import * as activity from '@/lib/activity-log'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const mockedActivity = vi.mocked(activity)

const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })
const PARAMS = { params: Promise.resolve({ id: 'ref-test-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null, count: 1 })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
  mockedData.getReferralById.mockResolvedValue(fakeReferral())
})

describe('DELETE /api/professionals/referrals/[id] — auth', () => {
  // The route lives under /api/professionals but is admin-only, unlike the
  // PATCH in the same file which any owning clinic or firm lawyer may call.
  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(401)
    expect(sb.calls).toHaveLength(0)
  })

  it.each(['lawyer', 'clinic', 'partner'] as const)(
    'turns a %s away',
    async (role) => {
      mockedAuth.requireAdmin.mockImplementation(
        buildRequireAdmin(buildSession({ role, id: 'u-x', name: 'X' }))
      )
      const res = await DELETE(buildRequest(null), PARAMS)
      expect(res.status).toBe(401)
      expect(sb.calls).toHaveLength(0)
    }
  )
})

describe('DELETE /api/professionals/referrals/[id]', () => {
  it('deletes the row and logs the activity', async () => {
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(sb.calls).toContainEqual({ method: 'from', args: ['referrals'] })
    expect(sb.calls).toContainEqual({ method: 'eq', args: ['id', 'ref-test-1'] })
    expect(mockedActivity.logActivity.mock.calls[0][0]).toMatchObject({
      action: 'referral_deleted',
      targetType: 'referral',
      targetId: 'ref-test-1',
      targetName: 'John Doe',
    })
  })

  // The delete used to answer 200 for an id that was never there, and log an
  // audit entry with `targetName: undefined` for a deletion that never
  // happened. Two admins on the same list hit exactly this.
  it('returns 404 for an unknown id, without deleting or logging', async () => {
    mockedData.getReferralById.mockResolvedValue(undefined)
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(404)
    expect(sb.calls).toHaveLength(0)
    expect(mockedActivity.logActivity).not.toHaveBeenCalled()
  })

  // A delete matching no row is not a PostgREST error, so the row count is
  // the only thing that catches the row vanishing after the read above.
  it('returns 404 when the delete affected no row', async () => {
    sb.setResult({ data: null, error: null, count: 0 })
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(404)
    expect(mockedActivity.logActivity).not.toHaveBeenCalled()
  })

  it('asks PostgREST for an exact count', async () => {
    await DELETE(buildRequest(null), PARAMS)
    expect(sb.calls).toContainEqual({
      method: 'delete',
      args: [{ count: 'exact' }],
    })
  })

  it('surfaces a driver error as a 500 and logs nothing', async () => {
    sb.setResult({ data: null, error: { message: 'boom' } })
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(500)
    expect(mockedActivity.logActivity).not.toHaveBeenCalled()
  })
})
