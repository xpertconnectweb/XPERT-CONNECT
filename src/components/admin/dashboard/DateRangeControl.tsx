'use client'

import { cn } from '@/lib/utils'
import type { StatsRange } from '@/lib/admin-stats'

const OPTIONS: { value: StatsRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '12mo', label: '12M' },
]

/** Segmented control that drives the dashboard's period. */
export function DateRangeControl({
  value,
  onChange,
  disabled = false,
}: {
  value: StatsRange
  onChange: (r: StatsRange) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-gray-200/80 bg-gray-50/80 p-0.5" role="tablist" aria-label="Date range">
      {OPTIONS.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-all duration-200 disabled:opacity-50',
              active ? 'bg-white text-navy shadow-sm ring-1 ring-gray-200/60' : 'text-gray-400 hover:text-gray-600'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
