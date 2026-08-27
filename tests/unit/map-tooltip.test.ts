import { describe, expect, it } from 'vitest'
import { buildMarkerTip } from '@/lib/map/tooltip'
import type { MapItem } from '@/lib/map/types'

const item = (over: Partial<MapItem> = {}): MapItem => ({
  id: 'c-1',
  name: 'Newlin Chiropractic',
  lat: 27.49,
  lng: -82.48,
  available: true,
  distance: 3.2,
  type: 'clinic',
  ...over,
})

describe('buildMarkerTip', () => {
  it('names the pin', () => {
    expect(buildMarkerTip(item()).textContent).toContain('Newlin Chiropractic')
  })

  it('says what kind of pin it is and how far', () => {
    const text = buildMarkerTip(item()).textContent
    expect(text).toContain('Clinic')
    expect(text).toContain('3.2 mi')
  })

  it('calls an attorney an attorney', () => {
    expect(buildMarkerTip(item({ type: 'lawyer' })).textContent).toContain('Attorney')
  })

  it('says so when a provider is not taking referrals', () => {
    expect(buildMarkerTip(item({ available: false })).textContent).toContain('not accepting')
  })

  /**
   * `distance` is 0 when no location is anchored, not when a clinic is on the
   * doorstep. Printing "0.0 mi" would be a confident lie.
   */
  it('omits the distance when nothing is anchored', () => {
    expect(buildMarkerTip(item({ distance: 0 })).textContent).not.toContain('mi')
  })

  /**
   * The reason this builds nodes instead of a string. `popup.ts` concatenates
   * HTML and needs its own `escapeHtml` to stay safe; there is nothing to
   * escape here because nothing is ever parsed as markup.
   */
  it('treats a name as text, not as markup', () => {
    const tip = buildMarkerTip(item({ name: 'Smith & Sons <script>alert(1)</script>' }))
    expect(tip.querySelector('script')).toBeNull()
    expect(tip.textContent).toContain('Smith & Sons <script>alert(1)</script>')
  })
})
