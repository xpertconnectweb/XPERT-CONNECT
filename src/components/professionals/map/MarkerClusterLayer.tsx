'use client'

import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { MapItem } from '@/lib/map/types'
import {
  clinicAvailIcon,
  clinicUnavailIcon,
  lawyerAvailIcon,
  lawyerUnavailIcon,
  createClusterIcon,
  createHighlightIcon,
} from '@/lib/map/icons'
import { buildPopupContent } from '@/lib/map/popup'
import { buildMarkerTip } from '@/lib/map/tooltip'

/**
 * Imperative handle so the results panel can drive the map.
 *
 * Panel clicks used to only re-centre the map — the marker was never
 * highlighted and its popup never opened, so choosing a result from the list
 * dropped you somewhere with no indication of which pin you had picked.
 */
export interface MarkerRegistry {
  /** Zooms/spiderfies until the marker is individually visible, then opens it. */
  focus(id: string, options?: { zoom?: number; openPopup?: boolean }): void
  setHovered(id: string | null): void
  setSelected(id: string | null): void
  closePopup(): void
}

interface MarkerClusterLayerProps {
  items: MapItem[]
  userRole: string | undefined
  onReferral: (target: MapItem) => void
  onMarkerHover?: (id: string | null) => void
  onMarkerClick?: (id: string) => void
}

interface Entry {
  marker: L.Marker
  /** Everything that would change the marker's appearance or position. */
  signature: string
  type: MapItem['type']
  available: boolean
}

function signatureOf(item: MapItem): string {
  return `${item.lat}|${item.lng}|${item.type}|${item.available}`
}

function baseIcon(type: MapItem['type'], available: boolean): L.Icon | L.DivIcon {
  if (type === 'lawyer') return available ? lawyerAvailIcon : lawyerUnavailIcon
  return available ? clinicAvailIcon : clinicUnavailIcon
}

/**
 * Memoised, because it renders nothing and all of its work is in effects.
 *
 * Without this it re-rendered on every render of `MapView` — so hovering a
 * result row, which repaints markers imperatively and needs no React work here
 * at all, still ran this component and rebuilt a ~700-entry Map. Its props are
 * `items`, memoised upstream, and four callbacks that are already held in refs
 * precisely so their identity does not matter.
 */
