import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
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
  return (
    <SessionProvider>
      {/* Geist is scoped to the admin subtree via these CSS vars; the public
          site keeps Montserrat/Open Sans. `font-sans` = Geist for all admin text. */}
      <div className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
        {children}
      </div>
    </SessionProvider>
  )
}
