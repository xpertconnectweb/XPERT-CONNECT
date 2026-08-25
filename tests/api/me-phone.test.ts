import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildRequireAuth, buildSession, buildSupabaseChainMock } from './_helpers'
import type { NextRequest } from 'next/server'
import type { User } from '@/types/professionals'

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

const sb = buildSupabaseChainMock({ data: null, error: null })
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (t: string) => sb.from(t),
    rpc: (fn: string, args?: unknown) => sb.rpc(fn, args),
  },
}))

vi.mock('@/lib/data', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data')>('@/lib/data')
  return {
    ...actual,
    isPhoneOptedOut: vi.fn(async () => false),
    recordSmsMessage: vi.fn(async () => {}),
    setPendingPhone: vi.fn(async () => {}),
    markPhoneVerified: vi.fn(async () => {}),
    setSmsAlerts: vi.fn(async () => {}),
    getUserById: vi.fn(),
  }
})

vi.mock('@/lib/sms/base', () => ({
  sendSms: vi.fn(),
  twilioConfig: vi.fn(() => ({ accountSid: 'AC', authToken: 't', messagingServiceSid: 'MG' })),
}))

vi.mock('@/lib/activity-log', () => ({ logActivity: vi.fn(async () => {}) }))

import { POST as startPost } from '@/app/api/me/phone/start/route'
import { POST as verifyPost } from '@/app/api/me/phone/verify/route'
import { POST as notifPost, GET as notifGet } from '@/app/api/me/notifications/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'
import * as base from '@/lib/sms/base'

const mockedAuth = vi.mocked(auth)
const mockData = vi.mocked(data)
const sendSms = vi.mocked(base.sendSms)

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function asUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    username: 'clinic1',
    password: 'x',
    name: 'Clinic One',
    role: 'clinic',
    email: 'a@b.com',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset()
  mockedAuth.requireAuth.mockImplementation(
    buildRequireAuth(buildSession({ id: 'u-1', role: 'clinic' }))
  )
  sendSms.mockResolvedValue({ ok: true, sid: 'SM1', to: '+13055551212' })
  mockData.isPhoneOptedOut.mockResolvedValue(false)
  sb.setRpcResult('claim_otp_send', { data: 'ok', error: null })
  sb.setRpcResult('claim_otp_attempt', { data: 'ok', error: null })
})

