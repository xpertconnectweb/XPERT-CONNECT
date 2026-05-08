import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SpecialistsList } from '@/components/professionals/SpecialistsList'

export default async function SpecialistsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/professionals/login')
  }

  if (session.user.role !== 'clinic') {
    redirect('/professionals/map')
  }

  return <SpecialistsList />
}
