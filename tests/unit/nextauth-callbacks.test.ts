import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data', () => ({
  getUserByUsername: vi.fn(),
  getUserById: vi.fn(),
  lookupUserForSession: vi.fn(),
}))
vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMITS: { loginPerUser: {}, loginPerIp: {} },
  claimRateLimit: vi.fn().mockResolvedValue(true),
  clientIp: () => '203.0.113.7',
}))

import { authOptions, passwordFingerprint } from '@/lib/auth'
import * as data from '@/lib/data'

const mockedData = vi.mocked(data)

const jwtCallback = authOptions.callbacks?.jwt
const sessionCallback = authOptions.callbacks?.session

beforeEach(() => {
  vi.clearAllMocks()
})

function token(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    role: 'lawyer',
    lawyerId: 'l-1',
    clinicId: null,
    firmName: 'Firm',
    username: 'user',
    state: 'FL',
    name: 'User',
    email: 'u@x.io',
    refreshedAt: Date.now(),
    ...overrides,
  } as never
}

describe('jwt callback — initial sign-in', () => {
  it('writes the user fields onto the token on first call (when user is present)', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    const user = {
      id: 'u-2',
      name: 'Jane',
      email: 'jane@x.io',
      role: 'clinic',
      clinicId: 'c-1',
      lawyerId: null,
      firmName: null,
      username: 'jane',
      state: 'MN',
    }
    const result = await jwtCallback({
      token: {} as never,
      user: user as never,
      account: null,
    } as never)
    expect(result.role).toBe('clinic')
    expect(result.clinicId).toBe('c-1')
    expect(result.lawyerId).toBeNull()
    expect(result.refreshedAt).toBeDefined()
  })
})

const STORED_HASH = '$2b$10$pOWP2E/zXytnPtaKk3VRw.g9M57wf7TJff8C1l58Wy/8uJ3YJdJRS'

function found(overrides: Record<string, unknown> = {}) {
  return {
    status: 'found',
    user: {
      id: 'u-1',
      role: 'clinic',
      clinicId: 'c-99',
      lawyerId: null,
      firmName: null,
      state: 'MN',
      name: 'Renamed',
      email: 'renamed@x.io',
      password: STORED_HASH,
      ...overrides,
    },
  } as never
}

describe('jwt callback — periodic refresh from DB', () => {
  it('refreshes role + entity ids when the cached token is older than 5 minutes', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockResolvedValue(found())
    const stale = token({ refreshedAt: Date.now() - 6 * 60 * 1000, role: 'lawyer' })
    const result = await jwtCallback({ token: stale, user: undefined } as never)
    expect(result.role).toBe('clinic')
    expect(result.clinicId).toBe('c-99')
    expect(result.lawyerId).toBeNull()
    expect(result.name).toBe('Renamed')
    expect(result.revoked).toBeFalsy()
  })

  it('clears stale lawyer_id when the DB shows it is now null (lawyer → clinic transition)', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockResolvedValue(found({ clinicId: 'c-1', lawyerId: null }))
    const stale = token({
      refreshedAt: Date.now() - 6 * 60 * 1000,
      role: 'lawyer',
      lawyerId: 'l-1',
      clinicId: null,
    })
    const result = await jwtCallback({ token: stale, user: undefined } as never)
    expect(result.lawyerId).toBeNull()
    expect(result.clinicId).toBe('c-1')
  })

  it('does not refresh when the token is fresh (< 5 minutes old)', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    const fresh = token({ refreshedAt: Date.now() })
    await jwtCallback({ token: fresh, user: undefined } as never)
    expect(mockedData.lookupUserForSession).not.toHaveBeenCalled()
  })

  /**
   * Changed on purpose (2026-09-30). The refresh used to swallow the error
   * AND bump `refreshedAt`, so a blip postponed the next check by five
   * minutes. Now the token is kept untouched and retried on the next
   * request — and, crucially, NOT revoked: an outage must not log
   * everyone out.
   */
  it('keeps the session through a DB error, and retries instead of waiting 5 minutes', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockResolvedValue({ status: 'error' } as never)
    const staleAt = Date.now() - 6 * 60 * 1000
    const stale = token({ refreshedAt: staleAt })
    const result = await jwtCallback({ token: stale, user: undefined } as never)
    expect(result.revoked).toBeFalsy()
    expect(result.refreshedAt).toBe(staleAt)
  })

  it('also survives the lookup throwing', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockRejectedValue(new Error('db down'))
    const result = await jwtCallback({
      token: token({ refreshedAt: Date.now() - 6 * 60 * 1000 }),
      user: undefined,
    } as never)
    expect(result.revoked).toBeFalsy()
  })
})

