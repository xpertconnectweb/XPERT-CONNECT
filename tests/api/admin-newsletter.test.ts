import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  fakeNewsletterSubscriber,
} from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/data', () => ({
  getNewsletterSubscribers: vi.fn(),
}))

import { GET } from '@/app/api/admin/newsletter/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('GET /api/admin/newsletter', () => {
  it('requires admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns subscribers list', async () => {
    mockedData.getNewsletterSubscribers.mockResolvedValue([
      fakeNewsletterSubscriber(),
      fakeNewsletterSubscriber({ email: 'b@x.io' }),
    ] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[1].email).toBe('b@x.io')
  })

  it('returns an empty list cleanly', async () => {
    mockedData.getNewsletterSubscribers.mockResolvedValue([] as never)
    const res = await GET()
    expect(await res.json()).toEqual([])
  })
})
