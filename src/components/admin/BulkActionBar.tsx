'use client'

import { X, Trash2, Eye, EyeOff, Download } from 'lucide-react'

interface BulkActionBarProps {
  count: number
  entityType: 'clinic' | 'lawyer' | 'user'
  onMakeAvailable?: () => void
  onMakeUnavailable?: () => void
  onExportCSV?: () => void
  onDelete: () => void
  onClear: () => void
}

export function BulkActionBar({
  count,
  entityType,
  onMakeAvailable,
  onMakeUnavailable,
  onExportCSV,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl px-5 py-3 text-white shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom-4"
      style={{ background: 'linear-gradient(135deg, #1a2a4a, #2a3f6a)' }}
    >
      <span className="text-sm font-medium whitespace-nowrap">
        {count} selected
      </span>

      <div className="h-5 w-px bg-white/20" />

      {entityType !== 'user' && (
        <>
          {onMakeAvailable && (
            <button
              onClick={onMakeAvailable}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              Make Available
            </button>
          )}
          {onMakeUnavailable && (
            <button
              onClick={onMakeUnavailable}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Make Unavailable
            </button>
          )}
          {onExportCSV && (
            <button
              onClick={onExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </>
      )}

      <button
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-red-500/80 hover:bg-red-500 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>

      <div className="h-5 w-px bg-white/20" />

      <button
        onClick={onClear}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  )
}
