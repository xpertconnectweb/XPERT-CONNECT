import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@/types/professionals'

/**
 * Every clause of the consent gate is a separate way to text somebody
 * who did not agree to it, so each gets its own assertion.
 */

vi.mock('@/lib/sms/base', () => ({
  sendSms: vi.fn(),
  twilioConfig: vi.fn(() => ({
    accountSid: 'AC',
    authToken: 't',
    messagingServiceSid: 'MG',
  })),
}))

vi.mock('@/lib/data', () => ({
  getActiveOptOuts: vi.fn(async () => new Set<string>()),
  recordOptOut: vi.fn(async () => {}),
  recordSmsMessage: vi.fn(async () => {}),
  disableAlertsForPhone: vi.fn(async () => {}),
  markSmsSent: vi.fn(async () => {}),
  smsNotificationsEnabled: vi.fn(async () => true),
}))

import { notifyUsersOfReferral, eligibleForSms, MAX_SMS_PER_REFERRAL } from '@/lib/sms/notify'
import * as base from '@/lib/sms/base'
import * as data from '@/lib/data'

const sendSms = vi.mocked(base.sendSms)
const twilioConfig = vi.mocked(base.twilioConfig)
const mockData = vi.mocked(data)

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    username: 'clinic1',
    password: 'x',
    name: 'Clinic One',
    role: 'clinic',
    email: 'a@b.com',
    phoneE164: '+13055551212',
    phoneVerifiedAt: '2026-08-01T00:00:00.000Z',
    smsReferralAlerts: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sendSms.mockResolvedValue({ ok: true, sid: 'SM1', to: '+13055551212' })
  twilioConfig.mockReturnValue({ accountSid: 'AC', authToken: 't', messagingServiceSid: 'MG' })
  mockData.getActiveOptOuts.mockResolvedValue(new Set())
  mockData.smsNotificationsEnabled.mockResolvedValue(true)
})

describe('eligibleForSms', () => {
  it('includes a verified, opted-in user', () => {
    expect(eligibleForSms([user()])).toHaveLength(1)
  })

  it.each([
    ['no phone', { phoneE164: undefined }],
    ['phone never verified', { phoneVerifiedAt: undefined }],
    ['alerts switched off', { smsReferralAlerts: false }],
  ])('excludes a user with %s', (_label, overrides) => {
    expect(eligibleForSms([user(overrides as Partial<User>)])).toHaveLength(0)
  })

  // Two staff accounts on one front-desk mobile is one message and
  // one charge, not two of each.
  it('dedupes by NUMBER rather than by user id', () => {
    const result = eligibleForSms([
      user({ id: 'u-1' }),
      user({ id: 'u-2' }),
    ])
    expect(result).toHaveLength(1)
  })

  it('skips anyone texted within the throttle window', () => {
    const now = Date.now()
    const recent = user({ smsLastSentAt: new Date(now - 10_000).toISOString() })
    const old = user({ id: 'u-2', phoneE164: '+13055559999', smsLastSentAt: new Date(now - 120_000).toISOString() })

    expect(eligibleForSms([recent], now)).toHaveLength(0)
    expect(eligibleForSms([old], now)).toHaveLength(1)
  })
})

describe('notifyUsersOfReferral', () => {
  it('texts a verified, opted-in user once', async () => {
    await notifyUsersOfReferral([user()], { referralId: 'r-1', orgName: 'Smith Law' })

    expect(sendSms).toHaveBeenCalledTimes(1)
    expect(sendSms.mock.calls[0][0].to).toBe('+13055551212')
    expect(sendSms.mock.calls[0][0].body).toContain('Smith Law')
  })

  it('sends nothing when the user has not opted in', async () => {
    await notifyUsersOfReferral([user({ smsReferralAlerts: false })], { referralId: 'r-1' })
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('sends nothing when the phone was never verified', async () => {
    await notifyUsersOfReferral([user({ phoneVerifiedAt: undefined })], { referralId: 'r-1' })
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('sends nothing to a number that replied STOP', async () => {
    mockData.getActiveOptOuts.mockResolvedValue(new Set(['+13055551212']))
    await notifyUsersOfReferral([user()], { referralId: 'r-1' })
    expect(sendSms).not.toHaveBeenCalled()
  })

  // The mistake `referral_notifications` already made: written by the
  // admin UI, read by nothing.
  it('honours the global kill switch, and therefore reads it', async () => {
    mockData.smsNotificationsEnabled.mockResolvedValue(false)
    await notifyUsersOfReferral([user()], { referralId: 'r-1' })

    expect(mockData.smsNotificationsEnabled).toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('sends nothing when Twilio is not configured, without touching the database', async () => {
    twilioConfig.mockReturnValue(null)
    await notifyUsersOfReferral([user()], { referralId: 'r-1' })

    expect(sendSms).not.toHaveBeenCalled()
    expect(mockData.getActiveOptOuts).not.toHaveBeenCalled()
  })

  it('caps the blast radius of one referral', async () => {
    const many = Array.from({ length: MAX_SMS_PER_REFERRAL + 5 }, (_, i) =>
      user({ id: `u-${i}`, phoneE164: `+1305555${String(1000 + i)}` })
    )
    await notifyUsersOfReferral(many, { referralId: 'r-1' })
    expect(sendSms).toHaveBeenCalledTimes(MAX_SMS_PER_REFERRAL)
  })

  // Twilio 21610 means the carrier has this number on STOP. Believing
  // it is what stops us paying for messages nobody receives and
  // telling the user their alerts are on.
  it('records an opt-out when Twilio reports the number unsubscribed', async () => {
    sendSms.mockResolvedValue({
      ok: false,
      kind: 'opted_out',
      code: 21610,
      message: 'unsubscribed',
    })

    await notifyUsersOfReferral([user()], { referralId: 'r-1' })

    expect(mockData.recordOptOut).toHaveBeenCalledWith('+13055551212', 'twilio_21610')
    expect(mockData.disableAlertsForPhone).toHaveBeenCalledWith('+13055551212')
  })

  it('logs a failed send rather than losing it', async () => {
    sendSms.mockResolvedValue({ ok: false, kind: 'upstream', message: 'boom' })
    await notifyUsersOfReferral([user()], { referralId: 'r-1' })

    expect(mockData.recordSmsMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', kind: 'referral_alert' })
    )
  })

  // The contract that keeps the referral email safe: this runs inside
  // a waitUntil block, and a rejection there can take the whole
  // invocation — and the email — down with it.
  it('never rejects, whatever goes wrong underneath', async () => {
    sendSms.mockRejectedValue(new Error('network on fire'))
    await expect(
      notifyUsersOfReferral([user()], { referralId: 'r-1' })
    ).resolves.toBeUndefined()

    mockData.getActiveOptOuts.mockRejectedValue(new Error('db down'))
    await expect(
      notifyUsersOfReferral([user()], { referralId: 'r-1' })
    ).resolves.toBeUndefined()
  })

  it('does nothing at all for an empty recipient list', async () => {
    await notifyUsersOfReferral([], { referralId: 'r-1' })
    expect(sendSms).not.toHaveBeenCalled()
    expect(mockData.smsNotificationsEnabled).not.toHaveBeenCalled()
  })
})
