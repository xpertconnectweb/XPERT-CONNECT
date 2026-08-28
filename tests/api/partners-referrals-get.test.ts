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

import { GET } from '@/app/api/partners/referrals/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)

const PARTNER = buildSession({ role: 'partner', id: 'p-1' })

function nextReq(url: string): NextRequest {
  return { url } as unknown as NextRequest
}

function fakeReferrerReferral(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rref-1',
    referrerId: 'p-1',
    referrerName: 'Partner',
    state: 'FL',
    clientName: 'Client',
    clientPhone: '305-555-0000',
    clientEmail: '',
    clientAddress: '1 Main',
    serviceNeeded: 'clinic',
    caseType: 'Auto',
    notes: '',
    status: 'received',
    caseConfirmed: 'pending',
    adminNotes: 'INTERNAL — should not leak',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAuth.mockImplementation(buildRequireAuth(PARTNER))
})

describe('GET /api/partners/referrals — auth', () => {
  it('rejects unauthenticated', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await GET(nextReq('http://localhost/api/partners/referrals'))
    expect(res.status).toBe(401)
  })

  it('rejects a lawyer role', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'lawyer' }))
    )
    const res = await GET(nextReq('http://localhost/api/partners/referrals'))
    expect(res.status).toBe(403)
  })
})

describe('GET /api/partners/referrals — filtering + sanitization', () => {
  it('returns referrals scoped to the partner', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([
      fakeReferrerReferral(),
    ] as never)
    const res = await GET(nextReq('http://localhost/api/partners/referrals'))
    expect(res.status).toBe(200)
    expect(mockedData.getReferrerReferralsByReferrer).toHaveBeenCalledWith('p-1')
  })

  it('strips adminNotes from the response', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([
      fakeReferrerReferral(),
    ] as never)
    const res = await GET(nextReq('http://localhost/api/partners/referrals'))
    const body = await res.json()
    expect(body[0].adminNotes).toBeUndefined()
    expect(body[0].clientName).toBe('Client')
  })

  it('filters by status query param', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([
      fakeReferrerReferral({ id: 'a', status: 'received' }),
      fakeReferrerReferral({ id: 'b', status: 'scheduled' }),
      fakeReferrerReferral({ id: 'c', status: 'final_mmi' }),
    ] as never)
    const res = await GET(
      nextReq('http://localhost/api/partners/referrals?status=scheduled')
    )
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('b')
  })

  it('filters by state query param', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([
      fakeReferrerReferral({ id: 'fl', state: 'FL' }),
      fakeReferrerReferral({ id: 'mn', state: 'MN' }),
    ] as never)
    const res = await GET(
      nextReq('http://localhost/api/partners/referrals?state=MN')
    )
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('mn')
  })

  it('combines status + state filters', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([
      fakeReferrerReferral({ id: 'a', state: 'FL', status: 'received' }),
      fakeReferrerReferral({ id: 'b', state: 'MN', status: 'received' }),
      fakeReferrerReferral({ id: 'c', state: 'MN', status: 'scheduled' }),
    ] as never)
    const res = await GET(
      nextReq('http://localhost/api/partners/referrals?state=MN&status=received')
    )
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('b')
  })
})
