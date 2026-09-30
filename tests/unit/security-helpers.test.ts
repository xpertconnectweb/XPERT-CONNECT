import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) } }))

import { safeEqual, hasBearerSecret } from '@/lib/security/secrets'
import { safeHttpUrl, normalizeWebsite, jsonForScript } from '@/lib/security/url'
import { readJsonBody, str } from '@/lib/security/http'
import {
  RATE_LIMITS,
  claimRateLimit,
  clientIp,
  enforceRateLimits,
  hashKey,
} from '@/lib/security/rate-limit'
import { isPublicEmail, checkProviderFields, checkReferralTextFields } from '@/lib/validation'

beforeEach(() => {
  rpc.mockReset()
})

describe('safeEqual / hasBearerSecret', () => {
  const ORIGINAL = process.env.TEST_SECRET
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.TEST_SECRET
    else process.env.TEST_SECRET = ORIGINAL
  })

  it('compares by value, including different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })

  it('accepts only the exact bearer header', () => {
    process.env.TEST_SECRET = 's3cret'
    const h = (v: string) => new Headers({ authorization: v })
    expect(hasBearerSecret(h('Bearer s3cret'), 'TEST_SECRET')).toBe(true)
    expect(hasBearerSecret(h('Bearer wrong'), 'TEST_SECRET')).toBe(false)
    expect(hasBearerSecret(h('s3cret'), 'TEST_SECRET')).toBe(false)
  })

  it('fails closed when the secret is unset — "Bearer undefined" included', () => {
    delete process.env.TEST_SECRET
    expect(hasBearerSecret(new Headers({ authorization: 'Bearer undefined' }), 'TEST_SECRET')).toBe(false)
    expect(hasBearerSecret(new Headers({ authorization: 'Bearer ' }), 'TEST_SECRET')).toBe(false)
  })
})

describe('safeHttpUrl / normalizeWebsite', () => {
  it('keeps http(s) and drops every other scheme', () => {
    expect(safeHttpUrl('https://firm.example/x')).toBe('https://firm.example/x')
    expect(safeHttpUrl('http://firm.example')).toBe('http://firm.example/')
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('data:text/html,<script>')).toBeUndefined()
    expect(safeHttpUrl('firm.example')).toBeUndefined()
    expect(safeHttpUrl(undefined)).toBeUndefined()
  })

  it('assumes https for a bare domain, clears empty, rejects other schemes', () => {
    expect(normalizeWebsite('czaialaw.com')).toBe('https://czaialaw.com/')
    expect(normalizeWebsite('')).toBe('')
    expect(normalizeWebsite(null)).toBe('')
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull()
    expect(normalizeWebsite(42)).toBeNull()
  })
})

describe('jsonForScript', () => {
  it('cannot close the script tag it is embedded in', () => {
    const out = jsonForScript({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})

describe('readJsonBody / str', () => {
  const request = (json: () => Promise<unknown>, length?: number) =>
    ({
      headers: new Headers(length ? { 'content-length': String(length) } : {}),
      json,
    }) as unknown as Request

  it('turns malformed JSON into a 400 instead of a thrown 500', async () => {
    const r = await readJsonBody(request(async () => { throw new SyntaxError('x') }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(400)
  })

  it('rejects arrays and null as a body', async () => {
    for (const value of [[1, 2], null, 'text']) {
      const r = await readJsonBody(request(async () => value))
      expect(r.ok).toBe(false)
    }
  })

  it('refuses an oversized body before parsing it', async () => {
    const json = vi.fn()
    const r = await readJsonBody(request(json, 10_000_000))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(413)
    expect(json).not.toHaveBeenCalled()
  })

  it('str() never throws on a non-string', () => {
    expect(str('  a  ')).toBe('a')
    expect(str(5)).toBe('')
    expect(str({ toString: () => 'x' })).toBe('')
  })
})

describe('rate limiting', () => {
  it('hashes keys, so the table never stores an IP or an email', () => {
    const key = hashKey('203.0.113.7')
    expect(key).not.toContain('203')
    expect(key).toHaveLength(32)
    expect(hashKey('A@Example.com')).toBe(hashKey(' a@example.com '))
  })

  it('reads the client IP from the Vercel headers', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1')
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }))).toBe('198.51.100.2')
    expect(clientIp({ 'x-forwarded-for': '198.51.100.3' })).toBe('198.51.100.3')
    expect(clientIp(undefined)).toBe('unknown')
  })

  it('passes the rule to the RPC and honours its answer', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await claimRateLimit(RATE_LIMITS.contactPerIp, '1.2.3.4')).toBe(false)
    expect(rpc).toHaveBeenCalledWith('claim_rate_limit', {
      p_bucket: 'contact:ip',
      p_key: hashKey('1.2.3.4'),
      p_limit: 5,
      p_window_seconds: 3600,
    })
  })

  // Deliberate: a DB blip must not take the forms or the login down, and
  // it lets the code deploy before the migration that creates the RPC.
  it('fails open when the RPC errors or is missing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect(await claimRateLimit(RATE_LIMITS.contactPerIp, 'k')).toBe(true)
    rpc.mockRejectedValue(new Error('network'))
    expect(await claimRateLimit(RATE_LIMITS.contactPerIp, 'k')).toBe(true)
  })

  it('answers 429 with Retry-After when any rule is exceeded', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    rpc.mockResolvedValueOnce({ data: false, error: null })
    const res = await enforceRateLimits([
      [RATE_LIMITS.contactPerIp, 'ip'],
      [RATE_LIMITS.contactPerEmail, 'a@b.co'],
    ])
    expect(res?.status).toBe(429)
    expect(res?.headers.get('Retry-After')).toBe(String(24 * 60 * 60))
  })

  it('lets the request through when every rule allows it', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await enforceRateLimits([[RATE_LIMITS.inquiryPerIp, 'ip']])).toBeNull()
  })
})

describe('validation added for public input', () => {
  it('isPublicEmail refuses addresses that smuggle mailto parameters', () => {
    expect(isPublicEmail('ana@example.com')).toBe(true)
    expect(isPublicEmail('ana+tag@mail.example.co')).toBe(true)
    expect(isPublicEmail('a@b.c?cc=victim@x.com')).toBe(false)
    expect(isPublicEmail('a@b.com&bcc=x@y.com')).toBe(false)
    expect(isPublicEmail('a b@c.com')).toBe(false)
    expect(isPublicEmail(`${'a'.repeat(250)}@b.com`)).toBe(false)
  })

  it('checkProviderFields types and caps admin provider payloads', () => {
    expect(checkProviderFields({ name: 'Firm' }, { requireName: true })).toBeNull()
    expect(checkProviderFields({}, { requireName: true })).toMatch(/name/)
    expect(checkProviderFields({ name: 'x'.repeat(201) })).toMatch(/too long/)
    expect(checkProviderFields({ phone: 5 })).toMatch(/string/)
    expect(checkProviderFields({ email: 'nope' })).toMatch(/email/)
    expect(checkProviderFields({ region: null })).toBeNull()
  })

  it('checkReferralTextFields caps partner/referrer client fields', () => {
    expect(checkReferralTextFields({ clientName: 'Ana', notes: 'ok' })).toBeNull()
    expect(checkReferralTextFields({ notes: 'x'.repeat(2001) })).toMatch(/notes/)
    expect(checkReferralTextFields({ clientEmail: 'bad' })).toMatch(/email/i)
    expect(checkReferralTextFields({ clientName: ['a'] })).toMatch(/string/)
  })
})
