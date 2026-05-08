import { describe, expect, it } from 'vitest'
import {
  EMAIL_RE,
  USERNAME_RE,
  VALID_ROLES,
  VALID_REFERRAL_STATUSES,
  VALID_REFERRER_STATUSES,
  VALID_CASE_CONFIRMED,
  VALID_SERVICES,
  VALID_STATES,
  REFERRAL_MUTABLE_FIELDS,
} from '@/lib/validation'

describe('EMAIL_RE', () => {
  it.each([
    'a@b.co',
    'first.last@example.com',
    'name+tag@sub.domain.io',
    'UPPER@CASE.COM',
  ])('accepts valid email %s', (value) => {
    expect(EMAIL_RE.test(value)).toBe(true)
  })

  it.each([
    '',
    'no-at.com',
    'a@b',
    'a@.com',
    'spaces in@email.com',
    '@nouser.com',
    'user@',
  ])('rejects invalid email %s', (value) => {
    expect(EMAIL_RE.test(value)).toBe(false)
  })
})

describe('USERNAME_RE', () => {
  it.each(['abc', 'user_123', 'A_B_C_D', 'a'.repeat(30)])(
    'accepts valid username %s',
    (value) => {
      expect(USERNAME_RE.test(value)).toBe(true)
    }
  )

  it.each([
    'ab', // too short
    'a'.repeat(31), // too long
    'has space',
    'has-dash',
    'has.dot',
    'has@symbol',
    '',
  ])('rejects invalid username %s', (value) => {
    expect(USERNAME_RE.test(value)).toBe(false)
  })
})

describe('role and status enums', () => {
  it('VALID_ROLES contains exactly the 5 production roles', () => {
    expect(VALID_ROLES.sort()).toEqual(
      ['admin', 'clinic', 'lawyer', 'partner', 'referrer'].sort()
    )
  })

  it('VALID_REFERRAL_STATUSES is the canonical lifecycle', () => {
    expect(VALID_REFERRAL_STATUSES).toEqual([
      'received',
      'in_process',
      'attended',
    ])
  })

  it('VALID_REFERRER_STATUSES covers the partner lifecycle', () => {
    expect(VALID_REFERRER_STATUSES).toContain('pending')
    expect(VALID_REFERRER_STATUSES).toContain('completed')
  })

  it('VALID_CASE_CONFIRMED has only pending/confirmed', () => {
    expect(VALID_CASE_CONFIRMED.sort()).toEqual(['confirmed', 'pending'])
  })

  it('VALID_SERVICES are clinic/lawyer/both', () => {
    expect(VALID_SERVICES.sort()).toEqual(['both', 'clinic', 'lawyer'])
  })

  it('VALID_STATES is FL+MN', () => {
    expect([...VALID_STATES].sort()).toEqual(['FL', 'MN'])
  })
})

describe('REFERRAL_MUTABLE_FIELDS', () => {
  it('exposes status + insurance + adjuster fields only', () => {
    expect([...REFERRAL_MUTABLE_FIELDS].sort()).toEqual(
      [
        'status',
        'insuranceCompany',
        'claimNumber',
        'adjusterName',
        'adjusterPhone',
        'adjusterEmail',
      ].sort()
    )
  })

  it('does NOT expose immutable identity fields', () => {
    const immutable = [
      'id',
      'lawyerId',
      'clinicId',
      'patientName',
      'patientPhone',
      'caseType',
      'createdAt',
      'createdByUserId',
      'creatorRole',
    ]
    for (const field of immutable) {
      expect(REFERRAL_MUTABLE_FIELDS).not.toContain(field)
    }
  })
})
