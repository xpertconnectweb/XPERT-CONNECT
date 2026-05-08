import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAuth, buildSession, fakeReferral } from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  getReferralsByLawyerEntity: vi.fn(),
  getReferralsByClinic: vi.fn(),
  createReferral: vi.fn(),
  getClinicById: vi.fn(),
  getLawyerById: vi.fn(),
  getUsersByClinicId: vi.fn(),
  getLawyerUsersByEntityId: vi.fn(),
  getUserById: vi.fn(),
}))

vi.mock('@/lib/email', () => ({
  referralCreatedEmail: vi.fn(),
  internalNotificationEmail: vi.fn(),
  clinicToLawyerReferralEmail: vi.fn(),
}))

import { GET } from '@/app/api/professionals/referrals/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/professionals/referrals', () => {
  it('returns 401 without session', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns empty list for referrer role (does not query DB)', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'referrer' }))
    )
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    expect(mockedData.getReferralsByLawyerEntity).not.toHaveBeenCalled()
    expect(mockedData.getReferralsByClinic).not.toHaveBeenCalled()
  })

  it('lawyer with no firm link gets empty list (does NOT query by user.id)', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'lawyer', id: 'u-lawyer-orphan' }))
    )
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    expect(mockedData.getReferralsByLawyerEntity).not.toHaveBeenCalled()
  })

  it('lawyer queries by lawyer ENTITY id (not user id)', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'lawyer', id: 'u-lawyer', lawyerId: 'l-001' })
      )
    )
    mockedData.getReferralsByLawyerEntity.mockResolvedValue([
      fakeReferral({ lawyerId: 'l-001' }),
    ])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(mockedData.getReferralsByLawyerEntity).toHaveBeenCalledWith('l-001')
    expect(mockedData.getReferralsByLawyerEntity).not.toHaveBeenCalledWith('u-lawyer')
  })

  it('clinic queries by clinic id', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'clinic', clinicId: 'c-001', id: 'u-clinic' })
      )
    )
    mockedData.getReferralsByClinic.mockResolvedValue([
      fakeReferral({ clinicId: 'c-001' }),
    ])
    const res = await GET()
    expect(mockedData.getReferralsByClinic).toHaveBeenCalledWith('c-001')
    expect(res.status).toBe(200)
  })

  it('clinic without clinicId gets empty list', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'clinic', id: 'u-clinic' }))
    )
    const res = await GET()
    expect(await res.json()).toEqual([])
    expect(mockedData.getReferralsByClinic).not.toHaveBeenCalled()
  })
})
