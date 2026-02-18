import { SessionProvider } from '@/components/providers/SessionProvider'

export const metadata = {
  title: 'Admin Panel | Xpert Connect',
  description: 'Administration panel for Xpert Connect',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionProvider>{children}</SessionProvider>
}
