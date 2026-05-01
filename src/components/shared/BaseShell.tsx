'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname, redirect } from 'next/navigation'
import Image from 'next/image'
import { RouteProgressBar } from '../professionals/RouteProgressBar'

interface BaseShellProps {
  children: React.ReactNode
  sidebar: React.ComponentType<{ isOpen: boolean; onClose: () => void }>
  topbar: React.ComponentType<{ onMenuToggle: () => void; pageTitle?: string }>
  pageTitles?: Record<string, string>
  allowedRoles: string[]
  redirectUrl?: string
  loadingText?: string
  onAuthenticated?: (session: NonNullable<ReturnType<typeof useSession>['data']>, pathname: string) => void
}

export function BaseShell({
  children,
  sidebar: SidebarComponent,
  topbar: TopBarComponent,
  pageTitles = {},
  allowedRoles,
  redirectUrl = '/professionals/login',
  loadingText = 'Loading your dashboard...',
  onAuthenticated,
}: BaseShellProps) {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect(redirectUrl)
    },
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const pageTitle = pageTitles[pathname] || ''

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
          <p className="mt-4 text-xs text-gray-400 tracking-wide">{loadingText}</p>
        </div>
      </div>
    )
  }

  // Role check
  if (session && !allowedRoles.includes(session.user.role)) {
    redirect(redirectUrl)
  }

  // Custom redirect logic
  if (session && onAuthenticated) {
    onAuthenticated(session, pathname)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <RouteProgressBar />
      <SidebarComponent isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBarComponent onMenuToggle={() => setSidebarOpen((prev) => !prev)} pageTitle={pageTitle} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
