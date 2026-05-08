import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAuth,
  buildSession,
  buildRequest,
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

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

import { PATCH } from '@/app/api/professionals/referrals/[id]/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)

const PARAMS = { params: Promise.resolve({ id: 'ref-test-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mockedData.updateReferralFields.mockImplementation(async (id, patch) =>
    fakeReferral({ id, ...patch })
  )
})

describe('PATCH /api/professionals/referrals/[id] — auth', () => {
  it('returns 401 when no session', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await PATCH(buildRequest({ status: 'attended' }, { method: 'PATCH' }), PARAMS)
    expect(res.status).toBe(401)
  })

  it('returns 404 when referral does not exist', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'admin' }))
    )
    mockedData.getReferralById.mockResolvedValue(undefined)
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(404)
  })
})

describe('PATCH — authorization matrix', () => {
  beforeEach(() => {
    mockedData.getReferralById.mockResolvedValue(
      fakeReferral({ lawyerId: 'l-001', clinicId: 'c-001' })
    )
  })

  it('admin can edit any referral', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'admin' }))
    )
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(200)
  })

  it('lawyer linked to the firm CAN edit (firm membership, not user identity)', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'lawyer', id: 'u-different', lawyerId: 'l-001' })
      )
    )
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(200)
  })

  it('lawyer NOT linked to the firm cannot edit', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'lawyer', id: 'u-other', lawyerId: 'l-999' })
      )
    )
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(403)
  })

  it('lawyer with no lawyerId at all cannot edit', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'lawyer', id: 'u-orphan' }))
    )
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(403)
  })

  it('clinic owning the referral can edit', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'clinic', clinicId: 'c-001', id: 'u-clinic' })
      )
    )
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(200)
  })

  it('a different clinic cannot edit', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'clinic', clinicId: 'c-999', id: 'u-clinic-2' })
      )
    )
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(403)
  })

  it('referrer role cannot edit', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'referrer' }))
    )
    const res = await PATCH(buildRequest({ status: 'attended' }), PARAMS)
    expect(res.status).toBe(403)
  })
})

describe('PATCH — allowlist enforcement', () => {
  beforeEach(() => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'admin' }))
    )
    mockedData.getReferralById.mockResolvedValue(fakeReferral())
  })

  it('rejects empty body (no whitelisted fields)', async () => {
    const res = await PATCH(buildRequest({}), PARAMS)
    expect(res.status).toBe(400)
  })

  it('silently drops fields outside the allowlist', async () => {
    const res = await PATCH(
      buildRequest({
        status: 'attended',
        patientName: 'OVERRIDE',
        lawyerId: 'l-attacker',
        clinicId: 'c-attacker',
      }),
      PARAMS
    )
    expect(res.status).toBe(200)
    const patch = mockedData.updateReferralFields.mock.calls[0][1]
    expect(patch).toHaveProperty('status', 'attended')
    expect(patch).not.toHaveProperty('patientName')
    expect(patch).not.toHaveProperty('lawyerId')
    expect(patch).not.toHaveProperty('clinicId')
  })

  it('accepts insurance + adjuster fields', async () => {
    await PATCH(
      buildRequest({
        insuranceCompany: 'State Farm',
        claimNumber: 'CLM-100',
        adjusterName: 'Adj Smith',
        adjusterPhone: '305-555-2222',
        adjusterEmail: 'adj@ins.com',
      }),
      PARAMS
    )
    const patch = mockedData.updateReferralFields.mock.calls[0][1]
    expect(patch.insuranceCompany).toBe('State Farm')
    expect(patch.claimNumber).toBe('CLM-100')
    expect(patch.adjusterName).toBe('Adj Smith')
    expect(patch.adjusterPhone).toBe('305-555-2222')
    expect(patch.adjusterEmail).toBe('adj@ins.com')
  })

  it('rejects invalid status', async () => {
    const res = await PATCH(buildRequest({ status: 'completed' }), PARAMS)
    expect(res.status).toBe(400)
  })

  it('rejects malformed adjuster email', async () => {
    const res = await PATCH(buildRequest({ adjusterEmail: 'not-an-email' }), PARAMS)
    expect(res.status).toBe(400)
  })

  it('rejects malformed adjuster phone', async () => {
    const res = await PATCH(buildRequest({ adjusterPhone: 'abc' }), PARAMS)
    expect(res.status).toBe(400)
  })

  it('rejects oversized adjuster name', async () => {
    const res = await PATCH(
      buildRequest({ adjusterName: 'x'.repeat(201) }),
      PARAMS
    )
    expect(res.status).toBe(400)
  })

  it('sanitizes HTML in adjuster fields', async () => {
    await PATCH(
      buildRequest({ adjusterName: '<script>evil()</script>Adj' }),
      PARAMS
    )
    const patch = mockedData.updateReferralFields.mock.calls[0][1]
    expect(patch.adjusterName).not.toContain('<script>')
    expect(patch.adjusterName).toBe('evil()Adj')
  })
})
