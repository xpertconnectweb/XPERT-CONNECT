export type MapItemType = 'clinic' | 'lawyer'

export interface MapItem {
  id: string
  name: string
  address?: string
  lat: number
  lng: number
  phone?: string
  email: string
  website?: string
  region?: string
  county?: string
  available: boolean
  distance: number
  type: MapItemType
  specialties?: string[]
  practiceAreas?: string[]
  zipCode?: string
}

export interface GeocodeSuggestion {
  display_name: string
  lat: string
  lon: string
}
