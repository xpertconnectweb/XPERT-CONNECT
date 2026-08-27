'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
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

  /**
   * Arrow keys walk the whole list, not just the rendered window.
   *
   * Every row's focus button is a real `<button>`, and react-window keeps
   * about twenty of four hundred rows in the DOM — so Tab reached row twenty
   * and then left the list entirely. The browser will not scroll a virtual
   * list to find the next focusable, because as far as it is concerned there
   * is nothing further to find. Four hundred results, twenty reachable.
   *
   * Scroll first, then focus on the next frame: the row does not exist until
   * react-window has rendered it.
   */
  const move = useCallback(
    (to: number) => {
      const index = Math.max(0, Math.min(items.length - 1, to))
      listRef.current?.scrollToRow({ index, align: 'auto', behavior: 'auto' })

      /**
       * Focus the row once it exists, retrying for a few frames.
       *
       * Scrolling unmounts the row the focus was on, which drops focus to the
       * body, and react-window renders the new window off its own scroll
       * handler — so on a long jump the target is reliably NOT there on the
       * next frame. One `requestAnimationFrame` worked for a step of one and
       * silently did nothing for End, which is the worst of both.
       *
       * Six frames is about a tenth of a second: long enough for a jump to the
       * end of four hundred rows, short enough that a failure is a dropped
       * focus rather than a hang.
       */
      let attempts = 6
      const grab = () => {
        const rows = containerRef.current?.querySelectorAll<HTMLElement>(
          '[data-testid="map-panel-row-focus"]'
        )
        // The rendered window is a slice of the list, so the nth row on screen
        // is not the nth row overall. Match on where the scroll landed.
        const target = rows
          ? Array.from(rows).find(
              (row) =>
                row.closest('[aria-posinset]')?.getAttribute('aria-posinset') ===
                String(index + 1)
            )
          : undefined

        if (target) target.focus()
        else if (--attempts > 0) requestAnimationFrame(grab)
      }
      requestAnimationFrame(grab)
    },
    [items.length, listRef]
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const active = document.activeElement as HTMLElement | null
      const posinset = active?.closest('[aria-posinset]')?.getAttribute('aria-posinset')
      if (!posinset) return
      const at = Number(posinset) - 1

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          move(at + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          move(at - 1)
          break
        case 'Home':
          event.preventDefault()
          move(0)
          break
        case 'End':
          event.preventDefault()
          move(items.length - 1)
          break
        case 'PageDown':
          event.preventDefault()
          move(at + 10)
          break
        case 'PageUp':
          event.preventDefault()
          move(at - 10)
          break
        default:
      }
    },
    [move, items.length]
  )

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
      onKeyDown={onKeyDown}
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
