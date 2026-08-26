import { describe, expect, it } from 'vitest'
import { validateCoordinates } from '@/lib/validation'

/**
 * The gate that stops another clinic landing in the Gulf of Guinea.
 *
 * The admin form took latitude and longitude as two hand-typed number fields
 * with `parseFloat(e.target.value) || 0` behind them, and the POST handler
 * inserted whatever arrived without looking. An empty field became 0, and
 * 0, 0 became a clinic. Those rows are still in the table, which is why
 * `hasRealCoordinates` has to filter them out when the search index is built —
 * that filter is now defence in depth for the legacy rows, and this is the fix
 * that stops new ones.
 */
describe('validateCoordinates', () => {
  it('accepts a real Florida address', () => {
    expect(validateCoordinates(27.49896, -82.51702)).toEqual({
      ok: true,
      lat: 27.49896,
      lng: -82.51702,
    })
  })

  it('accepts numeric strings, which is what a form posts', () => {
    expect(validateCoordinates('27.49896', '-82.51702')).toMatchObject({ ok: true })
  })

  it('rejects 0, 0 by name', () => {
    const result = validateCoordinates(0, 0)
    expect(result.ok).toBe(false)
    // Named explicitly so an admin sees WHY rather than a generic range error —
    // it is the one failure they are most likely to have caused themselves.
    if (!result.ok) expect(result.reason).toContain('0, 0')
  })

  it('rejects values that are not numbers at all', () => {
    expect(validateCoordinates(undefined, undefined).ok).toBe(false)
    expect(validateCoordinates(null, null).ok).toBe(false)
    expect(validateCoordinates('abc', 'def').ok).toBe(false)
    expect(validateCoordinates(NaN, 0).ok).toBe(false)
    expect(validateCoordinates(Infinity, 0).ok).toBe(false)
  })

  it('rejects a point outside the United States', () => {
    // London.
    expect(validateCoordinates(51.5, -0.12).ok).toBe(false)
    // Buenos Aires.
    expect(validateCoordinates(-34.6, -58.4).ok).toBe(false)
  })

  it('accepts the states that are actually served, and the far ones too', () => {
    // Minnesota and Florida are the live states; Alaska, Hawaii and Puerto Rico
    // are inside the box because this is a sanity check, not a business rule
    // about coverage. VALID_STATES is where coverage is decided.
    expect(validateCoordinates(46.0, -94.5).ok).toBe(true)
    expect(validateCoordinates(27.8, -83.5).ok).toBe(true)
    expect(validateCoordinates(61.2, -149.9).ok).toBe(true)
    expect(validateCoordinates(21.3, -157.8).ok).toBe(true)
    expect(validateCoordinates(18.4, -66.1).ok).toBe(true)
  })

  it('rejects a transposed pair, which is the other classic mistake', () => {
    // -82.5, 27.5 is in the South Atlantic. Swapping lat and lng is silent in
    // every system that does not check.
    expect(validateCoordinates(-82.51702, 27.49896).ok).toBe(false)
  })
})
