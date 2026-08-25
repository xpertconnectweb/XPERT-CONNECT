import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildRequireAuth,
  buildSession,
  buildRequest,
  fakeClinic,
  fakeLawyer,
  fakeReferral,
  flushWaitUntil,
} from './_helpers'
import type { User } from '@/types/professionals'

/**
 * The referral route with SMS wired in.
 *
 * The assertion that matters most is the negative one: whatever the
 * texting does, the email must still go out and the request must
 * still return 201. SMS is an addition to a working notification
 * path, and it may never become a way to break it.
 */

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  getReferralsByLawyerEntity: vi.fn(),
  getReferralsByClinic: vi.fn(),
  createReferral: vi.fn(),
  getClinicById: vi.fn(),
  getLawyerById: vi.fn(),
  getUsersByClinicId: vi.fn(),
  getLawyerUsersByEntityId: vi.fn(),
  getUserById: vi.fn(),
  // Used by lib/sms/notify
  getActiveOptOuts: vi.fn(async () => new Set<string>()),
  recordOptOut: vi.fn(async () => {}),
  recordSmsMessage: vi.fn(async () => {}),
  disableAlertsForPhone: vi.fn(async () => {}),
  markSmsSent: vi.fn(async () => {}),
  smsNotificationsEnabled: vi.fn(async () => true),
}))

vi.mock('@/lib/email', () => ({
  referralCreatedEmail: vi.fn().mockResolvedValue(undefined),
  internalNotificationEmail: vi.fn().mockResolvedValue(undefined),
  clinicToLawyerReferralEmail: vi.fn().mockResolvedValue(undefined),
  clinicToMedicalSpecialistReferralEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/sms/base', () => ({
  sendSms: vi.fn(),
  twilioConfig: vi.fn(() => ({ accountSid: 'AC', authToken: 't', messagingServiceSid: 'MG' })),
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/professionals/referrals/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'
import * as email from '@/lib/email'
import * as smsBase from '@/lib/sms/base'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const mockedEmail = vi.mocked(email)
const sendSms = vi.mocked(smsBase.sendSms)
const twilioConfig = vi.mocked(smsBase.twilioConfig)

function clinicUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-clinic-1',
    username: 'clinic1',
    password: 'x',
    name: 'Front Desk',
    role: 'clinic',
    email: 'desk@clinic.com',
    clinicId: 'c-001',
    phoneE164: '+13055551212',
    phoneVerifiedAt: '2026-08-01T00:00:00.000Z',
    smsReferralAlerts: true,
    ...overrides,
  }
}

const VALID_BODY = {
  clinicId: 'c-001',
  patientName: 'Jane Doe',
  patientPhone: '305-555-0000',
  caseType: 'Auto accident',
  coverage: 'PIP',
  pip: '10000',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAuth.mockImplementation(
    buildRequireAuth(
      buildSession({ role: 'lawyer', lawyerId: 'l-001', id: 'u-lawyer', name: 'Ann Lawyer' })
    )
  )
  mockedData.getClinicById.mockResolvedValue(fakeClinic({ id: 'c-001', name: 'Sunrise Clinic' }))
  mockedData.getLawyerById.mockResolvedValue(fakeLawyer({ id: 'l-001', name: 'Smith & Partners' }))
  mockedData.getUserById.mockResolvedValue(clinicUser({ id: 'u-lawyer', role: 'lawyer' }))
  mockedData.createReferral.mockResolvedValue(fakeReferral({ id: 'r-1' }))
  mockedData.getUsersByClinicId.mockResolvedValue([clinicUser()])
  mockedData.getActiveOptOuts.mockResolvedValue(new Set())
  mockedData.smsNotificationsEnabled.mockResolvedValue(true)
  twilioConfig.mockReturnValue({ accountSid: 'AC', authToken: 't', messagingServiceSid: 'MG' })
  sendSms.mockResolvedValue({ ok: true, sid: 'SM1', to: '+13055551212' })
})

describe('lawyer → clinic referral', () => {
  it('texts the opted-in clinic user as well as emailing them', async () => {
    const res = await POST(buildRequest(VALID_BODY))
    expect(res.status).toBe(201)

    await flushWaitUntil()

    expect(sendSms).toHaveBeenCalledOnce()
    expect(sendSms.mock.calls[0][0].to).toBe('+13055551212')
    expect(mockedEmail.referralCreatedEmail).toHaveBeenCalled()
  })

  it('names the referring firm in the message, and no patient data', async () => {
    await POST(buildRequest(VALID_BODY))
    await flushWaitUntil()

    const body = sendSms.mock.calls[0][0].body
    expect(body).toContain('Smith & Partners')
    expect(body).not.toContain('Jane Doe')
    expect(body).not.toContain('305-555-0000')
    expect(body).not.toContain('Auto accident')
  })

  it('sends no text when the user has not opted in, but still emails', async () => {
    mockedData.getUsersByClinicId.mockResolvedValue([clinicUser({ smsReferralAlerts: false })])

    const res = await POST(buildRequest(VALID_BODY))
    await flushWaitUntil()

    expect(res.status).toBe(201)
    expect(sendSms).not.toHaveBeenCalled()
    expect(mockedEmail.referralCreatedEmail).toHaveBeenCalled()
  })

  it('sends no text to a number that replied STOP', async () => {
    mockedData.getActiveOptOuts.mockResolvedValue(new Set(['+13055551212']))

    await POST(buildRequest(VALID_BODY))
    await flushWaitUntil()

    expect(sendSms).not.toHaveBeenCalled()
    expect(mockedEmail.referralCreatedEmail).toHaveBeenCalled()
  })

  // The regression that would cost most: SMS is an addition to a
  // working path, never a way to break it.
  it('still emails and still returns 201 when Twilio is down', async () => {
    sendSms.mockRejectedValue(new Error('twilio on fire'))

    const res = await POST(buildRequest(VALID_BODY))
    expect(res.status).toBe(201)

    await flushWaitUntil()
    expect(mockedEmail.referralCreatedEmail).toHaveBeenCalled()
    expect(mockedEmail.internalNotificationEmail).toHaveBeenCalled()
  })

  it('still emails when SMS is switched off globally', async () => {
    mockedData.smsNotificationsEnabled.mockResolvedValue(false)

    await POST(buildRequest(VALID_BODY))
    await flushWaitUntil()

    expect(sendSms).not.toHaveBeenCalled()
    expect(mockedEmail.referralCreatedEmail).toHaveBeenCalled()
  })

  it('charges once for two staff sharing one mobile', async () => {
    mockedData.getUsersByClinicId.mockResolvedValue([
      clinicUser({ id: 'u-a' }),
      clinicUser({ id: 'u-b' }),
    ])

    await POST(buildRequest(VALID_BODY))
    await flushWaitUntil()

    expect(sendSms).toHaveBeenCalledOnce()
  })

  // The organisation's own address is in the email set but has no
  // person behind it, so it has no phone and no consent.
  it('does not try to text the clinic entity address', async () => {
    mockedData.getUsersByClinicId.mockResolvedValue([])

    await POST(buildRequest(VALID_BODY))
    await flushWaitUntil()

    expect(sendSms).not.toHaveBeenCalled()
    expect(mockedEmail.referralCreatedEmail).toHaveBeenCalled()
  })

  it('does not make the caller wait for the text', async () => {
    let settled = false
    sendSms.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50))
      settled = true
      return { ok: true, sid: 'SM1', to: '+13055551212' }
    })

    await POST(buildRequest(VALID_BODY))
    expect(settled).toBe(false)

    await flushWaitUntil()
    expect(settled).toBe(true)
  })
})
