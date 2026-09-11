import { describe, expect, it } from 'vitest'
import {
  FEATURED_FIRM_IDS,
  hoistFeatured,
  isFeaturedFirm,
} from '@/lib/directory-featured'

const FEATURED = FEATURED_FIRM_IDS[0]

const row = (id: string) => ({ id })

describe('isFeaturedFirm', () => {
  it('knows the firm the directory is built around', () => {
    expect(FEATURED_FIRM_IDS.length).toBeGreaterThan(0)
    expect(isFeaturedFirm(FEATURED)).toBe(true)
  })

  it('says no to everything else', () => {
    expect(isFeaturedFirm('l-0462')).toBe(false)
    expect(isFeaturedFirm('')).toBe(false)
  })
})

describe('hoistFeatured', () => {
  it('moves the featured firm to the front', () => {
    const out = hoistFeatured([row('a'), row('b'), row(FEATURED), row('c')])
    expect(out.map((r) => r.id)).toEqual([FEATURED, 'a', 'b', 'c'])
  })

  it('leaves everything else in the order it arrived', () => {
    // The engine already ranked these; hoisting must not reshuffle them.
    const out = hoistFeatured([row('c'), row('a'), row(FEATURED), row('b')])
    expect(out.map((r) => r.id)).toEqual([FEATURED, 'c', 'a', 'b'])
  })

  it('is a no-op when the featured firm is absent', () => {
    const rows = [row('a'), row('b')]
    expect(hoistFeatured(rows).map((r) => r.id)).toEqual(['a', 'b'])
  })

  /**
   * Only reorders. Injecting an absent firm is the caller's call,
   * because only the caller can tell "filtered out" from "not loaded
   * yet" — and adding a row to a list that is still loading would put
   * the same lie back that the loading states were built to remove.
   */
  it('never invents a row', () => {
    expect(hoistFeatured([])).toEqual([])
    expect(hoistFeatured([row('a')])).toHaveLength(1)
  })

  it('does not mutate its input', () => {
    const rows = [row('a'), row(FEATURED)]
    const before = rows.map((r) => r.id)
    hoistFeatured(rows)
    expect(rows.map((r) => r.id)).toEqual(before)
  })
})
