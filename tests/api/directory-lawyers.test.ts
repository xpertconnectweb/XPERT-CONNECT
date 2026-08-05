import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAuth, buildSession } from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}))
vi.mock('@/lib/data', () => ({
  getLawyers: vi.fn(),
  getLawyersByState: vi.fn(),
  getUserById: vi.fn(),
}))

import { GET } from '@/app/api/directory/lawyers/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)

const FIRM = {
  id: 'l-001',
  name: 'Bogin Munns & Munns PA',
  address: '1000 Legion Pl #1000, Orlando, FL 32801',
  lat: 28.54,
  lng: -81.37,
  phone: '(407) 578-9696',
  email: '',
  practiceAreas: ['Business Law'],
  website: '',
  region: 'Orlando',
  county: 'Orange County',
  zipCode: '32801',
  available: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedData.getLawyers.mockResolvedValue([{ ...FIRM }])
  mockedData.getLawyersByState.mockResolvedValue([{ ...FIRM }])
  mockedData.getUserById.mockResolvedValue(undefined)
})

describe('GET /api/directory/lawyers — auth gating', () => {
  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it.each(['lawyer', 'clinic', 'referrer', 'partner'] as const)(
    'returns 403 for %s',
    async (role) => {
      mockedAuth.requireAuth.mockImplementation(
        buildRequireAuth(buildSession({ role }))
      )
      const res = await GET()
      expect(res.status).toBe(403)
    }
  )

  it.each(['directory', 'admin'] as const)('allows %s', async (role) => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role }))
    )
    const res = await GET()
    expect(res.status).toBe(200)
  })
})

describe('GET /api/directory/lawyers — contact-info contract', () => {
  beforeEach(() => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'directory' }))
    )
  })

  /**
   * This is the security decision the feature rests on, written down.
   *
   * /api/professionals/lawyers and /api/professionals/clinics both strip
   * `phone` and `address` so clinics and attorneys cannot route around
   * the platform. The directory portal exists to let its users CALL the
   * firm, so this route deliberately does not. If someone "fixes" it by
   * copying the sanitize line from the professionals route, this fails.
   */
  it('returns phone and address, unlike /api/professionals/lawyers', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body[0].phone).toBe('(407) 578-9696')
    expect(body[0].address).toBe('1000 Legion Pl #1000, Orlando, FL 32801')
  })

  it('is never cached', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('GET /api/directory/lawyers — state scoping', () => {
  beforeEach(() => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'directory' }))
    )
  })

  it('scopes to the state stored on the user', async () => {
    mockedData.getUserById.mockResolvedValue({ state: 'FL' } as never)
    await GET()
    expect(mockedData.getLawyersByState).toHaveBeenCalledWith('FL')
    expect(mockedData.getLawyers).not.toHaveBeenCalled()
  })

  it('returns every state when the user has none', async () => {
    await GET()
    expect(mockedData.getLawyers).toHaveBeenCalled()
    expect(mockedData.getLawyersByState).not.toHaveBeenCalled()
  })

  it('reads the state from the DB, not the (possibly stale) JWT', async () => {
    mockedData.getUserById.mockResolvedValue({ state: 'MN' } as never)
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'directory', state: 'FL' }))
    )
    await GET()
    expect(mockedData.getLawyersByState).toHaveBeenCalledWith('MN')
  })

  it('falls back to the session state when the DB lookup throws', async () => {
    mockedData.getUserById.mockRejectedValue(new Error('down'))
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'directory', state: 'FL' }))
    )
    await GET()
    expect(mockedData.getLawyersByState).toHaveBeenCalledWith('FL')
  })
})

describe('GET /api/directory/lawyers — practice areas', () => {
  beforeEach(() => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ role: 'directory' }))
    )
  })

  it('canonicalizes synonyms, drops CSV-header junk, keeps custom areas', async () => {
    mockedData.getLawyers.mockResolvedValue([
      { ...FIRM, practiceAreas: ['injury', 'Especialidad', 'Maritime Law', 'CRIMINAL'] },
    ])
    const res = await GET()
    const body = await res.json()
    expect(body[0].practiceAreas).toEqual([
      'Personal Injury',
      'Maritime Law',
      'Criminal Defense',
    ])
  })

  it('returns 500 when the data layer fails', async () => {
    mockedData.getLawyers.mockRejectedValue(new Error('boom'))
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
