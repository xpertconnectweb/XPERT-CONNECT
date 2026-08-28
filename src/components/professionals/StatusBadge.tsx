import { cn } from '@/lib/utils'
import { statusMeta } from '@/lib/referral-status'
import { statusIcon } from '@/lib/referral-status-icons'

interface StatusBadgeProps {
  /**
   * Deliberately `string`, not `ReferralStatus`: rows written before a
   * lifecycle change still reach this component, and a badge is not worth
   * unmounting the page over. `statusMeta` degrades them to a grey pill.
   */
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const meta = statusMeta(status)
  const Icon = statusIcon(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        meta.badgeClass
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
