import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { POST } from '@/app/api/revalidate/route'
import * as cache from 'next/cache'

const mockedCache = vi.mocked(cache)

const ORIGINAL_ENV = process.env.SANITY_REVALIDATE_SECRET

function reqWithSecret(secret: string | null): NextRequest {
  const url = new URL('http://localhost/api/revalidate')
  if (secret !== null) url.searchParams.set('secret', secret)
  return {
    url: url.toString(),
    nextUrl: url,
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SANITY_REVALIDATE_SECRET = 'test-secret-123'
})

afterEach(() => {
  if (ORIGINAL_ENV !== undefined) {
    process.env.SANITY_REVALIDATE_SECRET = ORIGINAL_ENV
  } else {
    delete process.env.SANITY_REVALIDATE_SECRET
  }
})

describe('POST /api/revalidate', () => {
  it('returns 401 when the secret is missing', async () => {
    const res = await POST(reqWithSecret(null))
    expect(res.status).toBe(401)
    expect(mockedCache.revalidatePath).not.toHaveBeenCalled()
  })

  it('returns 401 when the secret is wrong', async () => {
    const res = await POST(reqWithSecret('wrong'))
    expect(res.status).toBe(401)
  })

  it('returns 200 and revalidates / when the secret matches', async () => {
    const res = await POST(reqWithSecret('test-secret-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revalidated).toBe(true)
    expect(typeof body.now).toBe('number')
    expect(mockedCache.revalidatePath).toHaveBeenCalledWith('/')
  })

  it('returns 500 when revalidatePath throws', async () => {
    mockedCache.revalidatePath.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const res = await POST(reqWithSecret('test-secret-123'))
    expect(res.status).toBe(500)
  })
})
