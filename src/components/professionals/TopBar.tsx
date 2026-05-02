'use client'

import { useSession, signOut } from 'next-auth/react'
import { Menu, LogOut } from 'lucide-react'

interface TopBarProps {
  onMenuToggle: () => void
  pageTitle?: string
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name?: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function TopBar({ onMenuToggle, pageTitle }: TopBarProps) {
  const { data: session } = useSession()

  const role = session?.user?.role
  const roleLabel = role === 'lawyer' ? 'Attorney' : role === 'referrer' ? 'Referrer' : role === 'admin' ? 'Administrator' : role === 'partner' ? 'Partner' : 'Clinic'
  const firstName = session?.user?.name?.split(' ')[0] || ''
  const initials = getInitials(session?.user?.name)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-white px-4 lg:px-6" style={{ borderBottom: '1px solid transparent', borderImage: 'linear-gradient(to right, #e5e7eb, #d4a84b20, #e5e7eb) 1' }}>
      {/* Left side: mobile toggle + page info */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden lg:block">
          {pageTitle && (
            <h1 className="font-heading text-lg font-bold text-navy leading-tight">{pageTitle}</h1>
          )}
          <p className="text-xs text-gray-400">
            {getGreeting()}, {firstName}
          </p>
        </div>
      </div>

      {/* Right side: user info & logout */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #1a2a4a, #2a3f6a)' }}>
            {initials}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{session?.user?.name}</p>
            <p className="text-[11px] text-gray-400">{roleLabel}</p>
          </div>
        </div>
        <div className="h-6 w-px bg-gray-100 hidden sm:block" />
        <button
          onClick={() => signOut({ callbackUrl: '/professionals/login' })}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-400 transition-all duration-200 hover:bg-red-50 hover:text-red-500"
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline font-medium">Sign Out</span>
        </button>
      </div>
    </header>
  )
}