describe('jwt callback — revocation', () => {
  it('revokes the session of a deleted user', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockResolvedValue({ status: 'missing' } as never)
    const result = await jwtCallback({
      token: token({ refreshedAt: Date.now() - 6 * 60 * 1000 }),
      user: undefined,
    } as never)
    expect(result.revoked).toBe(true)
  })

  it('revokes a session issued under a password that has since changed', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockResolvedValue(found({ password: '$2b$10$a-different-hash' }))
    const result = await jwtCallback({
      token: token({
        refreshedAt: Date.now() - 6 * 60 * 1000,
        pwv: passwordFingerprint(STORED_HASH),
      }),
      user: undefined,
    } as never)
    expect(result.revoked).toBe(true)
  })

  it('keeps a session whose password is unchanged', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockResolvedValue(found())
    const result = await jwtCallback({
      token: token({
        refreshedAt: Date.now() - 6 * 60 * 1000,
        pwv: passwordFingerprint(STORED_HASH),
      }),
      user: undefined,
    } as never)
    expect(result.revoked).toBeFalsy()
  })

  it('adopts a token issued before fingerprints existed instead of revoking it', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.lookupUserForSession.mockResolvedValue(found())
    const result = await jwtCallback({
      token: token({ refreshedAt: Date.now() - 6 * 60 * 1000 }),
      user: undefined,
    } as never)
    expect(result.revoked).toBeFalsy()
    expect(result.pwv).toBe(passwordFingerprint(STORED_HASH))
  })

  it('never un-revokes, and stops querying the DB for a revoked token', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    const result = await jwtCallback({
      token: token({ revoked: true, refreshedAt: 0 }),
      user: undefined,
    } as never)
    expect(result.revoked).toBe(true)
    expect(mockedData.lookupUserForSession).not.toHaveBeenCalled()
  })

  it('exposes the revoked flag on the session so requireAuth can refuse it', async () => {
    if (!sessionCallback) throw new Error('session callback not defined')
    const result = (await sessionCallback({
      session: { user: { name: 'X', email: 'x@x.io' } } as never,
      token: token({ revoked: true }) as never,
    } as never)) as unknown as { user: { revoked?: boolean } }
    expect(result.user.revoked).toBe(true)
  })
})

interface SessionUserShape {
  user: {
    id?: string
    role?: string
    firmName?: string | null
    clinicId?: string | null
    lawyerId?: string | null
  }
}

describe('session callback', () => {
  it('mirrors token fields onto session.user', async () => {
    if (!sessionCallback) throw new Error('session callback not defined')
    const result = (await sessionCallback({
      session: { user: { name: 'X', email: 'x@x.io' } } as never,
      token: token({ id: 'u-1', role: 'admin', firmName: 'Acme' }) as never,
    } as never)) as unknown as SessionUserShape
    expect(result.user.id).toBe('u-1')
    expect(result.user.role).toBe('admin')
    expect(result.user.firmName).toBe('Acme')
  })

  it('mirrors null entity ids so consumers see the cleared state', async () => {
    if (!sessionCallback) throw new Error('session callback not defined')
    const result = (await sessionCallback({
      session: { user: { name: 'X', email: 'x@x.io' } } as never,
      token: token({ role: 'clinic', clinicId: 'c-1', lawyerId: null }) as never,
    } as never)) as unknown as SessionUserShape
    expect(result.user.clinicId).toBe('c-1')
    expect(result.user.lawyerId).toBeNull()
  })
})
