'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Map, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/partners/map', label: 'Map', icon: Map },
]

interface PartnerSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function PartnerSidebar({ isOpen, onClose }: PartnerSidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 text-white transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'linear-gradient(180deg, #1a2a4a 0%, #0f1d35 100%)' }}
        role="navigation"
        aria-label="Partners navigation"
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-5 border-b border-white/[0.08]">
          <Link href="/partners/map" className="flex items-center" aria-label="Xpert Connect - Partners">
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
        <nav className="mt-8 px-3">
          <p className="px-4 mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Navigation
          </p>
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
                      'group relative flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-white/[0.1] text-white'
                        : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80'
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-gold" />
                    )}
                    <item.icon className={cn(
                      'h-[18px] w-[18px] transition-colors',
                      isActive ? 'text-gold' : 'text-white/40 group-hover:text-white/60'
                    )} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0">
          <div className="mx-4 border-t border-white/[0.08]" />
          <div className="px-4 py-4">
            <Link
              href="/"
              className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-white/35 hover:text-white/60 hover:bg-white/[0.04] transition-all duration-200"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              Back to public site
            </Link>
          </div>
        </div>
      </aside>
    </>
  )
}
