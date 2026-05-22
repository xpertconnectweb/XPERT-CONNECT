import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data', () => ({
  getUserByUsername: vi.fn(),
  getUserById: vi.fn(),
}))

import { authOptions } from '@/lib/auth'
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

describe('jwt callback — periodic refresh from DB', () => {
  it('refreshes role + entity ids when the cached token is older than 5 minutes', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.getUserById.mockResolvedValue({
      id: 'u-1',
      role: 'clinic',
      clinicId: 'c-99',
      lawyerId: null,
      firmName: null,
      state: 'MN',
      name: 'Renamed',
      email: 'renamed@x.io',
    } as never)
    const stale = token({ refreshedAt: Date.now() - 6 * 60 * 1000, role: 'lawyer' })
    const result = await jwtCallback({ token: stale, user: undefined } as never)
    expect(result.role).toBe('clinic')
    expect(result.clinicId).toBe('c-99')
    expect(result.lawyerId).toBeNull()
    expect(result.name).toBe('Renamed')
  })

  it('clears stale lawyer_id when the DB shows it is now null (lawyer → clinic transition)', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.getUserById.mockResolvedValue({
      id: 'u-1',
      role: 'clinic',
      clinicId: 'c-1',
      lawyerId: null, // cleared in DB
      firmName: null,
      state: 'FL',
      name: 'User',
      email: 'u@x.io',
    } as never)
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
    expect(mockedData.getUserById).not.toHaveBeenCalled()
  })

  it('swallows DB errors silently instead of breaking the session', async () => {
    if (!jwtCallback) throw new Error('jwt callback not defined')
    mockedData.getUserById.mockRejectedValue(new Error('db down'))
    const staleAt = Date.now() - 6 * 60 * 1000
    const stale = token({ refreshedAt: staleAt })
    const result = (await jwtCallback({
      token: stale,
      user: undefined,
    } as never)) as unknown as { refreshedAt: number }
    expect(result).toBeDefined()
    // The refreshedAt timestamp is still bumped so we don't retry on every request.
    expect(result.refreshedAt).toBeGreaterThan(staleAt)
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
