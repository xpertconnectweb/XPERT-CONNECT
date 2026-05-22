import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildSession } from '../api/_helpers'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: { providers: [] },
}))

import { requireAdmin, requireAuth } from '@/lib/api-auth'
import * as nextAuth from 'next-auth'

const mockedNextAuth = vi.mocked(nextAuth)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireAdmin', () => {
  it('returns 401 when there is no session', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(null)
    const { session, error } = await requireAdmin()
    expect(error?.status).toBe(401)
    expect(session).toBeDefined()
  })

  it('returns 401 when the user is not admin', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(
      buildSession({ role: 'lawyer' })
    )
    const { error } = await requireAdmin()
    expect(error?.status).toBe(401)
  })

  it('returns 401 for partner role', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(
      buildSession({ role: 'partner' })
    )
    const { error } = await requireAdmin()
    expect(error?.status).toBe(401)
  })

  it('returns no error for admin', async () => {
    const adminSession = buildSession({ role: 'admin', id: 'admin-1' })
    mockedNextAuth.getServerSession.mockResolvedValue(adminSession)
    const { session, error } = await requireAdmin()
    expect(error).toBeNull()
    expect(session.user.id).toBe('admin-1')
  })
})

describe('requireAuth — no role restriction', () => {
  it('returns 401 when there is no session', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(null)
    const { error } = await requireAuth()
    expect(error?.status).toBe(401)
  })

  it('allows any signed-in role when no allowedRoles passed', async () => {
    for (const role of ['admin', 'lawyer', 'clinic', 'partner', 'referrer'] as const) {
      mockedNextAuth.getServerSession.mockResolvedValue(buildSession({ role }))
      const { error } = await requireAuth()
      expect(error).toBeNull()
    }
  })
})

describe('requireAuth — with allowedRoles', () => {
  it('returns 403 when the role is not allowed', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(
      buildSession({ role: 'clinic' })
    )
    const { error } = await requireAuth(['lawyer'])
    expect(error?.status).toBe(403)
  })

  it('returns 401 (not 403) when there is no session at all, even if allowedRoles is set', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(null)
    const { error } = await requireAuth(['admin'])
    expect(error?.status).toBe(401)
  })

  it('allows a role explicitly listed in allowedRoles', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(
      buildSession({ role: 'partner' })
    )
    const { error } = await requireAuth(['partner', 'admin'])
    expect(error).toBeNull()
  })

  it('returns 403 for admin if not in allowedRoles (no admin-bypass)', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(
      buildSession({ role: 'admin' })
    )
    const { error } = await requireAuth(['lawyer'])
    // Note: api-auth.ts does NOT short-circuit admin. This guards that contract.
    expect(error?.status).toBe(403)
  })
})

describe('requireAuth — session shape on the error path', () => {
  it('returns a Session-shaped object even when error is set, so route code can destructure safely', async () => {
    mockedNextAuth.getServerSession.mockResolvedValue(null)
    const { session, error } = await requireAuth()
    expect(error).not.toBeNull()
    expect(session).toBeDefined()
    expect(typeof session).toBe('object')
  })
})
