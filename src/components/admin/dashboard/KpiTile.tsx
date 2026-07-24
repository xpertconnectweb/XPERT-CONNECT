'use client'

import Link from 'next/link'
import type { Icon } from '@phosphor-icons/react'
import { CountUp } from '@/components/ui/CountUp'
import { StatDelta } from './StatDelta'
import { Sparkline } from './Sparkline'
import { cn } from '@/lib/utils'

const TONES = {
  navy: { chip: 'bg-navy/[0.06] text-navy', spark: '#1a2a4a', sparkFill: 'rgba(26,42,74,0.09)' },
  gold: { chip: 'bg-gold/15 text-gold-dark', spark: '#b8923f', sparkFill: 'rgba(212,168,75,0.16)' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600', spark: '#10b981', sparkFill: 'rgba(16,185,129,0.12)' },
  blue: { chip: 'bg-blue-50 text-blue-600', spark: '#3b82f6', sparkFill: 'rgba(59,130,246,0.12)' },
} as const

/**
 * Headline KPI tile: tinted icon chip, animated tabular value, optional delta
 * pill and sparkline. The whole tile is a drill-down link.
 */
export function KpiTile({
  label,
  value,
  icon: IconCmp,
  href,
  delta,
  sub,
  tone = 'navy',
  spark,
}: {
  label: string
  value: number
  icon: Icon
  href: string
  delta?: number | null
  sub?: string
  tone?: keyof typeof TONES
  spark?: number[]
}) {
  const t = TONES[tone]
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-gray-200/70 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300/70 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', t.chip)}>
          <IconCmp className="h-5 w-5" weight="duotone" />
        </span>
        {delta !== undefined && <StatDelta value={delta ?? null} />}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <CountUp
            value={value}
            className="block font-mono text-[28px] font-semibold leading-none tracking-tight text-navy tabular-nums"
          />
          <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400 tabular-nums">{sub}</p>}
        </div>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} stroke={t.spark} fill={t.sparkFill} className="mb-0.5 shrink-0 opacity-90" />
        )}
      </div>
    </Link>
  )
}
