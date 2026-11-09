import type { BodyShopState } from '@/types/body-shops'

/**
 * Vocabulary for the Body Shops Directory that both the server and the
 * browser need. Kept apart from `src/lib/body-shops.ts`, which is
 * server-only because it holds every shop's phone number.
 */

/** The `kind` of a shop that belongs to no chain. */
export const INDEPENDENT = 'Independent'

export const STATE_NAMES: Record<BodyShopState, string> = {
  FL: 'Florida',
  MN: 'Minnesota',
}

export const BODY_SHOP_STATES: readonly BodyShopState[] = ['FL', 'MN']

export function isBodyShopState(value: unknown): value is BodyShopState {
  return value === 'FL' || value === 'MN'
}

/**
 * A county is only a key together with its state.
 *
 * Florida and Minnesota both have a Washington, a Polk, a Clay and a Lake
 * county, so "Lake" on its own would merge two places 1,500 miles apart.
 */
export function countyKey(state: BodyShopState, county: string): string {
  return `${state}|${county}`
}

export function parseCountyKey(key: string): { state: BodyShopState; county: string } | null {
  const [state, county] = key.split('|')
  if (!isBodyShopState(state) || !county) return null
  return { state, county }
}
