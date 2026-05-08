import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getReferralsByClinic } from '@/lib/data'
import { ClinicDashboard } from '@/components/professionals/ClinicDashboard'

export default async function ProfessionalsIndex() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/professionals/login')
  }

  const role = session.user.role

  if (role === 'admin') redirect('/admin/dashboard')
  if (role === 'partner') redirect('/partners/map')
  if (role === 'referrer') redirect('/professionals/refer')
  if (role === 'lawyer') redirect('/professionals/map')

  // Clinic role: dashboard with giant "Refer to Specialist" CTA + recent referrals
  const clinicId = session.user.clinicId
  const recent = clinicId ? (await getReferralsByClinic(clinicId)).slice(0, 5) : []

  return <ClinicDashboard recentReferrals={recent} />
}
