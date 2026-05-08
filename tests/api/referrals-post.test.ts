import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAuth,
  buildSession,
  buildRequest,
  fakeClinic,
  fakeLawyer,
  fakeReferral,
  flushWaitUntil,
} from './_helpers'

// All mocks declared at the top so they're hoisted before the route import.
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
  referralCreatedEmail: vi.fn().mockResolvedValue(undefined),
  internalNotificationEmail: vi.fn().mockResolvedValue(undefined),
  clinicToLawyerReferralEmail: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/professionals/referrals/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'
import * as email from '@/lib/email'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const mockedEmail = vi.mocked(email)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/professionals/referrals — auth', () => {
  it('returns 401 when no session', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await POST(buildRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 403 when role is not lawyer or clinic', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'referrer' }))
    )
    const res = await POST(buildRequest({}))
    expect(res.status).toBe(403)
  })
})

describe('POST — required fields', () => {
  beforeEach(() => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'clinic', clinicId: 'c-001', id: 'u-clinic' })
      )
    )
  })

  it('rejects missing patientName', async () => {
    const res = await POST(buildRequest({ patientPhone: '305-555-0000', caseType: 'X' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Missing')
  })

  it('rejects missing patientPhone', async () => {
    const res = await POST(buildRequest({ patientName: 'X', caseType: 'X' }))
    expect(res.status).toBe(400)
  })

  it('rejects too-short patientName', async () => {
    const res = await POST(
      buildRequest({ patientName: 'J', patientPhone: '305-555-0000', caseType: 'X' })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/2-100/)
  })

  it('rejects invalid phone format', async () => {
    const res = await POST(
      buildRequest({ patientName: 'John Doe', patientPhone: 'abc', caseType: 'X' })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('phone')
  })

  it('rejects oversized notes', async () => {
    const res = await POST(
      buildRequest({
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        notes: 'x'.repeat(1001),
        lawyerId: 'l-001',
      })
    )
    expect(res.status).toBe(400)
  })
})

describe('POST — lawyer branch', () => {
  it('rejects when lawyer user is not linked to a firm (no lawyerId in session)', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'lawyer', id: 'u-lawyer' }))
    )
    const res = await POST(
      buildRequest({
        clinicId: 'c-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
      })
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/not linked to a firm/i)
  })

  it('creates referral with lawyer entity id, clinic, and creator metadata', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({
          role: 'lawyer',
          id: 'u-lawyer',
          lawyerId: 'l-001',
          name: 'Jane Lawyer',
          firmName: 'Big Firm',
        })
      )
    )
    mockedData.getClinicById.mockResolvedValue(fakeClinic())
    mockedData.getLawyerById.mockResolvedValue(fakeLawyer())
    mockedData.getUserById.mockResolvedValue({
      id: 'u-lawyer',
      role: 'lawyer',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockedData.getUsersByClinicId.mockResolvedValue([])
    mockedData.createReferral.mockResolvedValue(fakeReferral({ creatorRole: 'lawyer' }))

    const res = await POST(
      buildRequest({
        clinicId: 'c-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto Accident',
      })
    )

    expect(res.status).toBe(201)
    expect(mockedData.createReferral).toHaveBeenCalledOnce()
    const saved = mockedData.createReferral.mock.calls[0][0]
    expect(saved.lawyerId).toBe('l-001') // lawyer ENTITY id, NOT user id
    expect(saved.clinicId).toBe('c-001')
    expect(saved.createdByUserId).toBe('u-lawyer')
    expect(saved.creatorRole).toBe('lawyer')
    expect(saved.status).toBe('received')
  })

  it('returns 404 when target clinic does not exist', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'lawyer', id: 'u-lawyer', lawyerId: 'l-001' })
      )
    )
    mockedData.getClinicById.mockResolvedValue(undefined)
    mockedData.getLawyerById.mockResolvedValue(fakeLawyer())

    const res = await POST(
      buildRequest({
        clinicId: 'c-missing',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
      })
    )
    expect(res.status).toBe(404)
  })
})

describe('POST — clinic branch', () => {
  beforeEach(() => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(
        buildSession({ role: 'clinic', clinicId: 'c-001', id: 'u-clinic' })
      )
    )
    mockedData.getClinicById.mockResolvedValue(fakeClinic())
    mockedData.getLawyerById.mockResolvedValue(fakeLawyer())
    mockedData.getLawyerUsersByEntityId.mockResolvedValue([])
    mockedData.createReferral.mockResolvedValue(
      fakeReferral({ creatorRole: 'clinic' })
    )
  })

  it('requires lawyerId in body', async () => {
    const res = await POST(
      buildRequest({
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/lawyerId/)
  })

  it('rejects when clinic user has no clinicId', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'clinic', id: 'u-clinic' }))
    )
    const res = await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
      })
    )
    expect(res.status).toBe(403)
  })

  it('creates referral with clinic + lawyer entity', async () => {
    const res = await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto Accident',
      })
    )
    expect(res.status).toBe(201)
    const saved = mockedData.createReferral.mock.calls[0][0]
    expect(saved.lawyerId).toBe('l-001')
    expect(saved.clinicId).toBe('c-001')
    expect(saved.createdByUserId).toBe('u-clinic')
    expect(saved.creatorRole).toBe('clinic')
  })

  it('persists optional insurance + adjuster fields when provided', async () => {
    await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        insuranceCompany: 'State Farm',
        claimNumber: 'CLM-42',
        adjusterName: 'Adj Smith',
        adjusterPhone: '305-555-2222',
        adjusterEmail: 'adj@ins.com',
      })
    )
    const saved = mockedData.createReferral.mock.calls[0][0]
    expect(saved.insuranceCompany).toBe('State Farm')
    expect(saved.claimNumber).toBe('CLM-42')
    expect(saved.adjusterName).toBe('Adj Smith')
    expect(saved.adjusterPhone).toBe('305-555-2222')
    expect(saved.adjusterEmail).toBe('adj@ins.com')
  })

  it('rejects malformed adjuster email', async () => {
    const res = await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        adjusterEmail: 'not-an-email',
      })
    )
    expect(res.status).toBe(400)
  })

  it('rejects oversized optional field', async () => {
    const res = await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        insuranceCompany: 'x'.repeat(201),
      })
    )
    expect(res.status).toBe(400)
  })

  it('emails the firm and every lawyer user linked to it', async () => {
    mockedData.getLawyerUsersByEntityId.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 'u1', email: 'a@firm.com', role: 'lawyer' } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 'u2', email: 'b@firm.com', role: 'lawyer' } as any,
    ])
    await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
      })
    )
    await flushWaitUntil()
    const recipients = mockedEmail.clinicToLawyerReferralEmail.mock.calls.map(
      (call) => call[1]
    )
    // firm entity email + 2 user emails (deduplicated via Set)
    expect(recipients).toContain('lawyer@test.com')
    expect(recipients).toContain('a@firm.com')
    expect(recipients).toContain('b@firm.com')
  })

  it('sanitizes HTML in user-supplied fields before persisting', async () => {
    await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: '<b>John</b> Doe',
        patientPhone: '305-555-0000',
        caseType: '<script>x</script>Auto',
        insuranceCompany: '<img src=x>State Farm',
      })
    )
    const saved = mockedData.createReferral.mock.calls[0][0]
    expect(saved.patientName).not.toContain('<b>')
    expect(saved.patientName).toBe('John Doe')
    expect(saved.caseType).not.toContain('<script>')
    expect(saved.insuranceCompany).toBe('State Farm')
  })
})
