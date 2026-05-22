import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  buildSupabaseChainMock,
  fakeLawyer,
} from './_helpers'

const sb = buildSupabaseChainMock({ data: null, error: null })

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/data', () => ({
  getLawyers: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { GET, POST } from '@/app/api/admin/lawyers/route'
import { PATCH, DELETE } from '@/app/api/admin/lawyers/[id]/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: [{ id: 'l-1', name: 'Firm' }], error: null })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/admin/lawyers', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns lawyers from the data layer', async () => {
    mockedData.getLawyers.mockResolvedValue([fakeLawyer()] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })
})

describe('POST /api/admin/lawyers', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await POST(
      buildRequest({ name: 'Firm', lat: 25.7, lng: -80.1 }) as Request
    )
    expect(res.status).toBe(401)
  })

  it('inserts a row with snake_case practice_areas + logs activity', async () => {
    const res = await POST(
      buildRequest({
        name: 'New Firm',
        address: '1 Main',
        lat: 25.7,
        lng: -80.1,
        practiceAreas: ['Personal Injury'],
      }) as Request
    )
    expect(res.status).toBe(200)
    expect(sb.calls).toContainEqual({ method: 'from', args: ['lawyers'] })
    const insert = sb.calls.find((c) => c.method === 'insert')
    expect(insert).toBeDefined()
    const payload = insert?.args[0] as Record<string, unknown>
    expect(payload.practice_areas).toEqual(['Personal Injury'])
    expect(payload.name).toBe('New Firm')
  })

  it('returns 500 when Supabase errors out', async () => {
    sb.reset({ data: null, error: { message: 'duplicate' } })
    const res = await POST(
      buildRequest({ name: 'X', lat: 1, lng: 1 }) as Request
    )
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/admin/lawyers/[id]', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await PATCH(
      buildRequest({ name: 'Renamed' }) as Request,
      params('l-1')
    )
    expect(res.status).toBe(401)
  })

  it('maps practiceAreas → practice_areas in the update', async () => {
    const res = await PATCH(
      buildRequest({ practiceAreas: ['Auto'] }) as Request,
      params('l-1')
    )
    expect(res.status).toBe(200)
    const update = sb.calls.find((c) => c.method === 'update')
    expect(update).toBeDefined()
    const payload = update?.args[0] as Record<string, unknown>
    expect(payload.practice_areas).toEqual(['Auto'])
    expect(payload.practiceAreas).toBeUndefined()
  })

  it('maps zipCode → zip_code in the update', async () => {
    const res = await PATCH(
      buildRequest({ zipCode: '33101' }) as Request,
      params('l-1')
    )
    expect(res.status).toBe(200)
    const update = sb.calls.find((c) => c.method === 'update')
    const payload = update?.args[0] as Record<string, unknown>
    expect(payload.zip_code).toBe('33101')
  })
})

describe('DELETE /api/admin/lawyers/[id]', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await DELETE(buildRequest({}) as Request, params('l-1'))
    expect(res.status).toBe(401)
  })

  it('deletes the row', async () => {
    sb.reset({ data: null, error: null })
    const res = await DELETE(buildRequest({}) as Request, params('l-1'))
    expect(res.status).toBe(200)
    expect(sb.calls.some((c) => c.method === 'delete')).toBe(true)
  })
})
