import { describe, expect, it, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'

vi.mock('@/lib/data', () => ({
  getUserByUsername: vi.fn(),
  lookupUserForSession: vi.fn(),
}))
vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMITS: { loginPerUser: { bucket: 'login:user' }, loginPerIp: { bucket: 'login:ip' } },
  claimRateLimit: vi.fn(),
  clientIp: () => '203.0.113.7',
}))

import { authOptions, passwordFingerprint } from '@/lib/auth'
import * as data from '@/lib/data'
import * as rateLimit from '@/lib/security/rate-limit'

const mockedData = vi.mocked(data)
const mockedLimit = vi.mocked(rateLimit)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authorize = (authOptions.providers[0] as any).options.authorize as (
  credentials: Record<string, string> | undefined,
  req: unknown
) => Promise<Record<string, unknown> | null>

const PASSWORD = 'correct horse battery'
const HASH = bcrypt.hashSync(PASSWORD, 4)
const USER = {
  id: 'u-1', username: 'ana', password: HASH, name: 'Ana', role: 'clinic',
  email: 'ana@x.io', clinicId: 'c-1', lawyerId: undefined, firmName: undefined, state: 'FL',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedLimit.claimRateLimit.mockResolvedValue(true)
  mockedData.getUserByUsername.mockResolvedValue({ ...USER } as never)
})

describe('credentials login', () => {
  it('signs in with the right password and carries the password fingerprint', async () => {
    const user = await authorize({ username: 'ana', password: PASSWORD }, { headers: {} })
    expect(user?.id).toBe('u-1')
    expect(user?.pwv).toBe(passwordFingerprint(HASH))
    expect(user).not.toHaveProperty('password')
  })

  it('refuses a wrong password', async () => {
    expect(await authorize({ username: 'ana', password: 'nope' }, { headers: {} })).toBeNull()
  })

  it('throttles per username and per IP, before touching the database', async () => {
    mockedLimit.claimRateLimit.mockImplementation(async (rule) => rule.bucket !== 'login:user')
    const result = await authorize({ username: 'ana', password: PASSWORD }, { headers: {} })
    expect(result).toBeNull()
    expect(mockedData.getUserByUsername).not.toHaveBeenCalled()
    const buckets = mockedLimit.claimRateLimit.mock.calls.map(([rule]) => rule.bucket)
    expect(buckets).toEqual(expect.arrayContaining(['login:user', 'login:ip']))
  })

  /**
   * The timing oracle: an unknown username used to return before bcrypt
   * ran, so response time told an attacker which usernames exist. It
   * must now pay for a comparison against the dummy hash.
   */
  it('still runs bcrypt when the user does not exist', async () => {
    mockedData.getUserByUsername.mockResolvedValue(undefined)
    const spy = vi.spyOn(bcrypt, 'compare')
    expect(await authorize({ username: 'ghost', password: 'x' }, { headers: {} })).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('refuses absurdly long input without hashing it', async () => {
    expect(await authorize({ username: 'a'.repeat(101), password: 'x' }, { headers: {} })).toBeNull()
    expect(await authorize({ username: 'ana', password: 'x'.repeat(201) }, { headers: {} })).toBeNull()
    expect(mockedLimit.claimRateLimit).not.toHaveBeenCalled()
  })
})
