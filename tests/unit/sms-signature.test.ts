import { describe, it, expect } from 'vitest'
import twilio from 'twilio'
import { computeTwilioSignature, verifyTwilioSignature } from '@/lib/sms/signature'

/**
 * This suite cross-checks our hand-rolled signature against Twilio's
 * own `validateRequest`, which is a devDependency used ONLY here.
 *
 * The alternative — pinning a golden string produced by our own
 * implementation — would be a tautology: it would pass whether or
 * not the algorithm is right. That matters more than usual for this
 * particular function, because getting it subtly wrong (forgetting
 * the sort, wrong encoding) fails in the quiet direction: every
 * legitimate Twilio request is rejected, so every STOP is dropped
 * and we would only find out from a complaint.
 *
 * The SDK never reaches the production bundle; src/lib/sms/base.ts
 * talks to Twilio over plain fetch.
 */

const TOKEN = 'abcdefghijklmnopqrstuvwxyz123456'
const URL_ = 'https://www.844xpert.com/api/sms/inbound'
const PARAMS = {
  From: '+13055551212',
  To: '+18665550100',
  Body: 'STOP',
  MessageSid: 'SM00000000000000000000000000000001',
  AccountSid: 'AC00000000000000000000000000000001',
}

describe('computeTwilioSignature', () => {
  it('produces a signature the official Twilio library accepts', () => {
    const signature = computeTwilioSignature(URL_, PARAMS, TOKEN)
    expect(twilio.validateRequest(TOKEN, signature, URL_, PARAMS)).toBe(true)
  })

  it('agrees with the official library on a tampered body', () => {
    const signature = computeTwilioSignature(URL_, PARAMS, TOKEN)
    const tampered = { ...PARAMS, Body: 'START' }

    expect(twilio.validateRequest(TOKEN, signature, URL_, tampered)).toBe(false)
    expect(verifyTwilioSignature(URL_, tampered, TOKEN, signature)).toBe(false)
  })

  it('sorts the parameters, so key order in the object is irrelevant', () => {
    const reordered = {
      AccountSid: PARAMS.AccountSid,
      Body: PARAMS.Body,
      MessageSid: PARAMS.MessageSid,
      To: PARAMS.To,
      From: PARAMS.From,
    }
    expect(computeTwilioSignature(URL_, reordered, TOKEN)).toBe(
      computeTwilioSignature(URL_, PARAMS, TOKEN)
    )
  })

  it('changes when the URL changes by one character', () => {
    expect(computeTwilioSignature(`${URL_}/`, PARAMS, TOKEN)).not.toBe(
      computeTwilioSignature(URL_, PARAMS, TOKEN)
    )
  })

  it('changes when the token changes', () => {
    expect(computeTwilioSignature(URL_, PARAMS, `${TOKEN}x`)).not.toBe(
      computeTwilioSignature(URL_, PARAMS, TOKEN)
    )
  })
})

describe('verifyTwilioSignature', () => {
  const good = computeTwilioSignature(URL_, PARAMS, TOKEN)

  it('accepts the correct signature', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, TOKEN, good)).toBe(true)
  })

  it('rejects a wrong signature of the same length', () => {
    const wrong = (good[0] === 'X' ? 'Y' : 'X') + good.slice(1)
    expect(verifyTwilioSignature(URL_, PARAMS, TOKEN, wrong)).toBe(false)
  })

  // The classic bug: crypto.timingSafeEqual throws RangeError when
  // the buffers differ in length. Unguarded, a one-character
  // signature turns a clean 403 into an unhandled 500 — and a 500 on
  // a webhook is a retry storm rather than a rejection.
  it('returns false, not an exception, for a wrong-LENGTH signature', () => {
    expect(() => verifyTwilioSignature(URL_, PARAMS, TOKEN, 'x')).not.toThrow()
    expect(verifyTwilioSignature(URL_, PARAMS, TOKEN, 'x')).toBe(false)
    expect(verifyTwilioSignature(URL_, PARAMS, TOKEN, 'x'.repeat(500))).toBe(false)
  })

  it('rejects a missing signature', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, TOKEN, null)).toBe(false)
    expect(verifyTwilioSignature(URL_, PARAMS, TOKEN, '')).toBe(false)
  })
})
