import { describe, expect, it, vi } from 'vitest'
import { buildPopupContent } from '@/lib/map/popup'
import type { MapItem } from '@/lib/map/types'

/**
 * Referral gating for the map popup.
 *
 * This is the entry point to every referral started from the map: the popup
 * button is the only caller of `onReferral`, which `MapView` fans out to three
 * different modals. It had no tests, so the gating silently fell out of step
 * with the map twice.
 */

function item(overrides: Partial<MapItem> = {}): MapItem {
  return {
    id: 'c-1',
    name: 'Newlin Chiropractic',
    address: '1117 N Palafox St, Pensacola, FL 32501',
    lat: 30.4243,
    lng: -87.2181,
    phone: '(850) 433-1111',
    email: '',
    website: 'newlinchiropractic.com',
    region: 'North Florida / Panhandle',
    county: 'Escambia',
    available: true,
    distance: 3.2,
    type: 'clinic',
    specialties: ['Chiropractic', 'Auto Injuries'],
    ...overrides,
  }
}

const referButton = (el: HTMLElement) => el.querySelector('button')

describe('referral CTA gating', () => {
  it('offers a lawyer a referral to a clinic', () => {
    const el = buildPopupContent(item(), 'lawyer', vi.fn())
    expect(referButton(el)?.textContent).toBe('Send Referral')
  })

  it('offers a clinic a referral to a lawyer', () => {
    const el = buildPopupContent(item({ type: 'lawyer', practiceAreas: ['Personal Injury'] }), 'clinic', vi.fn())
    expect(referButton(el)?.textContent).toBe('Refer Patient')
  })

  it('offers a clinic a referral to another clinic', () => {
    // The medical-specialist flow. Clinic users see other clinics on the map
    // (not lawyers), and MapView routes a clinic->clinic referral to
    // MedicalSpecialistReferralModal — but that branch is only reachable if
    // the popup actually offers the button.
    const el = buildPopupContent(item({ id: 'c-2' }), 'clinic', vi.fn())
    expect(referButton(el)?.textContent).toBe('Refer Patient')
  })

  it('does not offer a lawyer a referral to another lawyer', () => {
    const el = buildPopupContent(item({ type: 'lawyer', practiceAreas: ['Family Law'] }), 'lawyer', vi.fn())
    expect(referButton(el)).toBeNull()
  })

  it('offers nothing to roles outside the referral network', () => {
    for (const role of ['admin', 'referrer', 'partner', 'directory', undefined]) {
      const el = buildPopupContent(item(), role, vi.fn())
      expect(referButton(el), `role: ${role}`).toBeNull()
    }
  })
})

describe('availability', () => {
  it('replaces the button with a notice when the target is unavailable', () => {
    const el = buildPopupContent(item({ available: false }), 'lawyer', vi.fn())
    expect(referButton(el)).toBeNull()
    expect(el.textContent).toContain('Not accepting referrals')
  })

  it('shows the notice for a clinic-to-clinic target too', () => {
    const el = buildPopupContent(item({ id: 'c-2', available: false }), 'clinic', vi.fn())
    expect(referButton(el)).toBeNull()
    expect(el.textContent).toContain('Not accepting referrals')
  })

  it('shows no notice at all to a role that could never refer', () => {
    const el = buildPopupContent(item({ available: false }), 'admin', vi.fn())
    expect(el.textContent).not.toContain('Not accepting referrals')
  })
})

describe('the callback', () => {
  it('passes the clicked item straight through', () => {
    const onReferral = vi.fn()
    const target = item()
    const el = buildPopupContent(target, 'lawyer', onReferral)
    referButton(el)!.click()
    expect(onReferral).toHaveBeenCalledTimes(1)
    expect(onReferral).toHaveBeenCalledWith(target)
  })
})

describe('content', () => {
  it('renders name, distance and availability', () => {
    const el = buildPopupContent(item(), 'lawyer', vi.fn())
    expect(el.textContent).toContain('Newlin Chiropractic')
    expect(el.textContent).toContain('3.2 miles away')
    expect(el.textContent).toContain('Available')
  })

  it('names the type for an attorney', () => {
    const el = buildPopupContent(
      item({ type: 'lawyer', specialties: undefined, practiceAreas: ['Personal Injury'] }),
      'clinic',
      vi.fn()
    )
    expect(el.textContent).toContain('Attorney')
  })

  /**
   * The popup answers "which pin is this", not "tell me everything". The tag
   * rail and the website link moved out when every result row gained the same
   * detail plus its own Refer button — keeping both meant maintaining two
   * renderings of one record, one of them hand-written HTML with inline hex
   * colours outside the design system.
   */
  it('leaves the full detail to the result row', () => {
    // A specialty that cannot also appear in the clinic's name, or the
    // assertion proves nothing — the fixture is called "Newlin Chiropractic".
    const el = buildPopupContent(
      item({ specialties: ['Deep Tissue Massage'], website: 'example.test' }),
      'lawyer',
      vi.fn()
    )
    expect(el.textContent).not.toContain('Deep Tissue Massage')
    expect(el.querySelector('a')).toBeNull()
  })

  it('omits contact rows the API withheld', () => {
    // The professionals and partners maps strip phone and address.
    const el = buildPopupContent(
      item({ address: undefined, phone: undefined, website: undefined }),
      'lawyer',
      vi.fn()
    )
    expect(el.textContent).toContain('Newlin Chiropractic')
    expect(el.textContent).not.toContain('undefined')
  })

  it('escapes hostile record content rather than rendering it', () => {
    const el = buildPopupContent(
      item({ name: '<img src=x onerror=alert(1)>', specialties: ['<script>bad()</script>'] }),
      'lawyer',
      vi.fn()
    )
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('script')).toBeNull()
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
