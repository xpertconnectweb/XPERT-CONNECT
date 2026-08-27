import { describe, expect, it } from 'vitest'
import { orderFilterChips } from '@/lib/search/facets'
import { FEATURED_SPECIALTIES } from '@/lib/clinic-specialties'
import type { FacetValue } from '@/lib/search/types'

/**
 * The filter rail shows six chips out of twenty-four, ordered by count. The
 * client asked for Orthopedics and Neurosurgery to be reachable there, and
 * count alone cannot promise that: the counts are computed over whatever is
 * inside the current viewport, so a statewide total says nothing about the six
 * chips someone in Orlando sees.
 */

const tags = (pairs: [string, number][]): FacetValue[] =>
  pairs.map(([value, count]) => ({ value, count }))

/** The six that actually lead the corpus, plus the two being promoted. */
const CORPUS = tags([
  ['Auto Injuries', 291],
  ['Rehabilitation', 283],
  ['Chiropractic', 276],
  ['Injury Clinic', 192],
  ['Physical Therapy', 171],
  ['Pain Management', 107],
  ['Orthopedics', 90],
  ['Spine', 76],
  ['Neurosurgery', 40],
])

describe('orderFilterChips', () => {
  it('puts the featured specialties in front of bigger counts', () => {
    const shown = orderFilterChips(CORPUS, [], FEATURED_SPECIALTIES, 6, false)
    expect(shown.map((t) => t.value).slice(0, 2)).toEqual(['Orthopedics', 'Neurosurgery'])
    expect(shown).toHaveLength(6)
  })

  it('leaves the rest in count order behind them', () => {
    const shown = orderFilterChips(CORPUS, [], FEATURED_SPECIALTIES, 6, false)
    expect(shown.map((t) => t.value)).toEqual([
      'Orthopedics',
      'Neurosurgery',
      'Auto Injuries',
      'Rehabilitation',
      'Chiropractic',
      'Injury Clinic',
    ])
  })

  it('will not promote a specialty with nothing in view', () => {
    // A pinned chip over an empty result set is a promise the list cannot
    // keep — and Chip renders a zero count disabled, so it would arrive greyed
    // out and unclickable, which reads as a rendering fault.
    const viewport = tags([
      ['Chiropractic', 12],
      ['Orthopedics', 3],
      ['Neurosurgery', 0],
    ])
    const shown = orderFilterChips(viewport, [], FEATURED_SPECIALTIES, 6, false)
    expect(shown.map((t) => t.value)).toEqual(['Orthopedics', 'Chiropractic', 'Neurosurgery'])
    // Neurosurgery is still listed — it just did not jump the queue for it.
    expect(shown[0].value).toBe('Orthopedics')
  })

  it('keeps a selected chip first, ahead of the featured ones', () => {
    // Selection has to stay visible or the control that set the filter
    // disappears from under the cursor that set it.
    const shown = orderFilterChips(CORPUS, ['Spine'], FEATURED_SPECIALTIES, 6, false)
    expect(shown[0].value).toBe('Spine')
    expect(shown.map((t) => t.value).slice(1, 3)).toEqual(['Orthopedics', 'Neurosurgery'])
    expect(shown).toHaveLength(6)
  })

  it('never lists a tag twice when it is both selected and featured', () => {
    const shown = orderFilterChips(CORPUS, ['Orthopedics'], FEATURED_SPECIALTIES, 6, false)
    const values = shown.map((t) => t.value)
    expect(values.filter((v) => v === 'Orthopedics')).toHaveLength(1)
    expect(values[0]).toBe('Orthopedics')
  })

  it('shows everything when expanded, still featured-first', () => {
    const shown = orderFilterChips(CORPUS, [], FEATURED_SPECIALTIES, 6, true)
    expect(shown).toHaveLength(CORPUS.length)
    expect(shown[0].value).toBe('Orthopedics')
  })

  it('falls back to plain count order when nothing is featured', () => {
    const shown = orderFilterChips(CORPUS, [], [], 3, false)
    expect(shown.map((t) => t.value)).toEqual(['Auto Injuries', 'Rehabilitation', 'Chiropractic'])
  })

  it('gives the "+N" something honest to count', () => {
    // MapView shows `facets.tags.length - visibleTags.length`. That is only
    // right if this returns exactly what is rendered — the reason the old
    // `- MAX_VISIBLE_TAGS` arithmetic had to go.
    const shown = orderFilterChips(CORPUS, ['Spine', 'Chiropractic'], FEATURED_SPECIALTIES, 6, false)
    expect(CORPUS.length - shown.length).toBe(3)
  })
})
