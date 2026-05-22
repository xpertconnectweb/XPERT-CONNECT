import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  buildSupabaseChainMock,
  fakeContact,
} from './_helpers'

const sb = buildSupabaseChainMock({ data: null, error: null })

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/data', () => ({
  getContacts: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))

import { GET } from '@/app/api/admin/contacts/route'
import { DELETE } from '@/app/api/admin/contacts/[id]/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null })
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/admin/contacts', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns contacts list', async () => {
    mockedData.getContacts.mockResolvedValue([fakeContact()] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].email).toBe('jane@example.com')
  })
})

describe('DELETE /api/admin/contacts/[id]', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await DELETE(buildRequest({}) as Request, params('42'))
    expect(res.status).toBe(401)
  })

  it('deletes the contact by numeric id', async () => {
    const res = await DELETE(buildRequest({}) as Request, params('42'))
    expect(res.status).toBe(200)
    expect(sb.calls).toContainEqual({ method: 'from', args: ['contacts'] })
    const eq = sb.calls.find((c) => c.method === 'eq')
    expect(eq?.args[0]).toBe('id')
    expect(eq?.args[1]).toBe(42) // parseInt
  })

  it('returns 500 when Supabase errors', async () => {
    sb.reset({ data: null, error: { message: 'boom' } })
    const res = await DELETE(buildRequest({}) as Request, params('1'))
    expect(res.status).toBe(500)
  })
})
