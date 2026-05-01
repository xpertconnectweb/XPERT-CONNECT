'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { Clinic } from '@/types/professionals'
import type { MapItem } from '@/lib/map/types'
import { clinicAvailIcon, clinicUnavailIcon, lawyerAvailIcon, lawyerUnavailIcon, createClusterIcon } from '@/lib/map/icons'
import { buildPopupContent } from '@/lib/map/popup'

export function MarkerClusterLayer({
  items,
  isLawyer,
  onReferral,
}: {
  items: MapItem[]
  isLawyer: boolean
  onReferral: (c: Clinic) => void
}) {
  const map = useMap()
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
    }
    const group = (L as unknown as { markerClusterGroup: (opts: object) => L.MarkerClusterGroup }).markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      showCoverageOnHover: false,
      iconCreateFunction: createClusterIcon,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      animate: true,
    })

    const newMarkers = new Map<string, L.Marker>()
    const leafletMarkers: L.Marker[] = []

    for (const item of items) {
      const icon = item.type === 'lawyer'
        ? (item.available ? lawyerAvailIcon : lawyerUnavailIcon)
        : (item.available ? clinicAvailIcon : clinicUnavailIcon)

      const marker = L.marker([item.lat, item.lng], {
        icon,
        itemType: item.type,
      } as L.MarkerOptions & { itemType: string })

      marker.bindPopup(() => buildPopupContent(item, isLawyer, onReferral), {
        minWidth: 260,
        maxWidth: 310,
        className: 'premium-popup',
      })

      newMarkers.set(item.id, marker)
      leafletMarkers.push(marker)
    }

    group.addLayers(leafletMarkers)
    map.addLayer(group)
    clusterRef.current = group
    markersRef.current = newMarkers

    return () => {
      map.removeLayer(group)
    }
  }, [map, items, isLawyer, onReferral])

  return null
}
