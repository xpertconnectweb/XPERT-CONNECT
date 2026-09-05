'use client'

import { metaFor } from './area-meta'

/**
 * The "types of lawyer" grid: one toggle card per practice area, each
 * carrying a live count of the firms behind it.
 *
 * Extracted from AttorneyDirectory so the public directory renders the
 * identical control. Markup is unchanged from that original, including
 * `data-testid="practice-area-card"` and the `aria-pressed` toggle that
 * e2e/specs/directory/browse-and-filter.spec.ts asserts on.
 */
export function PracticeAreaCards({
  areas,
  counts,
  selected,
  onSelect,
  className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3',
}: {
  areas: string[]
  counts: Map<string, number>
  selected: string
  onSelect: (area: string) => void
  className?: string
}) {
  if (areas.length === 0) return null

  return (
    <div className={className}>
      {areas.map((a) => {
        const { icon: Icon, accent } = metaFor(a)
        const count = counts.get(a) ?? 0
        const isSelected = selected === a
        return (
          <button
            key={a}
            type="button"
            data-testid="practice-area-card"
            aria-pressed={isSelected}
            onClick={() => onSelect(isSelected ? '' : a)}
            className={`group flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-all duration-200 ${
              isSelected
                ? 'border-gold bg-gold/5 shadow-md shadow-gold/10 -translate-y-px'
                : 'border-gray-200/80 bg-white shadow-sm hover:border-gray-300 hover:shadow-md hover:-translate-y-px'
            }`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-semibold text-sm text-gray-900 leading-tight">{a}</span>
            <span className="text-[11px] font-medium text-gray-400">
              {count} {count === 1 ? 'firm' : 'firms'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
