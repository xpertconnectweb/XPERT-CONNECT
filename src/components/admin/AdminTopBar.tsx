'use client'

import { useSession, signOut } from 'next-auth/react'
import { Menu, LogOut, User } from 'lucide-react'

interface AdminTopBarProps {
  onMenuToggle: () => void
}

export function AdminTopBar({ onMenuToggle }: AdminTopBarProps) {
  const { data: session } = useSession()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Spacer for desktop */}
      <div className="hidden lg:block" />

      {/* User info & logout */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-white">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-tight">{session?.user?.name}</p>
            <p className="text-xs text-gray-500">Administrator</p>
          </div>
        </div>
        <div className="h-6 w-px bg-gray-200 hidden sm:block" />
        <button
          onClick={() => signOut({ callbackUrl: '/professionals/login' })}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  )
}
