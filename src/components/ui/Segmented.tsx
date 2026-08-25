'use client'

import { useCallback, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CHIP_BASE, CHIP_FOCUS, CHIP_IDLE, CHIP_TONES } from './Chip'

/**
 * A group where exactly one option is chosen.
 *
 * The map had two of these built out of loose buttons: the radius row (five
 * independent `Chip`s with `aria-pressed`, no group semantics, and a "RADIUS"
 * label associated with nothing) and, later, the results sort. `aria-pressed`
 * says "this toggle is on"; it cannot say "this is the one of five that is
 * on", which is what both of them mean.
 *
 * Deliberately NOT `role="tablist"`, which the admin date-range control uses.
 * A tablist promises tabpanels, and there are none here.
 *
 * Two skins, one behaviour:
 *   chips  wears `Chip`'s exact classes, so the radius row gains semantics and
 *          keyboard support with no visual change at all
 *   track  a compact inset track, for the results sort
 */
export interface SegmentedOption<T extends string | number> {
  value: T
  label: ReactNode
  /** When the visible label is too terse to stand alone ("5 mi" → "Within 5 miles"). */
  'aria-label'?: string
}

export interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Names the group. Required — a set of radios with no name is a puzzle. */
  label: string
  variant?: 'chips' | 'track'
  className?: string
  'data-testid'?: string
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  variant = 'chips',
  className,
  'data-testid': testId,
}: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null)

  /**
   * Roving tabindex: the group is one tab stop and the arrows move within it.
   * Focus has to follow selection or the ring is left behind on the option the
   * user just moved away from.
   */
  const focusValue = useCallback((next: T) => {
    onChange(next)
    requestAnimationFrame(() => {
      groupRef.current
        ?.querySelector<HTMLButtonElement>(`[data-value="${String(next)}"]`)
        ?.focus()
    })
  }, [onChange])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = options.findIndex((o) => o.value === value)
      if (index < 0) return

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault()
          focusValue(options[(index + 1) % options.length].value)
          return
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault()
          focusValue(options[(index - 1 + options.length) % options.length].value)
          return
        case 'Home':
          event.preventDefault()
          focusValue(options[0].value)
          return
        case 'End':
          event.preventDefault()
          focusValue(options[options.length - 1].value)
          return
        default:
      }
    },
    [options, value, focusValue]
  )

  const isTrack = variant === 'track'

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      onKeyDown={handleKeyDown}
      className={cn(
        isTrack
          ? 'inline-flex rounded-xl border border-gray-200/80 bg-gray-50/80 p-0.5'
          : 'flex flex-wrap items-center gap-1.5',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option['aria-label']}
            // Only the selected option is reachable by Tab; the arrows do the rest.
            tabIndex={selected ? 0 : -1}
            data-value={String(option.value)}
            onClick={() => onChange(option.value)}
            className={cn(
              isTrack
                ? cn(
                    'rounded-lg px-3 py-1.5 text-[11px] font-semibold tabular-nums transition-all duration-200',
                    CHIP_FOCUS,
                    selected
                      ? 'bg-white text-navy shadow-sm ring-1 ring-gray-200/60'
                      : 'text-gray-400 hover:text-gray-600'
                  )
                : cn(CHIP_BASE, CHIP_FOCUS, 'cursor-pointer', selected ? CHIP_TONES.navy : CHIP_IDLE)
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
