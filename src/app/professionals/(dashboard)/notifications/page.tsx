'use client'

import { NotificationSettings } from '@/components/shared/NotificationSettings'

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-navy">Notifications</h1>
        <p className="text-sm text-gray-400 mt-1">
          Choose how you hear about new referrals.
        </p>
      </div>

      <div className="max-w-2xl">
        <NotificationSettings />
      </div>
    </div>
  )
}
