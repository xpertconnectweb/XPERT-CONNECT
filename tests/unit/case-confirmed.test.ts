import { describe, expect, it } from 'vitest'
import {
  CASE_CONFIRMED_VALUES,
  CASE_CONFIRMED_META,
  CASE_CONFIRMED_LIST,
  DEFAULT_CASE_CONFIRMED,
  caseLabel,
  caseMeta,
  isCaseConfirmed,
} from '@/lib/case-confirmed'
import { CASE_CONFIRMED_ICON, caseIcon } from '@/lib/case-confirmed-icons'
import { VALID_CASE_CONFIRMED } from '@/lib/validation'

const VISUAL_KEYS = [
  'label',
  'badgeClass',
  'pillClass',
  'gradientClass',
  'accentClass',
  'iconClass',
  'tintGradient',
  'hex',
] as const

describe('case outcome catalog', () => {
  it('is pending → confirmed → drop, in order', () => {
    expect([...CASE_CONFIRMED_VALUES]).toEqual(['pending', 'confirmed', 'drop'])
  })

  it('is what VALID_CASE_CONFIRMED exposes', () => {
    expect([...VALID_CASE_CONFIRMED]).toEqual([...CASE_CONFIRMED_VALUES])
  })

  it('defaults to the value the DB column defaults to', () => {
    expect(DEFAULT_CASE_CONFIRMED).toBe(CASE_CONFIRMED_VALUES[0])
  })

  it('gives every value a complete visual descriptor and an icon', () => {
    for (const v of CASE_CONFIRMED_VALUES) {
      const meta = CASE_CONFIRMED_META[v]
      expect(meta, `${v} has no descriptor`).toBeTruthy()
      for (const key of VISUAL_KEYS) {
        expect(meta[key], `${v}.${key} is missing`).toBeTruthy()
      }
      expect(meta.value).toBe(v)
      expect(meta.hex).toMatch(/^#[0-9a-f]{6}$/i)
      expect(CASE_CONFIRMED_ICON[v], `${v} has no icon`).toBeTruthy()
    }
  })

  it('lists the descriptors in order', () => {
    expect(CASE_CONFIRMED_LIST.map((m) => m.value)).toEqual([...CASE_CONFIRMED_VALUES])
  })

  it('gives every value a distinct colour', () => {
    const hexes = new Set(CASE_CONFIRMED_VALUES.map((v) => CASE_CONFIRMED_META[v].hex))
    expect(hexes.size).toBe(CASE_CONFIRMED_VALUES.length)
  })

  // The one assertion specific to this catalog: Drop is slate and the unknown
  // fallback is gray, and nobody may later collapse them into the same pill.
  it('does not paint Drop the same colour as an unrecognised value', () => {
    expect(CASE_CONFIRMED_META.drop.hex).not.toBe(caseMeta('nonsense').hex)
    expect(CASE_CONFIRMED_META.drop.badgeClass).not.toBe(caseMeta('nonsense').badgeClass)
  })

  it('never throws on an unknown, empty or null value', () => {
    for (const bad of ['nonsense', '', null, undefined]) {
      const meta = caseMeta(bad)
      expect(meta.label).toBeTruthy()
      expect(meta.badgeClass).toBeTruthy()
      expect(caseIcon(bad)).toBeTruthy()
    }
    expect(isCaseConfirmed('nonsense')).toBe(false)
    expect(isCaseConfirmed(7)).toBe(false)
  })

  it('labels the three values for the screen', () => {
    expect(caseLabel('pending')).toBe('Pending')
    expect(caseLabel('confirmed')).toBe('Confirmed')
    expect(caseLabel('drop')).toBe('Drop')
  })
})
