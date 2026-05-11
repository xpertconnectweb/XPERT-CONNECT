import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAuth,
  buildSession,
  buildRequest,
  fakeClinic,
  fakeReferral,
} from './_helpers'

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
  clinicToMedicalSpecialistReferralEmail: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/professionals/referrals/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAuth.mockImplementation(
    buildRequireAuth(
      buildSession({ role: 'clinic', clinicId: 'c-001', id: 'u-clinic' })
    )
  )
  mockedData.getClinicById.mockImplementation(async (id: string) => {
    if (id === 'c-001') return fakeClinic({ id: 'c-001', name: 'Source Clinic' })
    if (id === 'c-002') return fakeClinic({ id: 'c-002', name: 'Target Clinic' })
    return undefined
  })
  mockedData.createReferral.mockResolvedValue(
    fakeReferral({ referralKind: 'medical_specialist', creatorRole: 'clinic' })
  )
})

describe('POST /api/professionals/referrals — clinic → medical specialist', () => {
  it('requires specialistType when referralKind is medical_specialist', async () => {
    const res = await POST(
      buildRequest({
        referralKind: 'medical_specialist',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/specialistType/)
  })

  it('rejects invalid specialistType values', async () => {
    const res = await POST(
      buildRequest({
        referralKind: 'medical_specialist',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        specialistType: 'NotARealSpecialty',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Invalid specialistType/)
  })

  it('creates referral when targetClinicId is omitted (XPERT will match)', async () => {
    const res = await POST(
      buildRequest({
        referralKind: 'medical_specialist',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        specialistType: 'Orthopedist',
      })
    )
    expect(res.status).toBe(201)
    const saved = mockedData.createReferral.mock.calls[0][0]
    expect(saved.referralKind).toBe('medical_specialist')
    expect(saved.specialistType).toBe('Orthopedist')
    expect(saved.targetClinicId).toBeNull()
    expect(saved.targetClinicName).toBeNull()
    expect(saved.lawyerId).toBeNull()
    expect(saved.lawyerName).toBeNull()
    expect(saved.clinicId).toBe('c-001')
    expect(saved.creatorRole).toBe('clinic')
  })

  it('resolves targetClinicName when targetClinicId is provided', async () => {
    const res = await POST(
      buildRequest({
        referralKind: 'medical_specialist',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        specialistType: 'Chiropractor',
        targetClinicId: 'c-002',
      })
    )
    expect(res.status).toBe(201)
    const saved = mockedData.createReferral.mock.calls[0][0]
    expect(saved.targetClinicId).toBe('c-002')
    expect(saved.targetClinicName).toBe('Target Clinic')
  })

  it('returns 404 when targetClinicId does not exist', async () => {
    const res = await POST(
      buildRequest({
        referralKind: 'medical_specialist',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        specialistType: 'Chiropractor',
        targetClinicId: 'c-missing',
      })
    )
    expect(res.status).toBe(404)
  })

  it('rejects referring to your own clinic', async () => {
    const res = await POST(
      buildRequest({
        referralKind: 'medical_specialist',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
        specialistType: 'Chiropractor',
        targetClinicId: 'c-001',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/own clinic/i)
  })

  it('does NOT take the medical branch when referralKind is omitted (regression)', async () => {
    mockedData.getLawyerById.mockResolvedValue({
      id: 'l-001',
      name: 'Test Firm',
      address: '1 Law St, Miami, FL 33101',
      lat: 0,
      lng: 0,
      phone: '305-555-1111',
      practiceAreas: [],
      email: 'lawyer@test.com',
      available: true,
    })
    mockedData.getLawyerUsersByEntityId.mockResolvedValue([])
    mockedData.createReferral.mockResolvedValue(
      fakeReferral({ referralKind: 'lawyer', creatorRole: 'clinic' })
    )

    const res = await POST(
      buildRequest({
        lawyerId: 'l-001',
        patientName: 'John Doe',
        patientPhone: '305-555-0000',
        caseType: 'Auto',
      })
    )
    expect(res.status).toBe(201)
    const saved = mockedData.createReferral.mock.calls[0][0]
    expect(saved.referralKind).toBe('lawyer')
    expect(saved.lawyerId).toBe('l-001')
  })
})
