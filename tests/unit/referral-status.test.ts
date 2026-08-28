import { describe, expect, it } from 'vitest'
import {
  REFERRAL_STATUSES,
  REFERRAL_STATUS_META,
  REFERRAL_STATUS_LIST,
  ACTIVE_REFERRAL_STATUSES,
  DEFAULT_REFERRAL_STATUS,
  TERMINAL_REFERRAL_STATUS,
  isReferralStatus,
  isTerminal,
  nextStatus,
  statusIndex,
  statusLabel,
  statusMeta,
} from '@/lib/referral-status'
import { REFERRAL_STATUS_ICON, statusIcon } from '@/lib/referral-status-icons'
import { VALID_REFERRAL_STATUSES, VALID_REFERRER_STATUSES } from '@/lib/validation'

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

describe('referral status catalog', () => {
  it('is the client lifecycle, in order', () => {
    expect([...REFERRAL_STATUSES]).toEqual([
      'received',
      'scheduled',
      'mri',
      'specialist',
      'final_mmi',
    ])
  })

  it('is what VALID_REFERRAL_STATUSES exposes', () => {
    expect([...VALID_REFERRAL_STATUSES]).toEqual([...REFERRAL_STATUSES])
  })

  it('starts at the DB default and ends at the terminal stage', () => {
    expect(DEFAULT_REFERRAL_STATUS).toBe(REFERRAL_STATUSES[0])
    expect(TERMINAL_REFERRAL_STATUS).toBe(REFERRAL_STATUSES[REFERRAL_STATUSES.length - 1])
    expect(ACTIVE_REFERRAL_STATUSES).not.toContain(TERMINAL_REFERRAL_STATUS)
    expect(ACTIVE_REFERRAL_STATUSES).toHaveLength(REFERRAL_STATUSES.length - 1)
  })

  // The guard against the drift this catalog was created to end: seven separate
  // label/colour maps, one of which had had `received` painted the wrong colour
  // for months because nothing checked it.
  it('gives every status a complete visual descriptor and an icon', () => {
    for (const s of REFERRAL_STATUSES) {
      const meta = REFERRAL_STATUS_META[s]
      expect(meta, `${s} has no descriptor`).toBeTruthy()
      for (const key of VISUAL_KEYS) {
        expect(meta[key], `${s}.${key} is missing`).toBeTruthy()
      }
      expect(meta.value).toBe(s)
      expect(meta.hex).toMatch(/^#[0-9a-f]{6}$/i)
      expect(REFERRAL_STATUS_ICON[s], `${s} has no icon`).toBeTruthy()
    }
  })

  it('lists the descriptors in lifecycle order', () => {
    expect(REFERRAL_STATUS_LIST.map((m) => m.value)).toEqual([...REFERRAL_STATUSES])
  })

  it('gives every status a distinct colour', () => {
    const hexes = new Set(REFERRAL_STATUSES.map((s) => REFERRAL_STATUS_META[s].hex))
    expect(hexes.size).toBe(REFERRAL_STATUSES.length)
  })

  it('walks forward one step and stops at the terminal stage', () => {
    expect(nextStatus('received')).toBe('scheduled')
    expect(nextStatus('scheduled')).toBe('mri')
    expect(nextStatus('mri')).toBe('specialist')
    expect(nextStatus('specialist')).toBe('final_mmi')
    expect(nextStatus('final_mmi')).toBeNull()
    expect(isTerminal('final_mmi')).toBe(true)
    expect(isTerminal('specialist')).toBe(false)
  })

  it('reports position, and -1 for anything it does not recognise', () => {
    expect(statusIndex('received')).toBe(0)
    expect(statusIndex('final_mmi')).toBe(REFERRAL_STATUSES.length - 1)
    expect(statusIndex('nonsense')).toBe(-1)
    expect(nextStatus('nonsense')).toBeNull()
  })

  // A stale browser tab or a half-applied migration must degrade to a grey
  // pill, never throw — StatusBadge used to read `.icon` off undefined.
  it('never throws on an unknown, empty or null value', () => {
    for (const bad of ['nonsense', '', null, undefined]) {
      const meta = statusMeta(bad)
      expect(meta.label).toBeTruthy()
      expect(meta.badgeClass).toBeTruthy()
      expect(statusIcon(bad)).toBeTruthy()
    }
    expect(isReferralStatus('nonsense')).toBe(false)
    expect(isReferralStatus(7)).toBe(false)
  })

  // `activity_logs.details` is append-only and keeps the pre-2026-11 names for
  // good, so the audit feed must still render them as English.
  it('still names the retired vocabulary', () => {
    expect(statusLabel('in_process')).toBe('In Process')
    expect(statusLabel('attended')).toBe('Attended')
    expect(isReferralStatus('in_process')).toBe(false)
    expect(isReferralStatus('attended')).toBe(false)
  })

  // The partner portal has its own vocabulary on referrer_referrals. The two
  // used to share the literal 'in_process'; a find/replace across the repo
  // would have corrupted the partner pipeline. They must stay disjoint.
  it('stays disjoint from the partner vocabulary', () => {
    const overlap = REFERRAL_STATUSES.filter((s) =>
      (VALID_REFERRER_STATUSES as readonly string[]).includes(s)
    )
    expect(overlap).toEqual([])
  })
})
