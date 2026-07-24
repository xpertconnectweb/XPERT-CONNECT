'use client'

import type { ReactNode } from 'react'
import { SectionCard } from './SectionCard'

/**
 * SectionCard specialised for a fixed-height chart body, with a real empty
 * state so a data-less chart never renders as a confusing blank box.
 */
export function ChartCard({
  title,
  subtitle,
  viewAllHref,
  action,
  height = 240,
  isEmpty = false,
  emptyText = 'No data in this range yet',
  className,
  children,
}: {
  title: string
  subtitle?: string
  viewAllHref?: string
  action?: ReactNode
  height?: number
  isEmpty?: boolean
  emptyText?: string
  className?: string
  children: ReactNode
}) {
  return (
    <SectionCard title={title} subtitle={subtitle} viewAllHref={viewAllHref} action={action} className={className} bodyClassName="pt-3">
      <div style={{ height }}>
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </SectionCard>
  )
}
