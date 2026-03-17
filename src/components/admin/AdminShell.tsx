'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopBar } from './AdminTopBar'

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect('/professionals/login')
    },
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
          <p className="mt-4 text-xs text-gray-400 tracking-wide">Loading admin panel...</p>
        </div>
      </div>
    )
  }

  // Double-check admin role on client side
  if (session?.user?.role !== 'admin') {
    redirect('/professionals/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopBar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
