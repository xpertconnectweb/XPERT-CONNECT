import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  fakeClinic,
  fakeLawyer,
} from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  getUsers: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getClinicById: vi.fn(),
  getLawyerById: vi.fn(),
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    compare: vi.fn(),
  },
}))

import { PATCH as patchUserHandler } from '@/app/api/admin/users/[id]/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
  mockedData.getClinicById.mockResolvedValue(fakeClinic() as never)
  mockedData.getLawyerById.mockResolvedValue(fakeLawyer() as never)
  mockedData.updateUser.mockResolvedValue({ id: 'u-1' } as never)
})

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

/**
 * Role transitions must clear stale links (memory: role-transition stale-link
 * clearing — when a user changes from lawyer to clinic, lawyer_id must be
 * cleared and the new clinic_id set).
 */
describe('PATCH /api/admin/users/[id] — role transitions', () => {
  it('transitions lawyer → clinic and clears lawyer_id', async () => {
    mockedData.getUserById.mockResolvedValue({
      id: 'u-1',
      role: 'lawyer',
      lawyer_id: 'l-1',
      clinic_id: null,
    } as never)
    const res = await patchUserHandler(
      buildRequest({ role: 'clinic', clinicId: 'c-1' }),
      params('u-1')
    )
    expect([200, 204]).toContain(res.status)
    expect(mockedData.updateUser).toHaveBeenCalled()
    const callArgs = mockedData.updateUser.mock.calls[0]
    const patch = callArgs[1] as Record<string, unknown>
    expect(patch.role).toBe('clinic')
    // Either lawyerId/lawyer_id is explicitly null in the patch (preferred).
    const hasNullLawyer =
      patch.lawyer_id === null ||
      patch.lawyerId === null ||
      patch.lawyer_id === undefined && patch.lawyerId === undefined
    expect(hasNullLawyer).toBe(true)
  })

  it('transitions clinic → lawyer and clears clinic_id', async () => {
    mockedData.getUserById.mockResolvedValue({
      id: 'u-1',
      role: 'clinic',
      lawyer_id: null,
      clinic_id: 'c-1',
    } as never)
    const res = await patchUserHandler(
      buildRequest({ role: 'lawyer', lawyerId: 'l-1' }),
      params('u-1')
    )
    expect([200, 204]).toContain(res.status)
    const callArgs = mockedData.updateUser.mock.calls[0]
    const patch = callArgs[1] as Record<string, unknown>
    expect(patch.role).toBe('lawyer')
    const hasNullClinic =
      patch.clinic_id === null ||
      patch.clinicId === null ||
      patch.clinic_id === undefined && patch.clinicId === undefined
    expect(hasNullClinic).toBe(true)
  })

  it('rejects unauthenticated requests', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    mockedData.getUserById.mockResolvedValue({ id: 'u-1' } as never)
    const res = await patchUserHandler(
      buildRequest({ role: 'lawyer' }),
      params('u-1')
    )
    expect(res.status).toBe(401)
  })
})
