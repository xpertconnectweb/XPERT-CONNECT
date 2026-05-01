'use client'

import { Map } from 'lucide-react'
import { BaseSidebar } from '@/components/shared/BaseSidebar'
import type { NavSection } from '@/components/shared/BaseSidebar'

const navSections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      { href: '/partners/map', label: 'Map', icon: Map },
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
      logoHref="/partners/map"
      ariaLabel="Partners navigation"
      navSections={navSections}
    />
  )
}
