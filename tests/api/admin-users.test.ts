import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAdmin,
  buildSession,
  buildRequest,
  fakeClinic,
  fakeLawyer,
} from './_helpers'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  getUsers: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getClinicById: vi.fn(),
  getLawyerById: vi.fn(),
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed:${pw}`),
    compare: vi.fn(),
  },
}))

import { POST as createUserHandler } from '@/app/api/admin/users/route'
import {
  PATCH as patchUserHandler,
  DELETE as deleteUserHandler,
} from '@/app/api/admin/users/[id]/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)

const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
})

describe('POST /api/admin/users — auth', () => {
  it('returns 401 for non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await createUserHandler(buildRequest({}))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/users — validation', () => {
  it('rejects missing required fields', async () => {
    const res = await createUserHandler(buildRequest({ name: 'X' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid email', async () => {
    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'jane_doe',
        password: 'password123',
        role: 'lawyer',
        email: 'not-an-email',
      })
    )
    expect(res.status).toBe(400)
  })

  it('rejects bad username characters', async () => {
    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'has space',
        password: 'password123',
        role: 'lawyer',
        email: 'a@b.co',
      })
    )
    expect(res.status).toBe(400)
  })

  it('rejects weak password', async () => {
    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'jane',
        password: 'short',
        role: 'lawyer',
        email: 'a@b.co',
      })
    )
    expect(res.status).toBe(400)
  })

  it('rejects unknown role', async () => {
    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'jane',
        password: 'password123',
        role: 'wizard',
        email: 'a@b.co',
      })
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/users — FK validation', () => {
  it('rejects clinic role with non-existent clinicId', async () => {
    mockedData.getClinicById.mockResolvedValue(undefined)
    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'jane',
        password: 'password123',
        role: 'clinic',
        email: 'a@b.co',
        clinicId: 'c-missing',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Clinic not found/i)
  })

  it('rejects lawyer role with non-existent lawyerId', async () => {
    mockedData.getLawyerById.mockResolvedValue(undefined)
    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'jane',
        password: 'password123',
        role: 'lawyer',
        email: 'a@b.co',
        lawyerId: 'l-missing',
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/firm not found/i)
  })

  it('creates lawyer with validated lawyerId', async () => {
    mockedData.getLawyerById.mockResolvedValue(fakeLawyer({ id: 'l-001' }))
    mockedData.createUser.mockResolvedValue({
      id: 'lawyer-abc',
      username: 'jane',
      password: 'hashed:password123',
      name: 'Jane',
      role: 'lawyer',
      email: 'a@b.co',
      lawyerId: 'l-001',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'jane',
        password: 'password123',
        role: 'lawyer',
        email: 'a@b.co',
        lawyerId: 'l-001',
      })
    )
    expect(res.status).toBe(201)
    const created = mockedData.createUser.mock.calls[0][0]
    expect(created.lawyerId).toBe('l-001')
    expect(created.role).toBe('lawyer')
  })

  it('does NOT propagate password in response', async () => {
    mockedData.getLawyerById.mockResolvedValue(fakeLawyer({ id: 'l-001' }))
    mockedData.createUser.mockResolvedValue({
      id: 'lawyer-abc',
      username: 'jane',
      password: 'hashed:password123',
      name: 'Jane',
      role: 'lawyer',
      email: 'a@b.co',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const res = await createUserHandler(
      buildRequest({
        name: 'Jane',
        username: 'jane',
        password: 'password123',
        role: 'lawyer',
        email: 'a@b.co',
      })
    )
    const body = await res.json()
    expect(body).not.toHaveProperty('password')
  })
})

describe('PATCH /api/admin/users/[id]', () => {
  const PARAMS = { params: Promise.resolve({ id: 'u-target' }) }

  beforeEach(() => {
    mockedData.getUserById.mockResolvedValue({
      id: 'u-target',
      username: 'target',
      password: 'hashed:x',
      name: 'Target',
      role: 'lawyer',
      email: 'target@firm.com',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  it('returns 404 when user does not exist', async () => {
    mockedData.getUserById.mockResolvedValue(undefined)
    const res = await patchUserHandler(buildRequest({ name: 'X' }), PARAMS)
    expect(res.status).toBe(404)
  })

  it('rejects non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await patchUserHandler(buildRequest({ name: 'X' }), PARAMS)
    expect(res.status).toBe(401)
  })

  it('rejects invalid lawyerId reference', async () => {
    mockedData.getLawyerById.mockResolvedValue(undefined)
    const res = await patchUserHandler(
      buildRequest({ lawyerId: 'l-missing' }),
      PARAMS
    )
    expect(res.status).toBe(400)
  })

  it('clears lawyerId when role changes away from lawyer', async () => {
    mockedData.updateUser.mockResolvedValue({
      id: 'u-target',
      role: 'clinic',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockedData.getClinicById.mockResolvedValue(fakeClinic({ id: 'c-001' }))

    await patchUserHandler(
      buildRequest({ role: 'clinic', clinicId: 'c-001' }),
      PARAMS
    )
    const fields = mockedData.updateUser.mock.calls[0][1]
    expect(fields.lawyerId).toBeNull()
  })

  it('clears clinicId when role changes away from clinic', async () => {
    mockedData.getUserById.mockResolvedValue({
      id: 'u-target',
      role: 'clinic',
      clinicId: 'c-001',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockedData.updateUser.mockResolvedValue({
      id: 'u-target',
      role: 'lawyer',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockedData.getLawyerById.mockResolvedValue(fakeLawyer({ id: 'l-001' }))
    await patchUserHandler(
      buildRequest({ role: 'lawyer', lawyerId: 'l-001' }),
      PARAMS
    )
    const fields = mockedData.updateUser.mock.calls[0][1]
    expect(fields.clinicId).toBeNull()
  })

  it('lawyerId=null explicitly removes the link', async () => {
    mockedData.updateUser.mockResolvedValue({
      id: 'u-target',
      role: 'lawyer',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    await patchUserHandler(buildRequest({ lawyerId: '' }), PARAMS)
    const fields = mockedData.updateUser.mock.calls[0][1]
    expect(fields.lawyerId).toBeNull()
  })

  it('hashes password on PATCH (does not store plaintext)', async () => {
    mockedData.updateUser.mockResolvedValue({
      id: 'u-target',
      role: 'lawyer',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    await patchUserHandler(buildRequest({ password: 'newpassword123' }), PARAMS)
    const fields = mockedData.updateUser.mock.calls[0][1]
    expect(fields.password).toBe('hashed:newpassword123')
    expect(fields.password).not.toBe('newpassword123')
  })

  it('strips password from response', async () => {
    mockedData.updateUser.mockResolvedValue({
      id: 'u-target',
      username: 'target',
      password: 'hashed:secret',
      name: 'Target',
      role: 'lawyer',
      email: 'target@firm.com',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const res = await patchUserHandler(buildRequest({ name: 'New' }), PARAMS)
    const body = await res.json()
    expect(body).not.toHaveProperty('password')
  })
})

describe('DELETE /api/admin/users/[id]', () => {
  const PARAMS = { params: Promise.resolve({ id: 'u-target' }) }

  it('blocks self-deletion', async () => {
    const res = await deleteUserHandler(
      buildRequest({}, { method: 'DELETE' }),
      { params: Promise.resolve({ id: ADMIN.user.id }) }
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/own account/i)
  })

  it('rejects non-admin', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await deleteUserHandler(
      buildRequest({}, { method: 'DELETE' }),
      PARAMS
    )
    expect(res.status).toBe(401)
  })

  it('deletes existing user', async () => {
    mockedData.getUserById.mockResolvedValue({
      id: 'u-target',
      role: 'lawyer',
      name: 'Target',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockedData.deleteUser.mockResolvedValue(true)
    const res = await deleteUserHandler(
      buildRequest({}, { method: 'DELETE' }),
      PARAMS
    )
    expect(res.status).toBe(200)
    expect(mockedData.deleteUser).toHaveBeenCalledWith('u-target')
  })
})
