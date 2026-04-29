'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { PartnerSidebar } from './PartnerSidebar'
import { TopBar } from '../professionals/TopBar'
import { RouteProgressBar } from '../professionals/RouteProgressBar'

const PAGE_TITLES: Record<string, string> = {
  '/partners/map': 'Clinic Map',
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect('/professionals/login')
    },
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const pageTitle = PAGE_TITLES['/partners/map'] || ''

  // Only partner and admin users can access
  if (status === 'authenticated' && session?.user?.role !== 'partner' && session?.user?.role !== 'admin') {
    redirect('/professionals/login')
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50" role="status">
        <div className="text-center animate-in fade-in duration-500">
          <Image
            src="/images/logo.png"
            alt="Xpert Connect"
            width={140}
            height={40}
            className="mx-auto mb-6 opacity-80"
            style={{ width: 'auto', height: 'auto' }}
            priority
          />
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
          <p className="mt-4 text-xs text-gray-400 tracking-wide">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <RouteProgressBar />
      <PartnerSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuToggle={() => setSidebarOpen((prev) => !prev)} pageTitle={pageTitle} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
