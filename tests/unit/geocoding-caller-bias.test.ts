import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Where the caller is, when the caller did not say.
 *
 * The gap this closes: no `<AddressAutocomplete>` in the application passes a
 * `proximity`, so the referral form and both admin address fields had nothing
 * but the state bounding box to go on — and Florida is a rectangle 700 km tall.
 *
 * The rules worth pinning are about who gets a bias and who does not, and about
 * a bias never being allowed to break the search it was meant to improve.
 */

const getClinicById = vi.fn()
const getLawyerById = vi.fn()

vi.mock('@/lib/data', () => ({
  getClinicById: (...args: unknown[]) => getClinicById(...args),
  getLawyerById: (...args: unknown[]) => getLawyerById(...args),
}))

import { resolveCallerBias, __clearCallerBiasCache } from '@/lib/geocoding/caller-bias'

/** Manatee County's own coordinate for the address the client reported. */
const BRADENTON = { lat: 27.491257, lng: -82.481824 }

beforeEach(() => {
  vi.clearAllMocks()
  __clearCallerBiasCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('who gets a bias', () => {
  it('gives a clinic user its own clinic', async () => {
    getClinicById.mockResolvedValue(BRADENTON)

    const bias = await resolveCallerBias({ id: 'u-1', clinicId: 'c-271' })

    expect(getClinicById).toHaveBeenCalledWith('c-271')
    expect(bias?.lat).toBeCloseTo(27.5, 5)
    expect(bias?.lng).toBeCloseTo(-82.5, 5)
  })

  it('gives a law-firm user its own firm', async () => {
    getLawyerById.mockResolvedValue(BRADENTON)

    const bias = await resolveCallerBias({ id: 'u-2', lawyerId: 'l-166' })

    expect(getLawyerById).toHaveBeenCalledWith('l-166')
    expect(bias).not.toBeNull()
  })

  /**
   * A referrer belongs to nothing. They pick a state from two cards and type an
   * address; there is no office to bias toward, and inventing one would be
   * worse than the state box they already get.
   */
  it('gives a referrer nothing, and asks the database nothing', async () => {
    expect(await resolveCallerBias({ id: 'u-3' })).toBeNull()
    expect(getClinicById).not.toHaveBeenCalled()
    expect(getLawyerById).not.toHaveBeenCalled()
  })

  it('gives an absent user nothing', async () => {
    expect(await resolveCallerBias(null)).toBeNull()
    expect(await resolveCallerBias(undefined)).toBeNull()
  })
})

describe('when the entity cannot be trusted', () => {
  /**
   * Rows at (0, 0) are still in this database — `validateCoordinates` exists
   * because they got in — and biasing every search a clinic makes toward the
   * Gulf of Guinea would be considerably worse than having no bias at all.
   */
  it('ignores the Gulf of Guinea', async () => {
    getClinicById.mockResolvedValue({ lat: 0, lng: 0 })
    expect(await resolveCallerBias({ id: 'u-4', clinicId: 'c-271' })).toBeNull()
  })

  it('ignores a coordinate outside the United States', async () => {
    getClinicById.mockResolvedValue({ lat: 40.4168, lng: -3.7038 })
    expect(await resolveCallerBias({ id: 'u-5', clinicId: 'c-9' })).toBeNull()
  })

  it('ignores an entity that is not there', async () => {
    getClinicById.mockResolvedValue(undefined)
    expect(await resolveCallerBias({ id: 'u-6', clinicId: 'c-gone' })).toBeNull()
  })

  /** A bias is a nicety. Failing a whole search over a hint is the wrong trade. */
  it('survives the lookup throwing', async () => {
    getClinicById.mockRejectedValue(new Error('database unreachable'))
    expect(await resolveCallerBias({ id: 'u-7', clinicId: 'c-271' })).toBeNull()
  })
})

describe('the cache', () => {
  /**
   * This runs on the autocomplete path, which fires per keystroke. Without the
   * cache, typing an address is one database read per letter.
   */
  it('reads the entity once for a burst of typing', async () => {
    getClinicById.mockResolvedValue(BRADENTON)

    for (let i = 0; i < 12; i++) await resolveCallerBias({ id: 'u-8', clinicId: 'c-271' })

    expect(getClinicById).toHaveBeenCalledTimes(1)
  })

  it('caches a null too, so a referrer never costs a read either', async () => {
    getClinicById.mockResolvedValue(undefined)

    await resolveCallerBias({ id: 'u-9', clinicId: 'c-gone' })
    await resolveCallerBias({ id: 'u-9', clinicId: 'c-gone' })

    expect(getClinicById).toHaveBeenCalledTimes(1)
  })

  it('does not serve one user the other one’s office', async () => {
    getClinicById.mockResolvedValue(BRADENTON)
    getLawyerById.mockResolvedValue({ lat: 44.9778, lng: -93.265 })

    const clinic = await resolveCallerBias({ id: 'u-a', clinicId: 'c-271' })
    const firm = await resolveCallerBias({ id: 'u-b', lawyerId: 'l-166' })

    expect(clinic?.lat).not.toBe(firm?.lat)
  })

  it('lets the entity move', async () => {
    vi.useFakeTimers()
    getClinicById.mockResolvedValue(BRADENTON)
    await resolveCallerBias({ id: 'u-c', clinicId: 'c-271' })

    // Five minutes, matching how often auth.ts refreshes the session from the
    // database — the two go stale together rather than disagreeing.
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    await resolveCallerBias({ id: 'u-c', clinicId: 'c-271' })

    expect(getClinicById).toHaveBeenCalledTimes(2)
  })
})

/**
 * The bias reaches the providers as `ctx.proximity`, which becomes part of the
 * geocoding cache key. An unrounded coordinate would give every user their own
 * private copy of every cached answer.
 */
describe('quantisation', () => {
  it('rounds to the same grid the map viewport uses', async () => {
    getClinicById.mockResolvedValue({ lat: 27.491257, lng: -82.481824 })
    const a = await resolveCallerBias({ id: 'u-d', clinicId: 'c-1' })

    __clearCallerBiasCache()
    getClinicById.mockResolvedValue({ lat: 27.4712, lng: -82.4996 })
    const b = await resolveCallerBias({ id: 'u-e', clinicId: 'c-2' })

    // Two offices a couple of kilometres apart share one cache entry.
    expect(a).toEqual(b)
  })
})
