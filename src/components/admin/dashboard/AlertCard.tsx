import Link from 'next/link'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const TONES = {
  amber: { wrap: 'border-amber-200/70 bg-amber-50/70 text-amber-800', chip: 'bg-amber-100 text-amber-700' },
  red: { wrap: 'border-red-200/70 bg-red-50/70 text-red-800', chip: 'bg-red-100 text-red-600' },
  blue: { wrap: 'border-blue-200/70 bg-blue-50/70 text-blue-800', chip: 'bg-blue-100 text-blue-600' },
} as const

/**
 * Actionable alert — renders only when it matters (caller gates on count > 0).
 * Links to the pre-filtered admin page that resolves the alert.
 */
export function AlertCard({
  count,
  label,
  href,
  tone,
  icon: IconCmp,
}: {
  count: number
  label: string
  href: string
  tone: keyof typeof TONES
  icon: Icon
}) {
  const t = TONES[tone]
  return (
    <Link
      href={href}
      className={cn('group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card', t.wrap)}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', t.chip)}>
        <IconCmp className="h-5 w-5" weight="duotone" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-lg font-semibold leading-none tabular-nums">{count}</p>
        <p className="mt-1 truncate text-xs font-medium opacity-80">{label}</p>
      </div>
      <CaretRight className="h-4 w-4 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5" weight="bold" />
    </Link>
  )
}
