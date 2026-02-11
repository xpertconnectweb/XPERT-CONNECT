import { cn } from '@/lib/utils'
import { Inbox, Clock, CheckCircle2 } from 'lucide-react'
import type { ReferralStatus } from '@/types/professionals'
import type { LucideIcon } from 'lucide-react'

const STATUS_CONFIG: Record<ReferralStatus, { label: string; className: string; icon: LucideIcon }> = {
  received: {
    label: 'Received',
    className: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    icon: Inbox,
  },
  in_process: {
    label: 'In Process',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    icon: Clock,
  },
  attended: {
    label: 'Attended',
    className: 'bg-green-50 text-green-700 ring-green-600/20',
    icon: CheckCircle2,
  },
}

interface StatusBadgeProps {
  status: ReferralStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        config.className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
    </span>
  )
}
