import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import { buildRequest, buildSupabaseChainMock } from './_helpers'

const sb = buildSupabaseChainMock({ data: null, error: null })

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/data', () => ({
  getPublicDirectoryLawyerById: vi.fn(),
}))
vi.mock('@/lib/email', () => ({
  contactFormEmail: vi.fn().mockResolvedValue(undefined),
  contactConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  newsletterSubscriptionEmail: vi.fn().mockResolvedValue(undefined),
  newsletterWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  directoryInquiryEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMITS: {
    contactPerIp: { bucket: 'contact:ip' },
    contactPerEmail: { bucket: 'contact:email' },
    newsletterPerIp: { bucket: 'newsletter:ip' },
    newsletterPerEmail: { bucket: 'newsletter:email' },
    inquiryPerIp: { bucket: 'inquiry:ip' },
  },
  clientIp: () => '203.0.113.7',
  enforceRateLimits: vi.fn(),
}))

import { POST as contact } from '@/app/api/contact/route'
import { POST as newsletter } from '@/app/api/newsletter/route'
import { POST as inquiry } from '@/app/api/public/lawyers/[id]/inquiry/route'
import * as email from '@/lib/email'
import * as rateLimit from '@/lib/security/rate-limit'

const mockedEmail = vi.mocked(email)
const mockedLimit = vi.mocked(rateLimit)

const TOO_MANY = () =>
  NextResponse.json({ ok: false, error: 'Too many requests.' }, { status: 429 })

const CONTACT = { name: 'Ana', email: 'ana@example.com', phone: '(305) 555-0199', service: 'legal' }
const params = { params: Promise.resolve({ id: 'l-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null })
  mockedLimit.enforceRateLimits.mockResolvedValue(null)
})

describe('rate limits on the public forms', () => {
  it('/api/contact: 429, nothing saved, no email sent', async () => {
    mockedLimit.enforceRateLimits.mockImplementation(async () => TOO_MANY())
    const res = await contact(buildRequest(CONTACT))
    expect(res.status).toBe(429)
    expect(sb.calls.some((c) => c.method === 'insert')).toBe(false)
    expect(mockedEmail.contactConfirmationEmail).not.toHaveBeenCalled()
  })

  it('/api/contact limits per IP and per recipient address', async () => {
    await contact(buildRequest(CONTACT))
    const [checks] = mockedLimit.enforceRateLimits.mock.calls[0]
    expect(checks.map(([rule, key]) => [rule.bucket, key])).toEqual([
      ['contact:ip', '203.0.113.7'],
      ['contact:email', 'ana@example.com'],
    ])
  })

  it('/api/newsletter: 429, no email sent', async () => {
    mockedLimit.enforceRateLimits.mockImplementation(async () => TOO_MANY())
    const res = await newsletter(buildRequest({ email: 'ana@example.com' }))
    expect(res.status).toBe(429)
    expect(mockedEmail.newsletterWelcomeEmail).not.toHaveBeenCalled()
  })

  it('/api/public/lawyers/[id]/inquiry: 429 before any firm is looked up', async () => {
    mockedLimit.enforceRateLimits.mockImplementation(async () => TOO_MANY())
    const res = await inquiry(
      buildRequest({ name: 'Ana', email: 'ana@example.com', phone: '(305) 555-0199' }),
      params
    )
    expect(res.status).toBe(429)
    expect(await res.json()).not.toHaveProperty('contact')
  })

  it('does not spend the budget on invalid submissions', async () => {
    await contact(buildRequest({ ...CONTACT, email: 'not-an-email' }))
    expect(mockedLimit.enforceRateLimits).not.toHaveBeenCalled()
  })
})

describe('input hardening on the public forms', () => {
  it('refuses an email that would inject mailto parameters', async () => {
    const res = await contact(buildRequest({ ...CONTACT, email: 'a@b.co?cc=victim@x.com' }))
    expect(res.status).toBe(400)
  })

  it('answers non-string fields with 400 rather than crashing', async () => {
    const res = await contact(buildRequest({ ...CONTACT, name: { $gt: '' } }))
    expect(res.status).toBe(400)
  })

  it('caps the contact fields', async () => {
    const res = await contact(buildRequest({ ...CONTACT, name: 'x'.repeat(121) }))
    expect(res.status).toBe(400)
  })

  /**
   * The upsert used to succeed for an existing subscriber too, and both
   * emails went out again on every submit of the same address.
   */
  it('newsletter emails only a NEW subscriber, and answers the same either way', async () => {
    sb.reset({ data: [], error: null })
    const again = await newsletter(buildRequest({ email: 'ana@example.com' }))
    expect(again.status).toBe(200)
    expect(mockedEmail.newsletterWelcomeEmail).not.toHaveBeenCalled()

    sb.reset({ data: [{ id: 1 }], error: null })
    const first = await newsletter(buildRequest({ email: 'new@example.com' }))
    expect(first.status).toBe(200)
    expect(mockedEmail.newsletterWelcomeEmail).toHaveBeenCalledTimes(1)
    expect(await again.json()).toEqual(await first.json())
  })
})
