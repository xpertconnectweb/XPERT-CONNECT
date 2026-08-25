import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/data', () => ({
  recordOptOut: vi.fn(async () => {}),
  recordOptIn: vi.fn(async () => {}),
  disableAlertsForPhone: vi.fn(async () => {}),
}))

import { POST } from '@/app/api/sms/inbound/route'
import { computeTwilioSignature } from '@/lib/sms/signature'
import * as data from '@/lib/data'
import type { NextRequest } from 'next/server'

const mockData = vi.mocked(data)

const WEBHOOK_URL = 'https://test.local/api/sms/inbound'
const AUTH_TOKEN = 'test-twilio-auth-token'
const FROM = '+13055551212'

function buildRequest(
  params: Record<string, string>,
  opts: { signature?: string | null; sign?: boolean } = {}
): NextRequest {
  const form = new FormData()
  for (const [key, value] of Object.entries(params)) form.append(key, value)

  const headers = new Headers()
  const signature =
    opts.signature !== undefined
      ? opts.signature
      : opts.sign === false
        ? null
        : computeTwilioSignature(WEBHOOK_URL, params, AUTH_TOKEN)

  if (signature !== null) headers.set('x-twilio-signature', signature)

  return {
    headers,
    formData: async () => form,
  } as unknown as NextRequest
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
  process.env.TWILIO_WEBHOOK_URL = WEBHOOK_URL
})

afterEach(() => {
  process.env.TWILIO_AUTH_TOKEN = ORIGINAL_ENV.TWILIO_AUTH_TOKEN
  process.env.TWILIO_WEBHOOK_URL = ORIGINAL_ENV.TWILIO_WEBHOOK_URL
})

describe('POST /api/sms/inbound — signature', () => {
  it('rejects a request with no signature, and writes nothing', async () => {
    const res = await POST(buildRequest({ From: FROM, Body: 'STOP' }, { sign: false }))

    expect(res.status).toBe(403)
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
  })

  it('rejects a wrong signature, and writes nothing', async () => {
    const res = await POST(
      buildRequest({ From: FROM, Body: 'STOP' }, { signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=' })
    )

    expect(res.status).toBe(403)
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
  })

  // A one-character signature makes crypto.timingSafeEqual throw a
  // RangeError. Unguarded that is a 500, and a 500 on a webhook is a
  // Twilio retry storm rather than a rejection.
  it('rejects a wrong-length signature with 403, not 500', async () => {
    const res = await POST(buildRequest({ From: FROM, Body: 'STOP' }, { signature: 'x' }))
    expect(res.status).toBe(403)
  })

  it('rejects a signature computed over tampered params', async () => {
    const signature = computeTwilioSignature(WEBHOOK_URL, { From: FROM, Body: 'HELP' }, AUTH_TOKEN)
    const res = await POST(buildRequest({ From: FROM, Body: 'STOP' }, { signature }))

    expect(res.status).toBe(403)
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
  })

  // The inverse of the flaw in the keep-alive route, where an unset
  // CRON_SECRET makes a literal "Bearer undefined" header pass.
  it('fails closed with 500 when the auth token is unset — never 200', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const res = await POST(buildRequest({ From: FROM, Body: 'STOP' }))

    expect(res.status).toBe(500)
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
  })

  it('fails closed when the webhook URL is unset', async () => {
    delete process.env.TWILIO_WEBHOOK_URL
    const res = await POST(buildRequest({ From: FROM, Body: 'STOP' }))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/sms/inbound — keywords', () => {
  it.each(['STOP', 'stop', '  Stop  ', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])(
    'treats %s as an opt-out',
    async (keyword) => {
      const res = await POST(buildRequest({ From: FROM, Body: keyword }))

      expect(res.status).toBe(200)
      expect(mockData.recordOptOut).toHaveBeenCalledWith(FROM, 'stop_keyword', keyword.trim().toLowerCase())
      expect(mockData.disableAlertsForPhone).toHaveBeenCalledWith(FROM)
    }
  )

  // Both writes, and they are not redundant: the opt-out row is the
  // proof and outlives the account, the user flag stops the settings
  // page claiming alerts are still on.
  it('records the opt-out AND mirrors it onto the accounts', async () => {
    await POST(buildRequest({ From: FROM, Body: 'STOP' }))
    expect(mockData.recordOptOut).toHaveBeenCalledOnce()
    expect(mockData.disableAlertsForPhone).toHaveBeenCalledOnce()
  })

  it.each(['START', 'unstop', 'YES'])('treats %s as resuming the number', async (keyword) => {
    const res = await POST(buildRequest({ From: FROM, Body: keyword }))

    expect(res.status).toBe(200)
    expect(mockData.recordOptIn).toHaveBeenCalledWith(FROM)
  })

  // Texting START says "you may contact me again", not "resume the
  // alerts I turned off". Re-consent is an act in the product.
  it('does NOT re-enable alerts on START', async () => {
    await POST(buildRequest({ From: FROM, Body: 'START' }))
    expect(mockData.disableAlertsForPhone).not.toHaveBeenCalled()
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
  })

  it.each(['HELP', 'info'])('acknowledges %s without writing anything', async (keyword) => {
    const res = await POST(buildRequest({ From: FROM, Body: keyword }))

    expect(res.status).toBe(200)
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
    expect(mockData.recordOptIn).not.toHaveBeenCalled()
  })

  it('acknowledges a human reply so Twilio does not retry', async () => {
    const res = await POST(buildRequest({ From: FROM, Body: 'thanks, got it' }))

    expect(res.status).toBe(200)
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
  })

  // The case a users-table-only design drops on the floor: the person
  // STOPs after their account was deleted, or the number was
  // recycled. There is no user to update, and the opt-out must
  // survive anyway.
  it('records a STOP from a number belonging to no account', async () => {
    const res = await POST(buildRequest({ From: '+14075550199', Body: 'STOP' }))

    expect(res.status).toBe(200)
    expect(mockData.recordOptOut).toHaveBeenCalledWith('+14075550199', 'stop_keyword', 'stop')
  })

  it('ignores an unparseable From without erroring', async () => {
    const res = await POST(buildRequest({ From: 'not-a-number', Body: 'STOP' }))

    expect(res.status).toBe(200)
    expect(mockData.recordOptOut).not.toHaveBeenCalled()
  })
})

describe('POST /api/sms/inbound — response shape', () => {
  // Twilio's Messaging Service sends the STOP/HELP replies itself.
  // Answering with empty TwiML is what stops the user being texted
  // twice.
  it('answers with empty TwiML so Twilio owns the reply', async () => {
    const res = await POST(buildRequest({ From: FROM, Body: 'STOP' }))

    expect(res.headers.get('Content-Type')).toContain('text/xml')
    expect(await res.text()).toBe('<Response/>')
  })
})
