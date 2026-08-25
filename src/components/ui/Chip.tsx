'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Toggleable filter chip.
 *
 * The map had four near-identical hand-rolled chip styles (radius, type
 * toggles, availability, specialty tags), each with its own slightly different
 * padding and selected colour. One component, one shape scale.
 *
 * `aria-pressed` rather than a checkbox role, matching the pattern already
 * proven in AttorneyDirectory and asserted by its e2e spec.
 */

export type ChipTone = 'navy' | 'clinic' | 'lawyer' | 'available'

/**
 * Exported so `Segmented` can wear the same skin.
 *
 * The radius row needs radiogroup semantics but must not change visually — it
 * is one of the few things on this map the client has already signed off on.
 * Sharing the classes rather than duplicating them is what keeps that true as
 * the shape scale evolves.
 */
export const CHIP_TONES: Record<ChipTone, string> = {
  navy: 'bg-navy text-white border-navy shadow-sm',
  clinic: 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/25',
  lawyer: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/25',
  available: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25',
}

export const CHIP_IDLE =
  'bg-gray-50/80 text-gray-500 border-gray-200/40 hover:bg-gray-100/80 hover:text-gray-700'

export const CHIP_BASE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200'

export const CHIP_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1'

const TONES = CHIP_TONES
const IDLE = CHIP_IDLE

export interface ChipProps {
  selected?: boolean
  onToggle?: () => void
  tone?: ChipTone
  /** Trailing count. Rendered dimmer than the label, never as a separate chip. */
  count?: number
  disabled?: boolean
  icon?: ReactNode
  children: ReactNode
  'aria-label'?: string
  'data-testid'?: string
  className?: string
}

export function Chip({
  selected = false,
  onToggle,
  tone = 'navy',
  count,
  disabled = false,
  icon,
  children,
  'aria-label': ariaLabel,
  'data-testid': testId,
  className,
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        CHIP_BASE,
        CHIP_FOCUS,
        // Zero-count values stay in place at reduced opacity rather than
        // disappearing: a rail that reshuffles as you filter is harder to use
        // than one that dims.
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        selected ? TONES[tone] : IDLE,
        className
      )}
    >
      {icon}
      {children}
      {typeof count === 'number' && (
        <span className={cn('tabular-nums', selected ? 'text-white/70' : 'text-gray-400')}>
          {count}
        </span>
      )}
    </button>
  )
}
