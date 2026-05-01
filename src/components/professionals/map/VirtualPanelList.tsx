'use client'

import { useEffect, useState, useRef } from 'react'
import { List as VirtualList } from 'react-window'
import { MapPin } from 'lucide-react'
import type { MapItem } from '@/lib/map/types'
import { PanelRow } from './PanelRow'

type VirtualRowProps = { items: MapItem[]; onFocus: (item: MapItem) => void }

function VirtualPanelRow({
  index,
  style,
  items,
  onFocus,
}: {
  index: number
  style: React.CSSProperties
  ariaAttributes: object
  items: MapItem[]
  onFocus: (item: MapItem) => void
}) {
  const item = items[index]
  return (
    <div style={style}>
      <PanelRow item={item} onFocus={onFocus} />
    </div>
  )
}

export function VirtualPanelList({ items, onFocus }: { items: MapItem[]; onFocus: (item: MapItem) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
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

  if (items.length === 0) {
    return (
      <div className="flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="p-12 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <MapPin className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-400">No results found</p>
          <p className="text-xs text-gray-300 mt-1.5">Try adjusting your search or filters</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <VirtualList<VirtualRowProps>
        style={{ height }}
        rowCount={items.length}
        rowHeight={80}
        overscanCount={5}
        rowProps={{ items, onFocus }}
        rowComponent={VirtualPanelRow}
      />
    </div>
  )
}
