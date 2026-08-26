import { describe, expect, it } from 'vitest'
import { deriveSessionToken, isValidSid } from '@/lib/geocoding/session'

/**
 * Session tokens are what make autocomplete cost a few dollars a month instead
 * of a few hundred: Google and Mapbox both bill N suggestions plus ONE resolve
 * as a single session, and the token is what ties them together.
 *
 * The client supplies an opaque id and the SERVER namespaces it. The
 * alternative — forwarding whatever the client sends — means passing
 * unvalidated user input straight to a paid upstream, and lets one client hold
 * a single token open forever.
 */

const SID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const OTHER_SID = '11111111-2222-4333-8444-555555555555'

describe('sid validation', () => {
  it('accepts a UUID in either case', () => {
    expect(isValidSid(SID)).toBe(true)
    expect(isValidSid(SID.toUpperCase())).toBe(true)
  })

  it('rejects anything that is not one', () => {
    // Nothing that fails here may ever reach an upstream request.
    expect(isValidSid(null)).toBe(false)
    expect(isValidSid(undefined)).toBe(false)
    expect(isValidSid('')).toBe(false)
    expect(isValidSid('not-a-uuid')).toBe(false)
    expect(isValidSid('3f2504e0-4f89-41d3-9a0c')).toBe(false)
    expect(isValidSid(`${SID} OR 1=1`)).toBe(false)
  })
})

describe('deriving the upstream token', () => {
  it('is stable for one user and one session', () => {
    expect(deriveSessionToken('user-1', SID)).toBe(deriveSessionToken('user-1', SID))
  })

  it('gives two users different tokens for the SAME sid', () => {
    // The whole point of namespacing. A copied URL, a shared fixture or a weak
    // client generator must not put two people in one billing session, where
    // one user's keystrokes get charged against the other's resolve and the
    // grouping is wrong for both.
    expect(deriveSessionToken('user-1', SID)).not.toBe(deriveSessionToken('user-2', SID))
  })

  it('gives one user different tokens for different sessions', () => {
    expect(deriveSessionToken('user-1', SID)).not.toBe(deriveSessionToken('user-1', OTHER_SID))
  })

  it('produces a real v4 UUID, which Mapbox requires', () => {
    const token = deriveSessionToken('user-1', SID)
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    // And it has to survive its own validator, or the round trip is broken.
    expect(isValidSid(token)).toBe(true)
  })

  it('does not leak the user id it was derived from', () => {
    const token = deriveSessionToken('joselaurasilvera', SID)
    expect(token).not.toContain('jose')
  })
})
