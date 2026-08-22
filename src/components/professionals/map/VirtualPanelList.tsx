'use client'

import { useEffect, useState, useRef } from 'react'
import { List as VirtualList, useListRef } from 'react-window'
import { MapPin } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import type { MapItem } from '@/lib/map/types'
import { PanelRow } from './PanelRow'

type VirtualRowProps = {
  items: MapItem[]
  onFocus: (item: MapItem) => void
  onHover?: (id: string | null) => void
  hoveredId?: string | null
  selectedId?: string | null
}

function VirtualPanelRow({
  index,
  style,
  items,
  onFocus,
  onHover,
  hoveredId,
  selectedId,
}: {
  index: number
  style: React.CSSProperties
  ariaAttributes: object
  items: MapItem[]
  onFocus: (item: MapItem) => void
  onHover?: (id: string | null) => void
  hoveredId?: string | null
  selectedId?: string | null
}) {
  const item = items[index]
  return (
    <div style={style}>
      <PanelRow
        item={item}
        onFocus={onFocus}
        onHover={onHover}
        hovered={hoveredId === item.id}
        selected={selectedId === item.id}
      />
    </div>
  )
}

export interface ScrollRequest {
  id: string
  /** Bumped per request, so the same id can be requested twice. */
  nonce: number
}

export function VirtualPanelList({
  items,
  onFocus,
  onHover,
  hoveredId = null,
  selectedId = null,
  scrollTo = null,
}: {
  items: MapItem[]
  onFocus: (item: MapItem) => void
  onHover?: (id: string | null) => void
  hoveredId?: string | null
  selectedId?: string | null
  /** Set only by map-originated events; panel interaction must never scroll. */
  scrollTo?: ScrollRequest | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useListRef(null)
  const [height, setHeight] = useState(400)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setHeight(entry.contentRect.height)
    })
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // Touching a pin on the map scrolls the matching row into view, so the two
  // halves of the screen agree on what you are looking at. Virtualized rows
  // are not in the DOM until scrolled to, so this has to be imperative.
  //
  // Driven by an explicit request from the map rather than by `hoveredId`,
  // which would fight the user: scrolling the panel drags the cursor across
  // rows, each hover re-ran this effect, and it yanked the list straight back
  // to the selected row. The list became impossible to scroll.
  //
  // The nonce matters — hovering the same pin twice must scroll twice.
  const lastScrollRef = useRef(-1)
  useEffect(() => {
    if (!scrollTo || scrollTo.nonce === lastScrollRef.current) return
    lastScrollRef.current = scrollTo.nonce
    const index = items.findIndex((item) => item.id === scrollTo.id)
    if (index < 0) return
    listRef.current?.scrollToRow({ index, align: 'auto', behavior: 'auto' })
  }, [scrollTo, items, listRef])

  if (items.length === 0) {
    return (
      <div className="flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <EmptyState
          icon={MapPin}
          title="No results found"
          hint="Try a different search, or clear a filter."
          data-testid="map-panel-empty"
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1"
      data-testid="map-panel-list"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <VirtualList<VirtualRowProps>
        listRef={listRef}
        style={{ height }}
        rowCount={items.length}
        rowHeight={80}
        overscanCount={5}
        rowProps={{ items, onFocus, onHover, hoveredId, selectedId }}
        rowComponent={VirtualPanelRow}
      />
    </div>
  )
}
