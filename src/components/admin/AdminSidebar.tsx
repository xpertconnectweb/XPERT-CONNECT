'use client'

import { LayoutDashboard, Users, FileText, MessageSquare, Mail, Building2, Scale, Shield, Clock, Settings, UserPlus } from 'lucide-react'
import { BaseSidebar } from '@/components/shared/BaseSidebar'
import type { NavSection } from '@/components/shared/BaseSidebar'

const navSections: NavSection[] = [
  {
    label: 'Management',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/clinics', label: 'Clinics', icon: Building2 },
      { href: '/admin/lawyers', label: 'Lawyers', icon: Scale },
      { href: '/admin/referrals', label: 'Referrals', icon: FileText },
      { href: '/admin/referrer-referrals', label: 'Partner Referrals', icon: UserPlus },
      { href: '/admin/contacts', label: 'Contacts', icon: MessageSquare },
      { href: '/admin/newsletter', label: 'Newsletter', icon: Mail },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/activity', label: 'Activity', icon: Clock },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
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
      badge={{ icon: Shield, text: 'Admin Panel' }}
    />
  )
}
