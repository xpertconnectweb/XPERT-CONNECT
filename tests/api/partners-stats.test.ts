import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAuth, buildSession } from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}))
vi.mock('@/lib/data', () => ({
  getReferrerReferralsByReferrer: vi.fn(),
}))

import { GET } from '@/app/api/partners/stats/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const PARTNER = buildSession({ role: 'partner', id: 'p-1' })

function fakeRR(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    referrerId: 'p-1',
    referrerName: 'Partner',
    state: 'FL',
    clientName: 'C',
    clientPhone: '305-555-0000',
    clientEmail: '',
    clientAddress: '',
    serviceNeeded: 'clinic',
    caseType: 'Auto',
    notes: '',
    status: 'pending',
    caseConfirmed: 'pending',
    adminNotes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAuth.mockImplementation(buildRequireAuth(PARTNER))
})

describe('GET /api/partners/stats — auth', () => {
  it('rejects unauthenticated', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('rejects clinic role', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'clinic' }))
    )
    const res = await GET()
    expect(res.status).toBe(403)
  })
})

describe('GET /api/partners/stats — aggregation', () => {
  it('computes status counts and statusBreakdown', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([
      fakeRR({ id: '1', status: 'pending' }),
      fakeRR({ id: '2', status: 'assigned' }),
      fakeRR({ id: '3', status: 'in_process' }),
      fakeRR({ id: '4', status: 'completed', caseConfirmed: 'confirmed' }),
      fakeRR({ id: '5', status: 'completed', caseConfirmed: 'confirmed' }),
    ] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(5)
    expect(body.pending).toBe(1)
    expect(body.active).toBe(2) // assigned + in_process
    expect(body.completed).toBe(2)
    expect(body.confirmed).toBe(2)
    expect(body.statusBreakdown).toEqual([
      { name: 'Pending', value: 1 },
      { name: 'Assigned', value: 1 },
      { name: 'In Process', value: 1 },
      { name: 'Completed', value: 2 },
    ])
  })

  it('returns recentReferrals capped at 5', async () => {
    const rows = Array.from({ length: 8 }).map((_, i) =>
      fakeRR({ id: `r-${i}` })
    )
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue(rows as never)
    const res = await GET()
    const body = await res.json()
    expect(body.recentReferrals).toHaveLength(5)
    expect(body.recentReferrals[0].id).toBe('r-0')
  })

  it('handles an empty list cleanly', async () => {
    mockedData.getReferrerReferralsByReferrer.mockResolvedValue([] as never)
    const res = await GET()
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.statusBreakdown.every((s: { value: number }) => s.value === 0)).toBe(true)
  })
})
