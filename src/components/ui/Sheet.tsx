'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet with snap points.
 *
 * Hand-rolled rather than pulled from a library: the project has no animation
 * dependency (no framer-motion, no vaul), and adding one for a single surface
 * would cost more bundle than the ~120 lines below.
 *
 * The three snap points exist because a results list on a phone has three
 * genuinely different jobs: stay out of the way while you look at the map
 * (peek), let you compare a few results against the map (half), and let you
 * scan the whole list (full).
 */

export type SheetSnap = 'peek' | 'half' | 'full'

/** Fraction of the container height the sheet occupies at each snap point. */
const SNAP_FRACTION: Record<SheetSnap, number> = {
  peek: 0.12,
  half: 0.5,
  full: 0.92,
}

const ORDER: SheetSnap[] = ['peek', 'half', 'full']

/** Drag further than this and the sheet moves on rather than springing back. */
const COMMIT_RATIO = 0.06

export interface SheetProps {
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  /** Rendered inside the drag handle row, e.g. a result count. */
  handleLabel?: ReactNode
  children: ReactNode
  className?: string
  'aria-label'?: string
  'data-testid'?: string
}

export function Sheet({
  snap,
  onSnapChange,
  handleLabel,
  children,
  className,
  'aria-label': ariaLabel = 'Results',
  'data-testid': testId,
}: SheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startYRef = useRef(0)

  useEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height)
    })
    observer.observe(parent)
    setContainerHeight(parent.clientHeight)
    return () => observer.disconnect()
  }, [])

  const heightFor = (value: SheetSnap) => containerHeight * SNAP_FRACTION[value]
  const restingHeight = heightFor(snap)

  const commit = useCallback(
    (deltaY: number) => {
      // Dragging up is negative deltaY, which should grow the sheet.
      const target = restingHeight - deltaY
      const threshold = containerHeight * COMMIT_RATIO
      if (Math.abs(deltaY) < threshold) return

      // Snap to whichever point the release landed nearest.
      let nearest: SheetSnap = snap
      let best = Infinity
      for (const candidate of ORDER) {
        const distance = Math.abs(heightFor(candidate) - target)
        if (distance < best) {
          best = distance
          nearest = candidate
        }
      }
      if (nearest !== snap) onSnapChange(nearest)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restingHeight, containerHeight, snap, onSnapChange]
  )

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    startYRef.current = event.clientY
    setDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragOffset(event.clientY - startYRef.current)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
    commit(event.clientY - startYRef.current)
    setDragOffset(0)
  }

  /** Arrow keys move between snap points, so the sheet is not drag-only. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = ORDER.indexOf(snap)
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      onSnapChange(ORDER[Math.min(index + 1, ORDER.length - 1)])
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      onSnapChange(ORDER[Math.max(index - 1, 0)])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSnapChange(snap === 'full' ? 'peek' : 'full')
    }
  }

  const height = containerHeight
    ? Math.max(0, Math.min(restingHeight - dragOffset, heightFor('full')))
    : undefined

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{ height, paddingBottom: 'env(safe-area-inset-bottom)' }}
      className={cn(
        'absolute inset-x-0 bottom-0 z-[601] flex flex-col overflow-hidden rounded-t-2xl border-t border-gray-200/60 bg-white/[0.97] shadow-2xl backdrop-blur-xl',
        // No transition mid-drag, or the sheet lags behind the finger.
        !dragging && 'transition-[height] duration-300 ease-out motion-reduce:transition-none',
        className
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Resize results panel. Currently ${snap}.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        // Only the handle opts out of native scrolling; the list below must
        // still scroll normally.
        style={{ touchAction: 'none' }}
        className="flex shrink-0 cursor-grab select-none flex-col items-center gap-1.5 px-5 pb-2 pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold active:cursor-grabbing"
      >
        <span className="h-1 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        {handleLabel}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
