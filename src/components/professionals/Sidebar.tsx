'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Map, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/professionals/map', label: 'Map', icon: Map },
  { href: '/professionals/referrals', label: 'Referrals', icon: FileText },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-navy text-white transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="navigation"
        aria-label="Dashboard navigation"
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-white/10">
          <Link href="/professionals/map" className="flex items-center" aria-label="Xpert Connect - Dashboard">
            <Image
              src="/images/logo.png"
              alt="Xpert Connect"
              width={160}
              height={45}
              className="h-10 w-auto brightness-0 invert"
              priority
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-gold text-white shadow-sm shadow-gold/25'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-white/10">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Back to public site
          </Link>
        </div>
      </aside>
    </>
  )
}
