'use client'

import { LayoutDashboard, FileText, PlusCircle, Map } from 'lucide-react'
import { BaseSidebar } from '@/components/shared/BaseSidebar'
import type { NavSection } from '@/components/shared/BaseSidebar'

const navSections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      { href: '/partners/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/partners/referrals', label: 'My Referrals', icon: FileText },
      { href: '/partners/referrals/new', label: 'New Referral', icon: PlusCircle },
      { href: '/partners/map', label: 'Clinic Map', icon: Map },
    ],
  },
]

interface PartnerSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function PartnerSidebar({ isOpen, onClose }: PartnerSidebarProps) {
  return (
    <BaseSidebar
      isOpen={isOpen}
      onClose={onClose}
      logoHref="/partners/dashboard"
      ariaLabel="Partners navigation"
      navSections={navSections}
    />
  )
}
