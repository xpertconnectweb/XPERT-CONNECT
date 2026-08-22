import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * "Nothing here" panel.
 *
 * There were three hand-rolled copies of this: the map results panel, the
 * attorney directory, and the admin chart cards, each with its own icon size
 * and copy tone.
 */
export interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  /** One line on what to do next. An empty state without a next step is a dead end. */
  hint?: string
  action?: ReactNode
  className?: string
  'data-testid'?: string
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
  'data-testid': testId,
}: EmptyStateProps) {
  return (
    <div className={cn('px-6 py-12 text-center', className)} data-testid={testId}>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 shadow-sm">
        <Icon className="h-6 w-6 text-gray-300" />
      </div>
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      {hint && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