describe('POST /api/me/phone/start', () => {
  it('rejects an unauthenticated caller', async () => {
    mockedAuth.requireAuth.mockImplementation(buildRequireAuth(null))
    const res = await startPost(req({ phone: '3055551212', consent: true }))
    expect(res.status).toBe(401)
  })

  it('refuses without an explicit consent flag', async () => {
    const res = await startPost(req({ phone: '3055551212' }))
    expect(res.status).toBe(400)
    expect(sendSms).not.toHaveBeenCalled()
  })

  // The number that passes the repo's loose isValidPhone. It must
  // never reach Twilio, because a malformed number is not a rejected
  // send — it is a send to somebody.
  it('refuses a number that only looks like one, without spending anything', async () => {
    const res = await startPost(req({ phone: '305-555', consent: true }))
    expect(res.status).toBe(400)
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('refuses roles that can never receive a referral', async () => {
    mockedAuth.requireAuth.mockImplementation(
      buildRequireAuth(buildSession({ id: 'u-9', role: 'directory' }))
    )
    const res = await startPost(req({ phone: '3055551212', consent: true }))
    expect(res.status).toBe(403)
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('refuses a number that already replied STOP, before spending anything', async () => {
    mockData.isPhoneOptedOut.mockResolvedValue(true)
    const res = await startPost(req({ phone: '3055551212', consent: true }))

    expect(res.status).toBe(409)
    expect(await res.json()).toHaveProperty('error', expect.stringContaining('START'))
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('sends one code and stores the number as pending', async () => {
    const res = await startPost(req({ phone: '(305) 555-1212', consent: true }))

    expect(res.status).toBe(200)
    expect(sendSms).toHaveBeenCalledOnce()
    expect(sendSms.mock.calls[0][0].to).toBe('+13055551212')
    expect(mockData.setPendingPhone).toHaveBeenCalledWith(
      'u-1',
      '+13055551212',
      expect.objectContaining({ text: expect.any(String) })
    )
  })

  // The code must never round-trip to the client.
  it('never returns the code in the response body', async () => {
    const res = await startPost(req({ phone: '3055551212', consent: true }))
    expect(JSON.stringify(await res.json())).not.toMatch(/\d{6}/)
  })

  // Proves the Postgres gate is what decides, rather than a JS
  // timestamp comparison that two concurrent requests would both pass.
  it('honours the cooldown claimed in Postgres', async () => {
    sb.setRpcResult('claim_otp_send', { data: 'cooldown', error: null })
    const res = await startPost(req({ phone: '3055551212', consent: true }))

    expect(res.status).toBe(429)
    expect(sendSms).not.toHaveBeenCalled()
    expect(sb.calls).toContainEqual({
      method: 'rpc',
      args: ['claim_otp_send', expect.anything()],
    })
  })

  it.each(['locked', 'daily_cap', 'phone_cap'])('refuses on gate result %s', async (gate) => {
    sb.setRpcResult('claim_otp_send', { data: gate, error: null })
    const res = await startPost(req({ phone: '3055551212', consent: true }))
    expect(res.status).toBe(429)
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('reports a landline as a user-fixable error', async () => {
    sendSms.mockResolvedValue({
      ok: false,
      kind: 'undeliverable',
      code: 21614,
      message: 'not mobile',
    })
    const res = await startPost(req({ phone: '3055551212', consent: true }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/me/phone/verify', () => {
  it('rejects anything that is not six digits, without consulting Postgres', async () => {
    const res = await verifyPost(req({ code: '12ab' }))
    expect(res.status).toBe(400)
    expect(sb.calls.filter((c) => c.method === 'rpc')).toHaveLength(0)
  })

  it.each([
    ['bad', 400],
    ['expired', 400],
    ['none', 400],
    ['locked', 429],
  ])('maps gate result %s to %i', async (gate, status) => {
    sb.setRpcResult('claim_otp_attempt', { data: gate, error: null })
    const res = await verifyPost(req({ code: '123456' }))
    expect(res.status).toBe(status)
    expect(mockData.markPhoneVerified).not.toHaveBeenCalled()
  })

  // Proving you own a number is not the same as asking to be texted.
  // Collapsing the two would mean the verification message itself
  // produced the consent.
  it('marks the phone verified but leaves alerts OFF', async () => {
    const res = await verifyPost(req({ code: '123456' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockData.markPhoneVerified).toHaveBeenCalledWith('u-1')
    expect(mockData.setSmsAlerts).not.toHaveBeenCalled()
    expect(body.smsReferralAlerts).toBe(false)
  })
})

describe('POST /api/me/notifications', () => {
  it('refuses to switch alerts on without a verified phone', async () => {
    mockData.getUserById.mockResolvedValue(asUser({ phoneE164: '+13055551212' }))
    const res = await notifPost(req({ smsReferralAlerts: true }))

    expect(res.status).toBe(400)
    expect(mockData.setSmsAlerts).not.toHaveBeenCalled()
  })

  it('refuses to switch alerts on for a number that replied STOP', async () => {
    mockData.getUserById.mockResolvedValue(
      asUser({ phoneE164: '+13055551212', phoneVerifiedAt: '2026-08-01T00:00:00Z' })
    )
    mockData.isPhoneOptedOut.mockResolvedValue(true)

    const res = await notifPost(req({ smsReferralAlerts: true }))
    expect(res.status).toBe(409)
  })

  it('switches alerts on for a verified user and confirms by text', async () => {
    mockData.getUserById.mockResolvedValue(
      asUser({ phoneE164: '+13055551212', phoneVerifiedAt: '2026-08-01T00:00:00Z' })
    )
    const res = await notifPost(req({ smsReferralAlerts: true }))

    expect(res.status).toBe(200)
    expect(mockData.setSmsAlerts).toHaveBeenCalledWith('u-1', true)
    expect(sendSms).toHaveBeenCalledOnce()
  })

  // A revocation path with preconditions is a revocation path that
  // fails exactly when it matters.
  it('always accepts switching alerts OFF, with no preconditions', async () => {
    const res = await notifPost(req({ smsReferralAlerts: false }))

    expect(res.status).toBe(200)
    expect(mockData.setSmsAlerts).toHaveBeenCalledWith('u-1', false)
    // Not even a user lookup is needed to turn something off.
    expect(mockData.getUserById).not.toHaveBeenCalled()
  })

  it('rejects a non-boolean', async () => {
    const res = await notifPost(req({ smsReferralAlerts: 'yes' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/me/notifications', () => {
  it('returns the last four digits and never the whole number', async () => {
    mockData.getUserById.mockResolvedValue(
      asUser({ phoneE164: '+13055551212', phoneVerifiedAt: '2026-08-01T00:00:00Z' })
    )
    const res = await notifGet()
    const body = await res.json()

    expect(body.phoneLast4).toBe('1212')
    expect(JSON.stringify(body)).not.toContain('+13055551212')
    expect(body.phoneVerified).toBe(true)
  })

  it('carries the consent text the UI must display', async () => {
    mockData.getUserById.mockResolvedValue(asUser())
    const body = await (await notifGet()).json()

    expect(body.consentText).toContain('STOP')
    expect(body.consentText).toContain('Message and data rates')
  })
})
