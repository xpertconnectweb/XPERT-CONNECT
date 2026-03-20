'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, redirect } from 'next/navigation'
import Image from 'next/image'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const PAGE_TITLES: Record<string, string> = {
  '/professionals/map': 'Clinic Map',
  '/professionals/referrals': 'Referrals',
  '/professionals/refer': 'Refer a Client',
  '/professionals/my-referrals': 'My Referrals',
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect('/professionals/login')
    },
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const pageTitle = PAGE_TITLES[pathname] || ''

  // Redirect admin users to admin panel
  if (status === 'authenticated' && session?.user?.role === 'admin') {
    redirect('/admin/dashboard')
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
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuToggle={() => setSidebarOpen((prev) => !prev)} pageTitle={pageTitle} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
