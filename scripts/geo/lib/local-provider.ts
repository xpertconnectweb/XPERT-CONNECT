/**
 * The self-hosted provider, backed by the in-memory index.
 *
 * Every line of geocoding logic here comes from `src/lib/geocoding/` -- the
 * parser, the ranker, the codec, the suggestion shape. The only thing this file
 * supplies is a `StreetStore` that reads from memory instead of Postgres, so
 * the Phase 4 gate measures the code that will actually ship rather than a
 * stand-in that could quietly disagree with it.
 */
import { createSelfHostedProvider } from '../../../src/lib/geocoding/selfhosted'
import type { StreetRow, StreetStore } from '../../../src/lib/geocoding/street-index'
import type { GeocodeProvider } from '../../../src/lib/geocoding/types'
import { LocalIndex } from './local-index'

export function localStreetStore(index: LocalIndex): StreetStore {
  return {
    async search(query, options): Promise<StreetRow[]> {
      return index.search(query, {
        state: options.state,
        zip: options.zip,
        city: options.city,
        limit: options.limit,
      })
    },

    async covers(state, zip, city) {
      return index.covers(state, zip, city)
    },

    /**
     * The twin of `geo_street_nearby`, and required rather than optional so
     * that adding it to the interface made this file fail to compile until it
     * had one. `gate-reverse.ts` measures the reverse thresholds through here;
     * if this drifted from the SQL, those numbers would describe a system
     * nobody runs.
     */
    async nearby(lat, lng, radiusDeg, limit) {
      return index.nearby(lat, lng, radiusDeg, limit)
    },

    async payloads(streetIds) {
      const out = new Map<number, Buffer>()
      for (const id of streetIds) {
        const payload = index.payloadOf(id)
        if (payload) out.set(id, payload)
      }
      return out
    },
  }
}

export function localProvider(index: LocalIndex): GeocodeProvider {
  return createSelfHostedProvider(localStreetStore(index))
}
