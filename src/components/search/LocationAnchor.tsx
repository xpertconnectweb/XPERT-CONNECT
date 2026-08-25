'use client'

import { Home, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatGeocodeLines } from '@/lib/address'
import type { GeocodeAddress } from '@/types/geocode'

/**
 * The "searching around here" row.
 *
 * This used to live inside `SmartSearchBox` as an early return that replaced
 * the input entirely, which meant that once you picked an address you could no
 * longer filter by name or specialty without clearing the location — and
 * clearing it also wiped the radius and recentred the map. Where you are
 * searching and what you are searching for are two independent things, so they
 * get two independent controls.
 *
 * It is deliberately a sibling of the combobox rather than a child. The box
 * closes its listbox by checking whether focus left its own subtree
 * (`SmartSearchBox`'s `handleBlur`), so a focusable "clear" button inside that
 * wrapper would leave the listbox open with focus outside it.
 *
 * Two lines, not one: the street tells you which building, the "city, ST ZIP"
 * tail tells you the geocoder understood you. That second line is the whole
 * point — the old chip showed Nominatim's raw label, so a search for
 * "Gainesville, FL 32608" came back reading "Daysville".
 */
export interface LocationAnchorProps {
  /** One-line form, used when there are no structured components. */
  label: string
  address?: GeocodeAddress | null
  onClear: () => void
  /** The pin has been dragged off what the search returned. */
  adjusted?: boolean
  /** Resolving the address the pin was just dropped on. */
  resolving?: boolean
  onReset?: () => void
  className?: string
  'data-testid'?: string
}

export function LocationAnchor({
  label,
  address,
  onClear,
  adjusted = false,
  resolving = false,
  onReset,
  className,
  'data-testid': testId = 'map-search-chip',
}: LocationAnchorProps) {
  const { primary, secondary } = formatGeocodeLines(address, label)

  return (
    <div
      className={cn(
        'relative flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.07] py-2 pl-3 pr-9',
        className
      )}
      data-testid={testId}
    >
      {/* Echoes the house pin dropped on the map, so the row and the marker
          read as the same object. */}
      <Home className="h-4 w-4 shrink-0 text-gold-dark" aria-hidden="true" />

      <div className="min-w-0 flex-1 leading-tight">
        <p className={cn('truncate text-[13px] font-semibold text-navy', resolving && 'opacity-60')}>
          {primary}
        </p>
        {secondary && <p className="truncate text-[11px] text-gray-500">{secondary}</p>}

        {/* Says the pin was moved, and offers the way back.
            On a general-purpose map nobody needs this. Here the anchor decides
            which clinics count as nearest for one specific client, so a drag
            nobody meant to make would re-rank the list silently. */}
        {adjusted && !resolving && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="font-medium text-gold-dark">Pin adjusted</span>
            {onReset && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onReset}
                  data-testid="map-anchor-reset"
                  className="font-semibold text-navy/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  Undo
                </button>
              </>
            )}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear location"
        data-testid="map-search-anchor-clear"
        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
