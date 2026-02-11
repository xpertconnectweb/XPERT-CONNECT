import { SessionProvider } from '@/components/providers/SessionProvider'

export const metadata = {
  title: 'Professionals Area | Xpert Connect',
  description: 'Dashboard for legal and medical professionals',
}

export default function ProfessionalsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionProvider>{children}</SessionProvider>
}
