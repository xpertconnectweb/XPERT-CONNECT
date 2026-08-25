import { describe, expect, it } from 'vitest'
import { canRefer, canReferNow, referLabel } from '@/lib/map/referral-policy'

const clinic = { type: 'clinic' as const, available: true }
const lawyer = { type: 'lawyer' as const, available: true }

/**
 * These four rows are the rule. They live here rather than inside the popup's
 * tests because the rule now has two renderers — the Leaflet popup and the
 * results row — and its first duplication shipped a real bug: the
 * clinic → clinic case was added to `MapView` in July and never to the popup's
 * copy, so clinic users had no Refer button on any marker for a month.
 */
describe('canRefer', () => {
  it('lets a lawyer refer a client to a clinic', () => {
    expect(canRefer('lawyer', clinic)).toBe(true)
  })

  it('lets a clinic refer a patient to a lawyer', () => {
    expect(canRefer('clinic', lawyer)).toBe(true)
  })

  it('lets a clinic refer a patient to another clinic', () => {
    expect(canRefer('clinic', clinic)).toBe(true)
  })

  it('never lets a lawyer refer to another lawyer', () => {
    expect(canRefer('lawyer', lawyer)).toBe(false)
  })

  it.each(['admin', 'referrer', 'partner', 'directory', undefined])(
    'offers nothing to %s, who is outside the referral network',
    (role) => {
      expect(canRefer(role, clinic)).toBe(false)
      expect(canRefer(role, lawyer)).toBe(false)
    }
  )
})

describe('canReferNow', () => {
  it('separates "not allowed" from "not accepting right now"', () => {
    const closed = { type: 'clinic' as const, available: false }
    // Permitted in principle, unavailable in practice — the difference decides
    // whether the UI shows no control or an explanation.
    expect(canRefer('lawyer', closed)).toBe(true)
    expect(canReferNow('lawyer', closed)).toBe(false)
    expect(canReferNow('lawyer', clinic)).toBe(true)
  })

  it('stays false when the role was never allowed, available or not', () => {
    expect(canReferNow('lawyer', lawyer)).toBe(false)
  })
})

describe('referLabel', () => {
  it('says patient to a clinic and referral to a firm', () => {
    expect(referLabel('clinic')).toBe('Refer Patient')
    expect(referLabel('lawyer')).toBe('Send Referral')
  })
})
