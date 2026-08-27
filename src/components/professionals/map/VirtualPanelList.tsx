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
  onOpen?: (item: MapItem) => void
  onHover?: (id: string | null) => void
  onRefer?: (item: MapItem) => void
  userRole?: string
  hoveredId?: string | null
  selectedId?: string | null
}

function VirtualPanelRow({
  index,
  style,
  ariaAttributes,
  items,
  onFocus,
  onOpen,
  onHover,
  onRefer,
  userRole,
  hoveredId,
  selectedId,
}: {
  index: number
  style: React.CSSProperties
  ariaAttributes: object
  items: MapItem[]
  onFocus: (item: MapItem) => void
  onOpen?: (item: MapItem) => void
  onHover?: (id: string | null) => void
  onRefer?: (item: MapItem) => void
  userRole?: string
  hoveredId?: string | null
  selectedId?: string | null
}) {
  const item = items[index]
  return (
    // `ariaAttributes` carries react-window's `role="listitem"` plus the
    // `aria-posinset`/`aria-setsize` pair. It was declared in this component's
    // props and then never spread onto anything, so a screen reader saw an
    // arbitrary ~15-row window of a 400-row list with no sense of where it was
    // or how much there was.
    <div style={style} {...ariaAttributes}>
      <PanelRow
        item={item}
        onFocus={onFocus}
        onOpen={onOpen}
        onHover={onHover}
        onRefer={onRefer}
        userRole={userRole}
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
  onOpen,
  onHover,
  onRefer,
  userRole,
  hoveredId = null,
  selectedId = null,
  scrollTo = null,
  emptyState,
}: {
  items: MapItem[]
  onFocus: (item: MapItem) => void
  onOpen?: (item: MapItem) => void
  onHover?: (id: string | null) => void
  onRefer?: (item: MapItem) => void
  userRole?: string
  /** Replaces the default "nothing found" panel, so the caller can offer a way out. */
  emptyState?: React.ReactNode
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
        {/* The caller can offer a real way out — a spelling correction, a wider
            radius — instead of the generic hint this used to end on. */}
        {emptyState ?? (
          <EmptyState
            icon={MapPin}
            title="No results found"
            hint="Try a different search, or clear a filter."
            data-testid="map-panel-empty"
          />
        )}
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
        role="list"
        aria-label={`${items.length} ${items.length === 1 ? 'result' : 'results'}`}
        rowHeight={96}
        overscanCount={5}
        rowProps={{ items, onFocus, onOpen, onHover, onRefer, userRole, hoveredId, selectedId }}
        rowComponent={VirtualPanelRow}
      />
    </div>
  )
}
