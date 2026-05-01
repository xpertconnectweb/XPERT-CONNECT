'use client'

import { BaseShell } from '@/components/shared/BaseShell'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopBar } from './AdminTopBar'

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <BaseShell
      sidebar={AdminSidebar}
      topbar={AdminTopBar}
      allowedRoles={['admin']}
      loadingText="Loading admin panel..."
    >
      {children}
    </BaseShell>
  )
}
