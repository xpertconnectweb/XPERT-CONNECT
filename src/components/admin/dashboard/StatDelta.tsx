import { TrendUp, TrendDown, Minus } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'

/**
 * Period-over-period delta pill. `value` is a signed percentage, or null
 * when there is no prior-period baseline ("New").
 */
export function StatDelta({ value, className }: { value: number | null; className?: string }) {
  if (value === null) {
    return (
      <span className={cn('inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600', className)}>
        New
      </span>
    )
  }

  const flat = value === 0
  const up = value > 0
  const Icon = flat ? Minus : up ? TrendUp : TrendDown
  const tone = flat
    ? 'bg-gray-100 text-gray-500'
    : up
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-red-50 text-red-600'

  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums', tone, className)}>
      <Icon className="h-3 w-3" weight="bold" />
      {up ? '+' : ''}{value}%
    </span>
  )
}
