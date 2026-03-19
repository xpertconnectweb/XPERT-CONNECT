'use client'

import { useState, useRef } from 'react'
import { GripVertical, X } from 'lucide-react'

interface SortableListProps {
  items: string[]
  onChange: (items: string[]) => void
}

export function SortableList({ items, onChange }: SortableListProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  const handleDragStart = (idx: number) => {
    dragRef.current = idx
    setDragIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setOverIdx(idx)
  }

  const handleDrop = (idx: number) => {
    const from = dragRef.current
    if (from === null || from === idx) {
      setDragIdx(null)
      setOverIdx(null)
      return
    }
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    onChange(next)
    setDragIdx(null)
    setOverIdx(null)
    dragRef.current = null
  }

  const handleDragEnd = () => {
    setDragIdx(null)
    setOverIdx(null)
  }

  const removeItem = (idx: number) => {
    const next = [...items]
    next.splice(idx, 1)
    onChange(next)
  }

  return (
    <ul className="space-y-1">
      {items.map((item, idx) => (
        <li
          key={`${item}-${idx}`}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={() => handleDrop(idx)}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all cursor-grab active:cursor-grabbing ${
            dragIdx === idx
              ? 'opacity-50 border-gold bg-gold/5'
              : overIdx === idx
              ? 'border-gold border-dashed bg-gold/5'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
          <span className="flex-1 text-gray-700">{item}</span>
          <button
            onClick={() => removeItem(idx)}
            className="text-gray-300 hover:text-red-500 transition-colors"
            aria-label={`Remove ${item}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
