'use client'

import { useSession } from 'next-auth/react'
import { Map, FileText, UserPlus } from 'lucide-react'
import { BaseSidebar } from '@/components/shared/BaseSidebar'
import type { NavSection } from '@/components/shared/BaseSidebar'

const defaultSections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      { href: '/professionals/map', label: 'Map', icon: Map },
      { href: '/professionals/referrals', label: 'Referrals', icon: FileText },
    ],
  },
]

const referrerSections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      { href: '/professionals/refer', label: 'Refer a Client', icon: UserPlus },
      { href: '/professionals/my-referrals', label: 'My Referrals', icon: FileText },
    ],
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { data: session } = useSession()
  const isReferrer = session?.user?.role === 'referrer'

  return (
    <BaseSidebar
      isOpen={isOpen}
      onClose={onClose}
      logoHref={isReferrer ? '/professionals/refer' : '/professionals/map'}
      ariaLabel="Dashboard navigation"
      navSections={isReferrer ? referrerSections : defaultSections}
    />
  )
}
