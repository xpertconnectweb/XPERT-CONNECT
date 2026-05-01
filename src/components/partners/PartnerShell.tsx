'use client'

import { BaseShell } from '@/components/shared/BaseShell'
import { PartnerSidebar } from './PartnerSidebar'
import { TopBar } from '../professionals/TopBar'

const PAGE_TITLES: Record<string, string> = {
  '/partners/map': 'Clinic Map',
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  return (
    <BaseShell
      sidebar={PartnerSidebar}
      topbar={TopBar}
      pageTitles={PAGE_TITLES}
      allowedRoles={['partner', 'admin']}
    >
      {children}
    </BaseShell>
  )
}
