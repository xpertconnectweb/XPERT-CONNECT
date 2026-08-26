'use client'

import { memo } from 'react'
import { Building2, Scale, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canRefer, referLabel } from '@/lib/map/referral-policy'
import type { MapItem } from '@/lib/map/types'

/**
 * One result.
 *
 * The whole row used to be a single `<button>`. That made the referral action
 * impossible to add without nesting interactive elements — invalid HTML, and
 * the same fault that was already fixed once in the search dropdown. So the row
 * is now a container with two focusable children: the primary button, which
 * focuses the pin, and the Refer button.
 *
 * Refer is always visible rather than revealed on hover. Half the traffic is a
 * phone, which has no hover, and referring a patient is one of the two things
 * this screen exists for — hiding it behind a pointer penalises exactly the
 * user who came to act.
 */
export const PanelRow = memo(function PanelRow({
  item,
  onFocus,
  onHover,
  onRefer,
  userRole,
  hovered = false,
  selected = false,
}: {
  item: MapItem
  onFocus: (item: MapItem) => void
  onHover?: (id: string | null) => void
  onRefer?: (item: MapItem) => void
  userRole?: string
  /** Booleans rather than ids, so `memo` only re-renders the two rows involved. */
  hovered?: boolean
  selected?: boolean
}) {
  const isClinic = item.type === 'clinic'
  const allowed = Boolean(onRefer) && canRefer(userRole, item)
  const tags = (isClinic ? item.specialties : item.practiceAreas) ?? []

  return (
    <div
      onMouseEnter={() => onHover?.(item.id)}
      onMouseLeave={() => onHover?.(null)}
      aria-current={selected ? 'true' : undefined}
      data-testid="map-panel-row"
      className={cn(
        'group relative flex w-full items-start gap-3 border-b border-gray-100/80 px-5 py-3.5 transition-all duration-200',
        selected
          ? 'border-l-2 border-l-gold bg-gold/[0.07] pl-[18px]'
          : hovered
            ? 'bg-gradient-to-r from-gray-50/80 to-transparent'
            : 'hover:bg-gradient-to-r hover:from-gray-50/80 hover:to-transparent'
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
          isClinic ? 'bg-sky-50 text-sky-600' : 'bg-red-50 text-red-600'
        )}
        aria-hidden="true"
      >
        {isClinic ? <Building2 className="h-3.5 w-3.5" /> : <Scale className="h-3.5 w-3.5" />}
      </div>

      <div className="min-w-0 flex-1">
        {/* The primary target. Stretched over the row so the whole card is
            clickable, with the Refer button lifted above it by z-index. */}
        <button
          type="button"
          onClick={() => onFocus(item)}
          onFocus={() => onHover?.(item.id)}
          onBlur={() => onHover?.(null)}
          data-testid="map-panel-row-focus"
          aria-label={`Show ${item.name} on the map`}
          // `block w-full` is load-bearing, not tidiness. Without it the button
          // is only as wide as its content, so a long provider name makes the
          // inner flex row wider than the panel and pushes the distance badge
          // off the right edge -- `flex-shrink-0` keeps the badge its full size
          // and `truncate` on the name never fires because the name is not the
          // thing being constrained. On a 390px phone
          // "Madison Healthcare Services Rehabilitation" clipped its distance
          // to "226.".
          className="block w-full text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
        >
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                'truncate text-[13px] font-semibold leading-tight transition-colors',
                selected ? 'text-navy' : 'text-gray-900 group-hover:text-navy'
              )}
            >
              {item.name}
            </h3>
            <span className="flex-shrink-0 whitespace-nowrap rounded-md bg-gray-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500">
              {item.distance.toFixed(1)} mi
            </span>
          </div>

          {/* Falls back to the coarse location when the API withholds the street. */}
          {(item.address || item.city) && (
            <p className="mt-1 truncate text-[11px] leading-snug text-gray-500">
              {item.address ?? [item.city, item.state, item.zipCode].filter(Boolean).join(', ')}
            </p>
          )}
        </button>

        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold',
              item.available ? 'text-emerald-600' : 'text-gray-400'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                item.available ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-gray-300'
              )}
            />
            {item.available ? 'Available' : 'Unavailable'}
          </span>

          {/* Real chips rather than 10px grey text joined by a middle dot —
              these are the same values the filter rail offers. */}
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className={cn(
                'truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                isClinic ? 'bg-sky-50/70 text-sky-700' : 'bg-red-50/70 text-red-700'
              )}
            >
              {tag}
            </span>
          ))}
          {tags.length > 2 && (
            <span className="flex-shrink-0 text-[10px] text-gray-400">+{tags.length - 2}</span>
          )}
        </div>
      </div>

      {allowed && (
        <div className="relative z-10 mt-0.5 flex-shrink-0 self-center">
          {item.available ? (
            <button
              type="button"
              onClick={() => onRefer?.(item)}
              data-testid="map-panel-refer"
              // Distinct from the popup's "Send Referral" / "Refer Patient", so
              // an e2e locator for one cannot match the other.
              aria-label={`Refer a patient to ${item.name}`}
              title={referLabel(userRole)}
              className="inline-flex items-center gap-1 rounded-lg bg-gold px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-gold/30 transition-all duration-200 hover:bg-gold-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1"
            >
              <Send className="h-3 w-3" aria-hidden="true" />
              Refer
            </button>
          ) : (
            <span className="text-[10px] italic text-gray-400">Not accepting</span>
          )}
        </div>
      )}
    </div>
  )
})
