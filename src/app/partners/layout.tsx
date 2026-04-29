import { SessionProvider } from '@/components/providers/SessionProvider'

export const metadata = {
  title: 'Partners Area | Xpert Connect',
  description: 'Dashboard for partner clinics',
}

export default function PartnersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionProvider>{children}</SessionProvider>
}
