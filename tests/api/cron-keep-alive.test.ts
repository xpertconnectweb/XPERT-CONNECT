import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { buildSupabaseChainMock } from './_helpers'

const sb = buildSupabaseChainMock({ data: null, error: null, count: 5 })

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))

import { GET } from '@/app/api/cron/keep-alive/route'

const ORIGINAL_ENV = process.env.CRON_SECRET

function req(authHeader: string | null): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('authorization', authHeader)
  return {
    headers,
    url: 'http://localhost/api/cron/keep-alive',
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null, count: 5 })
  process.env.CRON_SECRET = 'cron-secret-xyz'
})

afterEach(() => {
  if (ORIGINAL_ENV !== undefined) {
    process.env.CRON_SECRET = ORIGINAL_ENV
  } else {
    delete process.env.CRON_SECRET
  }
})

describe('GET /api/cron/keep-alive — auth header', () => {
  /**
   * The old check compared against the template string
   * `Bearer ${process.env.CRON_SECRET}`, which with the variable unset
   * is "Bearer undefined" — a header anyone can send.
   */
  it('fails closed when CRON_SECRET is unset, even for "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req('Bearer undefined'))).status).toBe(401)
    expect((await GET(req('Bearer '))).status).toBe(401)
    expect((await GET(req(null))).status).toBe(401)
  })

  it('rejects requests missing the authorization header', async () => {
    const res = await GET(req(null))
    expect(res.status).toBe(401)
  })

  it('rejects requests with a wrong bearer token', async () => {
    const res = await GET(req('Bearer wrong-token'))
    expect(res.status).toBe(401)
  })

  it('accepts requests with the matching bearer token', async () => {
    const res = await GET(req('Bearer cron-secret-xyz'))
    expect(res.status).toBe(200)
  })
})

describe('GET /api/cron/keep-alive — supabase ping', () => {
  it('hits clinics, users, and lawyers tables', async () => {
    await GET(req('Bearer cron-secret-xyz'))
    const tables = sb.calls
      .filter((c) => c.method === 'from')
      .map((c) => c.args[0] as string)
    expect(tables).toContain('clinics')
    expect(tables).toContain('users')
    expect(tables).toContain('lawyers')
  })

  it('returns counts in the success payload', async () => {
    const res = await GET(req('Bearer cron-secret-xyz'))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.counts).toBeDefined()
    expect(body.timestamp).toBeDefined()
  })

  it('returns 500 with details when any of the three table queries errors', async () => {
    sb.reset({ data: null, error: { message: 'permission denied' }, count: 0 })
    const res = await GET(req('Bearer cron-secret-xyz'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Partial failure')
    expect(Array.isArray(body.details)).toBe(true)
  })
})
