import { describe, it, expect } from 'vitest'
import { isGsm7, toGsm7, assertSingleSegment } from '@/lib/sms/gsm7'
import {
  referralAlertSms,
  verificationCodeSms,
  optInConfirmationSms,
  truncateOrg,
  HELP_REPLY,
  STOP_REPLY,
  SEGMENT_LIMIT,
  SMS_SHORT_LINK,
} from '@/lib/sms/templates'

describe('toGsm7', () => {
  it('transliterates the smart punctuation that real firm names carry', () => {
    expect(toGsm7('O’Brien')).toBe("O'Brien")
    expect(toGsm7('“Injury” Law')).toBe('"Injury" Law')
    expect(toGsm7('Smith — Jones')).toBe('Smith - Jones')
    expect(toGsm7('Wait…')).toBe('Wait...')
  })

  it('strips accents down to a letter in the basic set', () => {
    expect(toGsm7('Grüßner')).toBe('Grüßner') // ü and ß ARE GSM-7
    expect(toGsm7('Ćirić')).toBe('Ciric') // ć is not
  })

  it('drops what carries no information', () => {
    expect(toGsm7('Smith 🙂 Law')).toBe('Smith  Law')
    expect(toGsm7('Acme®')).toBe('Acme')
  })

  it('replaces the extension characters that secretly cost two septets', () => {
    // These are legal GSM-7 but bill double, so a body that counts
    // 158 would charge as two segments.
    expect(toGsm7('A|B')).toBe('A/B')
    expect(toGsm7('A[B]')).toBe('A(B)')
    expect(toGsm7('A~B')).toBe('A-B')
    expect(isGsm7(toGsm7('^{}[]~|\\€'))).toBe(true)
  })
})

describe('isGsm7', () => {
  it('is false for a single curly apostrophe — the whole point', () => {
    expect(isGsm7("O'Brien")).toBe(true)
    expect(isGsm7('O’Brien')).toBe(false)
  })
})

describe('every body fits one segment and is GSM-7', () => {
  const bodies: Array<[string, string]> = [
    ['referral alert, generic', referralAlertSms()],
    ['referral alert, with org', referralAlertSms('Morgan & Morgan')],
    ['verification code', verificationCodeSms('123456')],
    ['opt-in confirmation', optInConfirmationSms()],
    ['HELP reply', HELP_REPLY],
    ['STOP reply', STOP_REPLY],
  ]

  it.each(bodies)('%s', (_label, body) => {
    expect(body.length).toBeLessThanOrEqual(SEGMENT_LIMIT)
    expect(isGsm7(body)).toBe(true)
  })
})

describe('referralAlertSms', () => {
  it('survives a firm name longer than the whole message budget', () => {
    const body = referralAlertSms('A'.repeat(300))
    expect(body.length).toBeLessThanOrEqual(SEGMENT_LIMIT)
    expect(isGsm7(body)).toBe(true)
  })

  it('does not downgrade to UCS-2 on a name full of smart punctuation', () => {
    // Without toGsm7 this body would be UCS-2, the limit would drop
    // from 160 to 70, and every alert would cost double.
    const body = referralAlertSms('Grüßner & Sons — “Injury” Law')
    expect(isGsm7(body)).toBe(true)
    expect(body.length).toBeLessThanOrEqual(SEGMENT_LIMIT)
  })

  it('falls back to the generic body when nothing usable survives', () => {
    expect(referralAlertSms('🙂🙂🙂')).toBe(referralAlertSms())
    expect(referralAlertSms('   ')).toBe(referralAlertSms())
    expect(referralAlertSms('')).toBe(referralAlertSms())
  })

  it('names the firm when it fits', () => {
    expect(referralAlertSms('Morgan & Morgan')).toContain('Morgan & Morgan')
  })

  it('always carries opt-out language and the short link', () => {
    for (const body of [referralAlertSms(), referralAlertSms('Smith Law')]) {
      expect(body).toContain('STOP')
      expect(body).toContain(SMS_SHORT_LINK)
    }
  })

  it('carries no patient data placeholder of any kind', () => {
    const body = referralAlertSms('Smith Law')
    expect(body).not.toMatch(/patient|dob|injury|claim/i)
  })
})

describe('truncateOrg', () => {
  it('cuts on a word boundary', () => {
    expect(truncateOrg('Morgan Morgan Morgan Morgan Morgan Morgan', 20)).toBe('Morgan Morgan Morgan')
  })

  it('hard-cuts a single long word rather than returning a stub', () => {
    expect(truncateOrg('A'.repeat(60), 20)).toBe('A'.repeat(20))
  })

  it('returns null when nothing survives', () => {
    expect(truncateOrg('🙂')).toBeNull()
    expect(truncateOrg('   ')).toBeNull()
  })
})

describe('verificationCodeSms', () => {
  it('contains no link, because carriers filter OTP traffic that carries a URL', () => {
    const body = verificationCodeSms('123456')
    expect(body).not.toContain('http')
    expect(body).not.toContain('.com')
  })

  it('contains the code', () => {
    expect(verificationCodeSms('418362')).toContain('418362')
  })
})

describe('assertSingleSegment', () => {
  it('throws on a body over the limit, so it fails here and not in the bill', () => {
    expect(() => assertSingleSegment('A'.repeat(161))).toThrow(/161 chars/)
  })

  it('throws on non-GSM-7, naming the reason', () => {
    expect(() => assertSingleSegment('hello 🙂')).toThrow(/not GSM-7/)
  })
})
