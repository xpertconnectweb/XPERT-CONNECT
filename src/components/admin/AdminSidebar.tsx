'use client'

import {
  SquaresFour, Users, FileText, ChatCircle, EnvelopeSimple, Buildings, Scales,
  ShieldCheck, Clock, Gear, UserPlus,
} from '@phosphor-icons/react/dist/ssr'
import { BaseSidebar } from '@/components/shared/BaseSidebar'
import type { NavSection } from '@/components/shared/BaseSidebar'

const navSections: NavSection[] = [
  {
    label: 'Management',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: SquaresFour },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/clinics', label: 'Clinics', icon: Buildings },
      { href: '/admin/lawyers', label: 'Lawyers', icon: Scales },
      { href: '/admin/referrals', label: 'Referrals', icon: FileText },
      { href: '/admin/referrer-referrals', label: 'Partner Referrals', icon: UserPlus },
      { href: '/admin/contacts', label: 'Contacts', icon: ChatCircle },
      { href: '/admin/newsletter', label: 'Newsletter', icon: EnvelopeSimple },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/activity', label: 'Activity', icon: Clock },
      { href: '/admin/settings', label: 'Settings', icon: Gear },
    ],
  },
]

interface AdminSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  return (
    <BaseSidebar
      isOpen={isOpen}
      onClose={onClose}
      logoHref="/admin/dashboard"
      ariaLabel="Admin navigation"
      navSections={navSections}
      badge={{ icon: ShieldCheck, text: 'Admin Panel' }}
    />
  )
}
