import { describe, it, expect } from 'vitest'
import { toE164Us, phoneLast4, maskPhone } from '@/lib/phone'
import { isValidPhone } from '@/lib/sanitize'

describe('toE164Us', () => {
  it.each([
    ['305-555-1212', '+13055551212'],
    ['(305) 555-1212', '+13055551212'],
    ['305.555.1212', '+13055551212'],
    ['3055551212', '+13055551212'],
    ['1 305 555 1212', '+13055551212'],
    ['+1 (305) 555-1212', '+13055551212'],
    ['+13055551212', '+13055551212'],
    ['  305 555 1212  ', '+13055551212'],
  ])('normalizes %s', (input, expected) => {
    expect(toE164Us(input)).toBe(expected)
  })

  // These two are the entire reason this module exists: both PASS
  // the existing isValidPhone, and both would be a message sent to
  // nobody — or worse, to somebody.
  it('rejects the strings that isValidPhone lets through', () => {
    expect(isValidPhone('305-555')).toBe(true)
    expect(toE164Us('305-555')).toBeNull()

    expect(isValidPhone('(((((((')).toBe(true)
    expect(toE164Us('(((((((')).toBeNull()
  })

  it.each([
    ['', 'empty'],
    ['0305551212', 'area code starting with 0'],
    ['1305551212', 'area code starting with 1'],
    ['3050551212', 'exchange starting with 0'],
    ['+443055551212', 'non-US country code'],
    ['23055551212', '11 digits not starting with 1'],
    ['30555512121', 'too long'],
    ['1-800-FLOWERS', 'vanity letters'],
  ])('rejects %s (%s)', (input) => {
    expect(toE164Us(input)).toBeNull()
  })

  it('refuses a vanity number rather than truncating it into a valid one', () => {
    // Stripping non-digits from '1-800-FLOWERS' yields '1800', which
    // is not 10 digits, so this happens to be caught anyway — but
    // '305-555-12AB' strips to a 10-digit number that is a REAL,
    // different subscriber. That is the case worth pinning.
    expect(toE164Us('305-555-12AB12')).toBeNull()
  })
})

describe('maskPhone / phoneLast4', () => {
  it('keeps only what the UI and the audit log need', () => {
    expect(maskPhone('+13055551212')).toBe('+1305***1212')
    expect(phoneLast4('+13055551212')).toBe('1212')
  })

  it('does not leak the middle digits', () => {
    expect(maskPhone('+13055551212')).not.toContain('555')
  })

  it('degrades safely on a short string', () => {
    expect(maskPhone('+1305')).toBe('***')
  })
})

describe('isValidPhone is untouched', () => {
  // Guards tests/unit/sanitize.test.ts: the loose validator has five
  // callers on free-text referral fields and must keep its behaviour.
  it.each(['+1 305 555 0000', '(305) 555-0000', '305.555.0000', '3055550000', '305-555'])(
    'still accepts %s',
    (input) => {
      expect(isValidPhone(input)).toBe(true)
    }
  )
})
