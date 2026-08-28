import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { buildRequireAuth, buildSession } from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}))
vi.mock('@/lib/data', () => ({
  getReferrerReferralsByReferrer: vi.fn(),
  createReferrerReferral: vi.fn(),
}))
vi.mock('@/lib/sanitize', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sanitize')>(
    '@/lib/sanitize'
  )
  return actual
})

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/partners/referrals/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const PARTNER = buildSession({ role: 'partner', id: 'p-1', name: 'Partner Pro' })

function nextReq(body: unknown): NextRequest {
  return {
    url: 'http://localhost/api/partners/referrals',
    json: async () => body,
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAuth.mockImplementation(buildRequireAuth(PARTNER))
  mockedData.createReferrerReferral.mockImplementation(
    async (r) => r as never
  )
})

const validPayload = () => ({
  clientName: 'Jane Doe',
  clientPhone: '305-555-1234',
  clientEmail: 'jane@x.io',
  clientAddress: '1 Main, Miami, FL',
  state: 'FL',
  serviceNeeded: 'clinic',
  caseType: 'Auto Accident',
  notes: 'urgent',
})

describe('POST /api/partners/referrals — auth', () => {
  it('rejects unauthenticated', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await POST(nextReq(validPayload()))
    expect(res.status).toBe(401)
  })

  it('rejects a lawyer role', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'lawyer' }))
    )
    const res = await POST(nextReq(validPayload()))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/partners/referrals — validation', () => {
  it('rejects missing client name', async () => {
    const res = await POST(nextReq({ ...validPayload(), clientName: '' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid phone', async () => {
    const res = await POST(nextReq({ ...validPayload(), clientPhone: 'abc' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid email format', async () => {
    const res = await POST(
      nextReq({ ...validPayload(), clientEmail: 'not-an-email' })
    )
    expect(res.status).toBe(400)
  })

  it('rejects unknown state', async () => {
    const res = await POST(nextReq({ ...validPayload(), state: 'CA' }))
    expect(res.status).toBe(400)
  })

  it('rejects unknown service', async () => {
    const res = await POST(
      nextReq({ ...validPayload(), serviceNeeded: 'plumber' })
    )
    expect(res.status).toBe(400)
  })

  it('rejects missing case type', async () => {
    const res = await POST(nextReq({ ...validPayload(), caseType: '' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/partners/referrals — happy path', () => {
  it('creates a referrer-referral with status=received and returns 201', async () => {
    const res = await POST(nextReq(validPayload()))
    expect(res.status).toBe(201)
    expect(mockedData.createReferrerReferral).toHaveBeenCalledOnce()
    const arg = mockedData.createReferrerReferral.mock.calls[0][0]
    expect(arg.status).toBe('received')
    expect(arg.caseConfirmed).toBe('pending')
    expect(arg.referrerId).toBe('p-1')
    expect(arg.referrerName).toBe('Partner Pro')
    expect(arg.state).toBe('FL')
  })

  it('accepts an empty optional address/email', async () => {
    const res = await POST(
      nextReq({ ...validPayload(), clientEmail: '', clientAddress: '' })
    )
    expect(res.status).toBe(201)
  })
})
