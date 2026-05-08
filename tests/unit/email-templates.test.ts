import { describe, expect, it, vi, beforeEach } from 'vitest'

// Partial mock: keep escapeHtml/wrapInLayout/etc., replace only sendEmail.
vi.mock('@/lib/email/base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/base')>()
  return {
    ...actual,
    sendEmail: vi.fn().mockResolvedValue(undefined),
  }
})

import {
  referralCreatedEmail,
  internalNotificationEmail,
  clinicToLawyerReferralEmail,
} from '@/lib/email/templates/referral'
import { sendEmail } from '@/lib/email/base'

const mockedSend = vi.mocked(sendEmail)

beforeEach(() => {
  mockedSend.mockClear()
})

function lastHtml(): string {
  const call = mockedSend.mock.calls.at(-1)
  if (!call) throw new Error('sendEmail was never called')
  return (call[0] as { html: string }).html
}

describe('referralCreatedEmail', () => {
  const baseArgs = [
    'Test Clinic',
    'clinic@test.com',
    'Jane Lawyer',
    'Big Firm',
    'Patient Name',
    'Auto Accident',
  ] as const

  it('renders without optional extras', async () => {
    await referralCreatedEmail(...baseArgs)
    expect(mockedSend).toHaveBeenCalledOnce()
    const html = lastHtml()
    expect(html).toContain('Patient Name')
    expect(html).toContain('Auto Accident')
    expect(html).not.toContain('Insurance Company')
    expect(html).not.toContain('Adjuster')
  })

  it('renders only the extras that were provided', async () => {
    await referralCreatedEmail(...baseArgs, {
      coverage: '100/300k',
      pip: 'Yes',
      insuranceCompany: 'State Farm',
    })
    const html = lastHtml()
    expect(html).toContain('Coverage')
    expect(html).toContain('100/300k')
    expect(html).toContain('PIP')
    expect(html).toContain('Insurance Company')
    expect(html).toContain('State Farm')
    expect(html).not.toContain('Claim Number')
    expect(html).not.toContain('Adjuster Name')
  })

  it('skips empty / whitespace-only extras', async () => {
    await referralCreatedEmail(...baseArgs, {
      coverage: '',
      pip: '   ',
      adjusterName: 'John Smith',
    })
    const html = lastHtml()
    expect(html).not.toContain('Coverage')
    expect(html).not.toContain('PIP')
    expect(html).toContain('Adjuster Name')
    expect(html).toContain('John Smith')
  })

  it('escapes HTML in user-supplied values', async () => {
    await referralCreatedEmail(
      'Clinic <script>',
      'clinic@test.com',
      'Lawyer "Quote"',
      'Firm & Co',
      "Patient O'Brien",
      'Slip <img>',
      { adjusterName: '<b>Inj</b>' }
    )
    const html = lastHtml()
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Firm &amp; Co')
    expect(html).toContain('&lt;b&gt;Inj&lt;/b&gt;')
  })

  it('sends to the clinic email passed in', async () => {
    await referralCreatedEmail(...baseArgs)
    expect(mockedSend.mock.calls[0][0].to).toBe('clinic@test.com')
  })
})

describe('clinicToLawyerReferralEmail', () => {
  it('addresses the lawyer and references the clinic', async () => {
    await clinicToLawyerReferralEmail(
      'Jane Lawyer',
      'lawyer@firm.com',
      'Spine Center',
      'Patient X',
      '305-555-0000',
      'Auto Accident'
    )
    const html = lastHtml()
    expect(mockedSend.mock.calls[0][0].to).toBe('lawyer@firm.com')
    expect(html).toContain('Jane Lawyer')
    expect(html).toContain('Spine Center')
    expect(html).toContain('Patient X')
    expect(html).toContain('305-555-0000')
    expect(html).toContain('Auto Accident')
  })

  it('renders adjuster + claim extras when present', async () => {
    await clinicToLawyerReferralEmail(
      'Jane', 'l@f.com', 'Clinic', 'P', '305-1', 'Case',
      { claimNumber: 'CLM-42', adjusterEmail: 'adj@ins.com' }
    )
    const html = lastHtml()
    expect(html).toContain('CLM-42')
    expect(html).toContain('adj@ins.com')
  })
})

describe('internalNotificationEmail', () => {
  it('uses lawyer-to-clinic labels by default', async () => {
    await internalNotificationEmail(
      'Jane', 'Firm', 'Clinic', 'P', 'Case',
      '2026-01-01T00:00:00Z'
    )
    const html = lastHtml()
    expect(html).toContain('Sent By')
    expect(html).toContain('Clinic')
    expect(html).not.toContain('To Specialist')
  })

  it('switches labels for clinic-to-lawyer direction', async () => {
    await internalNotificationEmail(
      'Clinic', '', 'Jane Lawyer', 'P', 'Case',
      '2026-01-01T00:00:00Z',
      undefined,
      'clinic-to-lawyer'
    )
    const html = lastHtml()
    expect(html).toContain('From Clinic')
    expect(html).toContain('To Specialist')
  })
})
