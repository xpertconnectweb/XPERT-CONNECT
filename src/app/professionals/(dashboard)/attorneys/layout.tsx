import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Server-side role gate for the whole legal-directory subtree.
 *
 * DashboardShell.onAuthenticated confines directory users *to* these
 * routes; this layout is the other half — it keeps every other role
 * *out*, including the attorney map, which is a client component and
 * so cannot check the session itself.
 *
 * /api/directory/lawyers enforces the same rule, so data was never at
 * risk; without this a clinic or attorney account would simply have
 * landed on an empty map.
 */
export default async function AttorneysLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/professionals/login')
  }

  if (session.user.role !== 'directory' && session.user.role !== 'admin') {
    redirect('/professionals/map')
  }

  return <>{children}</>
}
