import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { POST } from '@/app/api/revalidate/directory/route'
import * as cache from 'next/cache'

const mockedCache = vi.mocked(cache)

const ORIGINAL_ENV = process.env.DIRECTORY_REVALIDATE_SECRET

function reqWithAuth(header: string | null): NextRequest {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? header : null,
    },
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DIRECTORY_REVALIDATE_SECRET = 'test-secret-123'
})

afterEach(() => {
  if (ORIGINAL_ENV !== undefined) {
    process.env.DIRECTORY_REVALIDATE_SECRET = ORIGINAL_ENV
  } else {
    delete process.env.DIRECTORY_REVALIDATE_SECRET
  }
})

describe('POST /api/revalidate/directory', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await POST(reqWithAuth(null))
    expect(res.status).toBe(401)
    expect(mockedCache.revalidateTag).not.toHaveBeenCalled()
  })

  it('returns 401 when the bearer token is wrong', async () => {
    const res = await POST(reqWithAuth('Bearer wrong'))
    expect(res.status).toBe(401)
  })

  it('rejects the bare secret without the Bearer scheme', async () => {
    const res = await POST(reqWithAuth('test-secret-123'))
    expect(res.status).toBe(401)
  })

  /**
   * A deploy with a partial env must fail closed. An empty string
   * compared against an absent header is the classic way a guard like
   * this silently becomes an open endpoint.
   */
  it('refuses to run at all when the secret is not configured', async () => {
    delete process.env.DIRECTORY_REVALIDATE_SECRET
    const res = await POST(reqWithAuth('Bearer '))
    expect(res.status).toBe(503)
    expect(mockedCache.revalidateTag).not.toHaveBeenCalled()
  })

  it('purges the tag and both pages that render the directory', async () => {
    const res = await POST(reqWithAuth('Bearer test-secret-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revalidated).toBe(true)
    expect(typeof body.now).toBe('number')

    // The tag covers the data both readers share; the paths cover the
    // HTML that embedded the old counts.
    expect(mockedCache.revalidateTag).toHaveBeenCalledWith('lawyer-directory')
    expect(mockedCache.revalidatePath).toHaveBeenCalledWith('/')
    expect(mockedCache.revalidatePath).toHaveBeenCalledWith('/directory')
  })

  it('returns 500 when revalidation throws', async () => {
    mockedCache.revalidateTag.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const res = await POST(reqWithAuth('Bearer test-secret-123'))
    expect(res.status).toBe(500)
  })
})
