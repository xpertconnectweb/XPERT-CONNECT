'use client'

import 'leaflet/dist/leaflet.css'
import { useCallback, useRef } from 'react'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import type L from 'leaflet'
import { homeIcon } from '@/lib/map/icons'
import { useReverseGeocode } from '@/hooks/useReverseGeocode'
import type { ResolvedAddress } from '@/types/geocode'

/**
 * A small map under an address field, with a pin that can be dragged.
 *
 * Exists because no geocoder is right every time. A rooftop hit needs no
 * correcting; an interpolated one is somewhere along the right street, and a
 * ZIP centroid is the middle of a postcode. Showing the point and letting it be
 * moved is the difference between a record that is roughly right and one that
 * is right — and for a referral product, "the nearest clinic" is measured from
 * exactly this pin.
 *
 * Loaded through `next/dynamic({ ssr: false })` by its callers, like every
 * other Leaflet surface here.
 *
 * The drag deliberately does NOT update React state per frame. Leaflet fires
 * `drag` on every pointermove, and committing that to state would re-render the
 * form dozens of times a second; only the drop commits. The same reasoning, and
 * the same shape, as the home pin on the main map.
 */

export interface AddressConfirmMapProps {
  address: ResolvedAddress
  onMove: (address: ResolvedAddress) => void
  className?: string
  'data-testid'?: string
}

export function AddressConfirmMap({
  address,
  onMove,
  className,
  'data-testid': testId = 'address-confirm-map',
}: AddressConfirmMapProps) {
  const { lookup } = useReverseGeocode()
  const markerRef = useRef<L.Marker | null>(null)

  const handleDragEnd = useCallback(
    async (event: L.LeafletEvent) => {
      const marker = event.target as L.Marker
      const { lat, lng } = marker.getLatLng()

      // The user pointed at it, so the coordinates are already what was asked
      // for. Precision drops to 'unknown' rather than claiming 'rooftop':
      // we know where they clicked, not that a building is under it.
      const moved: ResolvedAddress = { ...address, lat, lng, precision: 'unknown' }
      onMove(moved)

      // The label follows the pin. Without this the record would go on naming a
      // building the pin is no longer on — the same defect the draggable home
      // pin on the main map exists to avoid.
      const place = await lookup(lat, lng)
      if (!place) return
      onMove({
        ...moved,
        formatted: place.fullLabel || place.label,
        street: place.address?.street ?? null,
        city: place.address?.city ?? null,
        state: place.address?.state ?? null,
        zip: place.address?.postcode ?? null,
        // Kept when the answer does not carry one, rather than overwritten with
        // null. The self-hosted engine never supplies a county: the registers
        // publish one per point, but it is dropped at index time because
        // 567,000 copies of a county name is several megabytes of a 500 MB
        // budget spent on a facet the address search does not use.
        //
        // Without the `??`, dragging a pin in an admin form would silently
        // blank a field the clinic list filters on. The cost is a county that
        // could go stale if someone dragged the pin across a county line --
        // which this map, a tens-of-metres correction on an address already
        // chosen, does not do.
        county: place.county ?? moved.county,
      })
    },
    [address, lookup, onMove]
  )

  return (
    <div
      className={className ?? 'h-60 w-full overflow-hidden rounded-lg border border-gray-200'}
      data-testid={testId}
    >
      <MapContainer
        // Remounts when the resolved address changes. A form field is not a
        // live map: `MapContainer` ignores later `center` changes by design, so
        // picking a second address would otherwise leave the view on the first.
        key={`${address.lat},${address.lng}`}
        center={[address.lat, address.lng]}
        zoom={17}
        zoomControl={false}
        scrollWheelZoom={false}
        attributionControl={false}
        className="h-full w-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker
          ref={markerRef}
          position={[address.lat, address.lng]}
          icon={homeIcon}
          draggable
          autoPan
          keyboard
          alt="Location pin. Drag it to correct the exact spot."
          eventHandlers={{ dragend: handleDragEnd }}
        />
      </MapContainer>
    </div>
  )
}
