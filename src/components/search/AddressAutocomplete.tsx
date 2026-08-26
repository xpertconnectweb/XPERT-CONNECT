'use client'

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SmartSearchBox } from './SmartSearchBox'
import type { Suggestion, SuggestionGroup } from './types'
import { useGeocoder, type ProximityHint } from '@/hooks/useGeocoder'
import { isExactPrecision } from '@/lib/geocoding/precision'
import { ATTRIBUTION, MIN_GEOCODE_QUERY } from '@/lib/geocoding/constants'
import { toResolvedAddress, type ResolvedAddress } from '@/types/geocode'

/**
 * Leaflet touches `window` at import time, and this component is rendered
 * inside admin pages that are otherwise server-friendly. Loading it lazily also
 * keeps the map chunk out of every form that never resolves an address.
 */
const AddressConfirmMap = dynamic(
  () => import('./AddressConfirmMap').then((m) => m.AddressConfirmMap),
  { ssr: false, loading: () => <div className="h-60 w-full animate-pulse rounded-lg bg-gray-100" /> }
)

/**
 * One address field, used everywhere an address is typed.
 *
 * A wrapper around `SmartSearchBox` rather than a replacement for it. That
 * component is 400-odd lines of WAI-ARIA 1.2 combobox that gets the awkward
 * parts right — options are `div[role="option"]` rather than buttons, focus
 * stays on the input with `aria-activedescendant` doing the pointing, Escape
 * closes then clears, the spinner is delayed so it cannot flash, and skeleton
 * rows reserve height so the list never jumps under the cursor. Rebuilding that
 * on a combobox library would throw the work away and take its tests with it.
 *
 * What this adds is everything `SmartSearchBox` deliberately does not know
 * about: geocoding, resolution, precision, and the shape a form needs back.
 *
 * Three places now share it — the clinic and lawyer admin forms and the
 * referral form — which is the point. Before, each was a bare `<input>` with a
 * placeholder reading "Street, City, State, ZIP", and the admin form asked for
 * latitude and longitude as two number fields beside it. That is where the rows
 * sitting at (0, 0) came from.
 */

export interface AddressAutocompleteProps {
  /** The visible field label. Rendered here because a combobox has none. */
  label: string
  /** The current one-line address text. */
  value: string
  onChange: (value: string) => void
  /**
   * Fires when the user picks a suggestion and it resolves to coordinates.
   * Null when they edit the text afterwards, so a stale point cannot be saved
   * against an address that no longer matches it.
   */
  onResolved: (address: ResolvedAddress | null) => void
  resolved?: ResolvedAddress | null
  required?: boolean
  placeholder?: string
  proximity?: ProximityHint | null
  /**
   * Show a small map with a draggable pin once an address resolves.
   *
   * For the write paths — the admin forms — where the coordinate is about to be
   * stored and measured from. The search box on the main map does not need it:
   * it already has a full map with the same draggable pin on it.
   */
  confirmOnMap?: boolean
  /** Free-text help under the field. */
  hint?: string
  className?: string
  /**
   * REQUIRED, and not defaulted on purpose.
   *
   * `SmartSearchBox` defaults its own to `map-search`, and three E2E specs plus
   * a component test drive the map through `map-search-input`. An unlabelled
   * second instance on an admin page would start resolving those selectors and
   * the failures would look like map bugs.
   */
  'data-testid': string
}

export function AddressAutocomplete({
  label,
  value,
  onChange,
  onResolved,
  resolved = null,
  required = false,
  placeholder = 'Start typing an address…',
  proximity = null,
  confirmOnMap = false,
  hint,
  className,
  'data-testid': testId,
}: AddressAutocompleteProps) {
  const [resolving, setResolving] = useState(false)
  const geocode = useGeocoder(value, { proximity, limit: 5, enabled: !resolved })

  const groups = useMemo<SuggestionGroup[]>(() => {
    // Nothing to offer once an address has been chosen — the lookup is disabled
    // and the field is showing an answer. Without this the dropdown would open
    // on focus and say "keep typing" underneath a perfectly good address.
    if (resolved) return []

    const items: Suggestion[] = geocode.results.map((result) => ({
      id: `addr-${result.id}`,
      kind: 'place' as const,
      label: result.label,
      sublabel: result.fullLabel === result.label ? undefined : result.fullLabel,
      meta: isExactPrecision(result.precision) ? undefined : 'Approximate',
      metaTone: 'warning' as const,
      payload: { kind: 'place' as const, suggestion: result },
    }))

    return [
      {
        key: 'address',
        heading: 'Addresses',
        items,
        // Below the geocoder's minimum this says "keep typing" rather than
        // rendering nothing, which is what the map used to do and what led
        // people to retype addresses that were already correct.
        status: value.trim().length < MIN_GEOCODE_QUERY ? 'idle' : geocode.status,
        emptyHint: `No match for "${value.trim()}". Check the spelling, or try the ZIP.`,
        attribution: geocode.results[0]
          ? ATTRIBUTION[geocode.results[0].providerId]
          : undefined,
      },
    ]
  }, [geocode.results, geocode.status, value, resolved])

  const handleSelect = useCallback(
    async (suggestion: Suggestion) => {
      if (suggestion.payload.kind !== 'place') return
      setResolving(true)
      try {
        const result = await geocode.resolve(suggestion.payload.suggestion)
        if (!result) {
          // Leave the typed text alone. Wiping it here would make a transient
          // network failure look like the user mistyped.
          return
        }
        const address = toResolvedAddress(result)
        onChange(address.formatted)
        onResolved(address)
      } finally {
        setResolving(false)
      }
    },
    [geocode, onChange, onResolved]
  )

  const handleChange = useCallback(
    (next: string) => {
      onChange(next)
      // Editing after choosing invalidates the point. Without this, someone
      // could pick "123 Main St", edit it to "456 Main St", save, and store the
      // second address against the first one's coordinates.
      if (resolved) onResolved(null)
    },
    [onChange, onResolved, resolved]
  )

  const approximate = resolved !== null && !isExactPrecision(resolved.precision)

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={`${testId}-input`}
        className="block text-sm font-medium text-gray-700"
      >
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      <SmartSearchBox
        value={value}
        onChange={handleChange}
        // Enter with nothing highlighted keeps the literal text. An address
        // the provider has never heard of is still the address on the file.
        onSubmit={() => {}}
        onSelect={handleSelect}
        groups={groups}
        loading={geocode.loading || resolving}
        placeholder={placeholder}
        aria-label={label}
        inputId={`${testId}-input`}
        data-testid={testId}
      />

      {resolved && (
        <p
          data-testid={`${testId}-resolved`}
          className={cn(
            'flex items-center gap-1.5 text-[11px]',
            approximate ? 'text-amber-700' : 'text-gray-500'
          )}
        >
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">
            {resolved.lat.toFixed(5)}, {resolved.lng.toFixed(5)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{resolved.precision}</span>
          {approximate && <span>— drag the pin to correct it</span>}
        </p>
      )}

      {confirmOnMap && resolved && (
        <AddressConfirmMap
          address={resolved}
          onMove={(moved) => {
            onResolved(moved)
            onChange(moved.formatted)
          }}
          data-testid={`${testId}-map`}
        />
      )}

      {!resolved && hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  )
}
