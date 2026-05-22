import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAuth,
  buildSession,
  buildSupabaseChainMock,
} from './_helpers'

const sb = buildSupabaseChainMock({
  data: [
    {
      id: 'c-1',
      name: 'Partner Clinic A',
      address: '1 Main',
      lat: 25,
      lng: -80,
      phone: '305-555-0000',
      specialties: [],
      email: 'a@x.io',
      website: null,
      region: null,
      county: null,
      available: true,
    },
  ],
  error: null,
})

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/mappers', () => ({
  rowsToModels: vi.fn((rows: Record<string, unknown>[]) => rows),
}))
vi.mock('@/lib/partner-clinics', () => ({
  PARTNER_CLINIC_IDS: ['c-1', 'c-2', 'c-3'],
}))

import { GET } from '@/app/api/partners/clinics/route'
import * as auth from '@/lib/api-auth'

const mockedAuth = vi.mocked(auth)

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({
    data: [
      {
        id: 'c-1',
        name: 'Partner Clinic A',
        address: '1 Main',
        lat: 25,
        lng: -80,
        phone: '305-555-0000',
        specialties: [],
        email: 'a@x.io',
        website: null,
        region: null,
        county: null,
        available: true,
      },
    ],
    error: null,
  })
})

describe('GET /api/partners/clinics — auth gating', () => {
  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-partner non-admin (lawyer)', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'lawyer' }))
    )
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('allows admin', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'admin' }))
    )
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('allows partner', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'partner' }))
    )
    const res = await GET()
    expect(res.status).toBe(200)
  })
})

describe('GET /api/partners/clinics — filtering and shape', () => {
  beforeEach(() => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'partner' }))
    )
  })

  it('queries only the configured PARTNER_CLINIC_IDS', async () => {
    await GET()
    const inCall = sb.calls.find((c) => c.method === 'in')
    expect(inCall?.args).toEqual(['id', ['c-1', 'c-2', 'c-3']])
  })

  it('strips phone and address from the response', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body[0].phone).toBeUndefined()
    expect(body[0].address).toBeUndefined()
    expect(body[0].name).toBe('Partner Clinic A')
  })

  it('returns 500 when Supabase fails', async () => {
    sb.setResult({ data: null, error: { message: 'boom' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
