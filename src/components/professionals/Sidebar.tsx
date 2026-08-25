'use client'

import { useSession } from 'next-auth/react'
import { Map, FileText, UserPlus, LayoutDashboard, Stethoscope, Scale, Bell } from 'lucide-react'
import { BaseSidebar } from '@/components/shared/BaseSidebar'
import type { NavSection } from '@/components/shared/BaseSidebar'

/**
 * Only on the two role variants that can RECEIVE a referral. A
 * referrer submits them and a directory user browses attorneys, so
 * for them this screen would be a switch that turns nothing on.
 */
const accountSection: NavSection = {
  label: 'Account',
  items: [{ href: '/professionals/notifications', label: 'Notifications', icon: Bell }],
}

const defaultSections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      { href: '/professionals/map', label: 'Map', icon: Map },
      { href: '/professionals/referrals', label: 'Referrals', icon: FileText },
    ],
  },
  accountSection,
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

const clinicSections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      { href: '/professionals', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/professionals/specialists', label: 'Specialists', icon: Stethoscope },
      { href: '/professionals/map', label: 'Map', icon: Map },
      { href: '/professionals/referrals', label: 'Referrals', icon: FileText },
    ],
  },
  accountSection,
]

const directorySections: NavSection[] = [
  {
    label: 'Navigation',
    items: [
      { href: '/professionals/attorneys', label: 'Attorneys', icon: Scale },
      { href: '/professionals/attorneys/map', label: 'Attorney Map', icon: Map },
    ],
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { data: session } = useSession()
  const role = session?.user?.role

  let sections: NavSection[] = defaultSections
  let logoHref = '/professionals/map'
  if (role === 'referrer') {
    sections = referrerSections
    logoHref = '/professionals/refer'
  } else if (role === 'clinic') {
    sections = clinicSections
    logoHref = '/professionals'
  } else if (role === 'directory') {
    sections = directorySections
    logoHref = '/professionals/attorneys'
  }

  return (
    <BaseSidebar
      isOpen={isOpen}
      onClose={onClose}
      logoHref={logoHref}
      ariaLabel="Dashboard navigation"
      navSections={sections}
    />
  )
}
