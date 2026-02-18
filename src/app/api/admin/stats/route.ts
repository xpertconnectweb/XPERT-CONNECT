import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUsers, getReferrals, getContacts, getNewsletterSubscribers } from '@/lib/data'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [users, referrals, contacts, subscribers] = await Promise.all([
    getUsers(),
    getReferrals(),
    getContacts(),
    getNewsletterSubscribers(),
  ])

  const lawyers = users.filter((u) => u.role === 'lawyer').length
  const clinics = users.filter((u) => u.role === 'clinic').length

  const received = referrals.filter((r) => r.status === 'received').length
  const inProcess = referrals.filter((r) => r.status === 'in_process').length
  const attended = referrals.filter((r) => r.status === 'attended').length

  return NextResponse.json({
    totalUsers: users.length,
    lawyers,
    clinics,
    totalReferrals: referrals.length,
    received,
    inProcess,
    attended,
    totalContacts: contacts.length,
    totalSubscribers: subscribers.length,
    recentReferrals: referrals.slice(0, 5),
  })
}
