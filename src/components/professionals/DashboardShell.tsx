'use client'

import { redirect } from 'next/navigation'
import { BaseShell } from '@/components/shared/BaseShell'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const PAGE_TITLES: Record<string, string> = {
  '/professionals/map': 'Clinic Map',
  '/professionals/referrals': 'Referrals',
  '/professionals/refer': 'Refer a Client',
  '/professionals/my-referrals': 'My Referrals',
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <BaseShell
      sidebar={Sidebar}
      topbar={TopBar}
      pageTitles={PAGE_TITLES}
      allowedRoles={['lawyer', 'clinic', 'referrer']}
      onAuthenticated={(session, pathname) => {
        if (session.user.role === 'admin') redirect('/admin/dashboard')
        if (session.user.role === 'partner') redirect('/partners/map')
        if (session.user.role === 'referrer') {
          if (pathname === '/professionals/map' || pathname === '/professionals/referrals') {
            redirect('/professionals/refer')
          }
        }
      }}
    >
      {children}
    </BaseShell>
  )
}