export const MarkerClusterLayer = memo(
  forwardRef<MarkerRegistry, MarkerClusterLayerProps>(
  function MarkerClusterLayer({ items, userRole, onReferral, onMarkerHover, onMarkerClick }, ref) {
    const map = useMap()

    const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
    const markersRef = useRef<Map<string, Entry>>(new Map())
    const hoveredRef = useRef<string | null>(null)
    const selectedRef = useRef<string | null>(null)

    // Live values read at call time, so none of these force the layer to be
    // rebuilt when they change. Popups bind lazily against these refs.
    const itemsByIdRef = useRef<Map<string, MapItem>>(new Map())
    const userRoleRef = useRef(userRole)
    const onReferralRef = useRef(onReferral)
    const onHoverRef = useRef(onMarkerHover)
    const onClickRef = useRef(onMarkerClick)

    // In an effect, not the render body. This used to rebuild a ~700-entry Map
    // on EVERY render of the parent -- which is every hover of a row, every
    // hover of a marker and every keystroke in the search box. Only the lazy
    // popup and tooltip factories read it, and those cannot fire before
    // effects have flushed.
    useEffect(() => {
      itemsByIdRef.current = new Map(items.map((item) => [item.id, item]))
    }, [items])

    // These four are genuinely per-render: the point of holding them in refs is
    // that a new callback identity never rebuilds the layer. A layout effect
    // rather than the render body so the component stays side-effect free,
    // and without a dependency array because "mirror every render" is exactly
    // what is meant.
    useLayoutEffect(() => {
      userRoleRef.current = userRole
      onReferralRef.current = onReferral
      onHoverRef.current = onMarkerHover
      onClickRef.current = onMarkerClick
    })

    // Create the cluster group once. It used to be torn down and rebuilt on
    // every `items` change — which meant every keystroke AND every pan, since
    // distances are recomputed as the map moves.
    useEffect(() => {
      const group = (
        L as unknown as { markerClusterGroup: (opts: object) => L.MarkerClusterGroup }
      ).markerClusterGroup({
        maxClusterRadius: 60,
        disableClusteringAtZoom: 16,
        chunkedLoading: true,
        showCoverageOnHover: false,
        iconCreateFunction: createClusterIcon,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        animate: true,
      })
      map.addLayer(group)
      clusterRef.current = group

      return () => {
        map.removeLayer(group)
        clusterRef.current = null
        markersRef.current = new Map()
      }
    }, [map])

    // Reconcile markers against `items`: add what is new, remove what is gone,
    // and only re-icon what actually changed.
    useEffect(() => {
      const group = clusterRef.current
      if (!group) return

      const registry = markersRef.current
      const next = new Set(items.map((item) => item.id))
      const toRemove: L.Marker[] = []
      const toAdd: L.Marker[] = []

      registry.forEach((entry, id) => {
        if (!next.has(id)) {
          toRemove.push(entry.marker)
          registry.delete(id)
        }
      })

      for (const item of items) {
        const signature = signatureOf(item)
        const existing = registry.get(item.id)

        if (existing) {
          if (existing.signature !== signature) {
            existing.marker.setLatLng([item.lat, item.lng])
            existing.signature = signature
            existing.type = item.type
            existing.available = item.available
            if (hoveredRef.current !== item.id && selectedRef.current !== item.id) {
              existing.marker.setIcon(baseIcon(item.type, item.available))
            }
          }
          continue
        }

        const marker = L.marker([item.lat, item.lng], {
          icon: baseIcon(item.type, item.available),
          itemType: item.type,
        } as L.MarkerOptions & { itemType: string })

        // Bound lazily against the ref so the content is always current
        // without ever needing to rebind.
        marker.bindPopup(
          () => {
            const current = itemsByIdRef.current.get(item.id)
            if (!current) return document.createElement('div')
            return buildPopupContent(current, userRoleRef.current, (target) =>
              onReferralRef.current(target)
            )
          },
          { minWidth: 260, maxWidth: 310, className: 'premium-popup' }
        )

        /**
         * Says what the pin IS, without a click.
         *
         * Lazy against the same ref as the popup, for the same reason: the
         * content is always current and nothing ever needs rebinding.
         *
         * `interactive: false` so the tip never becomes a target of its own —
         * a tooltip that can be hovered sits between the pointer and the pin.
         *
         * -- Not gated on `(hover: hover)`, and that was a mistake worth
         * recording. The first version bound this only where the media query
         * said hovering happens, to keep it from flashing under a finger on a
         * touch screen. Headless Chromium reports `(hover: none)` — it has no
         * real pointer — so the feature silently switched itself off in the
         * test suite, and would do the same on any desktop the query
         * misreported. A capability check that fails closed on a feature this
         * cheap trades a visible benefit for an invisible one. The touch case
         * is handled below instead, by closing the tip on the tap that opens
         * the popup, which is a fact rather than a prediction.
         */
        marker.bindTooltip(
          () => {
            const current = itemsByIdRef.current.get(item.id)
            return current ? buildMarkerTip(current) : document.createElement('div')
          },
          {
            direction: 'top',
            offset: [0, -36],
            opacity: 1,
            className: 'xc-marker-tip',
            interactive: false,
          }
        )

        marker.on('mouseover', () => onHoverRef.current?.(item.id))
        marker.on('mouseout', () => onHoverRef.current?.(null))
        marker.on('click', () => {
          // On a touch screen Leaflet synthesises `mouseover` from the tap, so
          // without this the tip would sit under the finger in front of the
          // popup it was meant to save you from opening.
          marker.closeTooltip()
          onClickRef.current?.(item.id)
        })

        registry.set(item.id, {
          marker,
          signature,
          type: item.type,
          available: item.available,
        })
        toAdd.push(marker)
      }

      if (toRemove.length > 0) group.removeLayers(toRemove)
      if (toAdd.length > 0) group.addLayers(toAdd)
    }, [items])

    useImperativeHandle(
      ref,
      (): MarkerRegistry => {
        const paint = (id: string | null, state: 'hover' | 'selected' | null) => {
          if (!id) return
          const entry = markersRef.current.get(id)
          if (!entry) return
          if (state === null) {
            entry.marker.setIcon(baseIcon(entry.type, entry.available))
            entry.marker.setZIndexOffset(0)
            return
          }
          entry.marker.setIcon(createHighlightIcon(entry.type, state))
          entry.marker.setZIndexOffset(state === 'selected' ? 1000 : 600)
        }

        return {
          focus(id, { zoom = 15, openPopup = true } = {}) {
            const entry = markersRef.current.get(id)
            const group = clusterRef.current
            const item = itemsByIdRef.current.get(id)
            if (!entry || !group) {
              if (item) map.setView([item.lat, item.lng], zoom)
              return
            }
            // The marker may be inside a collapsed cluster; markercluster
            // zooms and spiderfies until it is individually visible. The
            // callback never fires if the marker is not in the group, so fall
            // back rather than silently doing nothing.
            if (!group.hasLayer(entry.marker)) {
              if (item) map.setView([item.lat, item.lng], zoom)
              return
            }
            group.zoomToShowLayer(entry.marker, () => {
              if (openPopup) entry.marker.openPopup()
            })
          },

          setHovered(id) {
            if (hoveredRef.current === id) return
            const previous = hoveredRef.current
            hoveredRef.current = id
            if (previous && previous !== selectedRef.current) paint(previous, null)
            else if (previous === selectedRef.current) paint(previous, 'selected')
            if (id && id !== selectedRef.current) paint(id, 'hover')
          },

          setSelected(id) {
            if (selectedRef.current === id) return
            const previous = selectedRef.current
            selectedRef.current = id
            if (previous) paint(previous, previous === hoveredRef.current ? 'hover' : null)
            if (id) paint(id, 'selected')
          },

          closePopup() {
            map.closePopup()
          },
        }
      },
      [map]
    )

    return null
  }
  )
)
