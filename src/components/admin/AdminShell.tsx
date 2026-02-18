'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
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
        <div className="text-center">
          <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-navy/20 border-t-gold" />
          <p className="mt-3 text-sm text-gray-500">Loading admin panel...</p>
        </div>
      </div>
    )
  }

  // Double-check admin role on client side
  if (session?.user?.role !== 'admin') {
    redirect('/professionals/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
