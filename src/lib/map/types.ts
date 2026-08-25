export type MapItemType = 'clinic' | 'lawyer'

export interface MapItem {
  id: string
  name: string
  address?: string
  lat: number
  lng: number
  phone?: string
  /**
   * Optional: populated on ~1% of clinics and never rendered. Kept only so the
   * shape still matches the domain records it is built from.
   */
  email?: string
  website?: string
  region?: string
  county?: string
  /** Derived from the address on the read path; see src/lib/address.ts. */
  city?: string
  state?: string
  available: boolean
  distance: number
  type: MapItemType
  specialties?: string[]
  practiceAreas?: string[]
  zipCode?: string
  /** Relevance from the search core, absent when nothing was searched for. */
  score?: number
}

