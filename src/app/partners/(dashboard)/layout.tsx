import { PartnerShell } from '@/components/partners/PartnerShell'

export default function PartnerDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PartnerShell>{children}</PartnerShell>
}
