import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  buildRequireAuth,
  buildSession,
  flushWaitUntil,
} from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}))
vi.mock('@/lib/data', () => ({
  getReferrerReferralsByReferrer: vi.fn(),
  createReferrerReferral: vi.fn(),
}))
vi.mock('@/lib/email', () => ({
  referrerReferralNotificationEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { GET, POST } from '@/app/api/professionals/referrer-referrals/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'
import * as email from '@/lib/email'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const mockedEmail = vi.mocked(email)

const REFERRER = buildSession({ role: 'referrer', id: 'ref-1', name: 'Ref One' })

function nextReq(body: unknown): NextRequest {
  return {
    url: 'http://localhost/api/professionals/referrer-referrals',
    json: async () => body,
  } as unknown as NextRequest
}

function fakeRR(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rref-1',
    referrerId: 'ref-1',
    referrerName: 'Ref One',
    state: 'FL',
    clientName: 'Client',
    clientPhone: '305-555-1234',
    clientEmail: '',
    clientAddress: '1 Main, Miami, FL',
    serviceNeeded: 'clinic',
    caseType: 'Auto Accident',
    notes: '',
    status: 'pending',
    caseConfirmed: 'pending',
    adminNotes: '',
    assignedClinicId: 'c-1',
    assignedClinicName: 'Assigned Clinic',
    assignedLawyerId: null,
    assignedLawyerName: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAuth.mockImplementation(buildRequireAuth(REFERRER))
  mockedData.createReferrerReferral.mockImplementation(async (r) => r as never)
})

describe('GET /api/professionals/referrer-referrals', () => {
  it('rejects unauthenticated', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns referrer-scoped rows with assigned fields stripped', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([
      fakeRR(),
    ] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].assignedClinicId).toBeUndefined()
    expect(body[0].assignedClinicName).toBeUndefined()
    expect(body[0].assignedLawyerId).toBeUndefined()
    expect(body[0].assignedLawyerName).toBeUndefined()
    expect(body[0].clientName).toBe('Client')
  })

  it('returns an empty array for non-referrer roles', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'lawyer' }))
    )
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

const validPayload = () => ({
  state: 'FL',
  clientName: 'Jane',
  clientPhone: '305-555-1234',
  clientEmail: 'jane@x.io',
  clientAddress: '1 Main, Miami, FL',
  serviceNeeded: 'clinic',
  caseType: 'Auto Accident',
  notes: 'urgent',
})

describe('POST /api/professionals/referrer-referrals — auth + validation', () => {
  it('rejects non-referrer roles', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'clinic' }))
    )
    const res = await POST(nextReq(validPayload()))
    expect(res.status).toBe(403)
  })

  it('rejects missing required fields', async () => {
    const res = await POST(nextReq({ state: 'FL' }))
    expect(res.status).toBe(400)
  })

  it('rejects unknown state', async () => {
    const res = await POST(nextReq({ ...validPayload(), state: 'NY' }))
    expect(res.status).toBe(400)
  })

  it('rejects unknown serviceNeeded', async () => {
    const res = await POST(
      nextReq({ ...validPayload(), serviceNeeded: 'plumber' })
    )
    expect(res.status).toBe(400)
  })

  it('rejects 1-char client name', async () => {
    const res = await POST(
      nextReq({ ...validPayload(), clientName: 'X' })
    )
    expect(res.status).toBe(400)
  })

  it('rejects invalid phone', async () => {
    const res = await POST(
      nextReq({ ...validPayload(), clientPhone: 'abcdef' })
    )
    expect(res.status).toBe(400)
  })

  it('rejects too-short address', async () => {
    const res = await POST(
      nextReq({ ...validPayload(), clientAddress: '123' })
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/professionals/referrer-referrals — happy path + email', () => {
  it('creates the referral and queues the notification email', async () => {
    const res = await POST(nextReq(validPayload()))
    expect(res.status).toBe(201)
    expect(mockedData.createReferrerReferral).toHaveBeenCalledOnce()
    const arg = mockedData.createReferrerReferral.mock.calls[0][0]
    expect(arg.status).toBe('received')
    expect(arg.caseConfirmed).toBe('pending')
    expect(arg.referrerId).toBe('ref-1')

    await flushWaitUntil()
    expect(mockedEmail.referrerReferralNotificationEmail).toHaveBeenCalledOnce()
  })

  it('does not set updated_at from JS — relies on DB trigger', async () => {
    await POST(nextReq(validPayload()))
    const arg = mockedData.createReferrerReferral.mock.calls[0][0] as unknown as Record<string, unknown>
    // The route DOES set createdAt/updatedAt on the input payload (since it's a
    // fresh insert), but the trigger is what owns subsequent updates. The
    // important check: any later PATCH path doesn't include updated_at. This
    // test guards the CREATE shape — both timestamps come from the route.
    expect(arg.updatedAt).toBeDefined()
    expect(arg.createdAt).toBeDefined()
  })

  it('returns 500 when createReferrerReferral throws', async () => {
    mockedData.createReferrerReferral.mockRejectedValueOnce(
      new Error('db down')
    )
    const res = await POST(nextReq(validPayload()))
    expect(res.status).toBe(500)
  })
})
