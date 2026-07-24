import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/**
 * Consistent framed section for the dashboard — replaces the repeated inline
 * `rounded-2xl bg-white p-6 shadow-sm border` blocks. Optional right-aligned
 * `action` node, or a `viewAllHref` drill-down link.
 */
export function SectionCard({
  title,
  subtitle,
  action,
  viewAllHref,
  viewAllLabel = 'View all',
  className,
  bodyClassName,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  viewAllHref?: string
  viewAllLabel?: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className={cn('flex flex-col rounded-2xl border border-gray-200/70 bg-white shadow-card', className)}>
      <header className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] font-semibold tracking-tight text-navy">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {action ??
          (viewAllHref && (
            <Link
              href={viewAllHref}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-navy"
            >
              {viewAllLabel}
              <ArrowRight className="h-3.5 w-3.5" weight="bold" />
            </Link>
          ))}
      </header>
      <div className={cn('px-5 pb-5 pt-4', bodyClassName)}>{children}</div>
    </section>
  )
}
