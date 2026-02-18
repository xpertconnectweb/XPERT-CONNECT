'use client'

import { useEffect, useState } from 'react'
import { Users, Scale, Building2, FileText, MessageSquare, Mail, Clock, CheckCircle2, Loader2 } from 'lucide-react'

interface Stats {
  totalUsers: number
  lawyers: number
  clinics: number
  totalReferrals: number
  received: number
  inProcess: number
  attended: number
  totalContacts: number
  totalSubscribers: number
  recentReferrals: {
    id: string
    patientName: string
    lawyerName: string
    clinicName: string
    status: string
    createdAt: string
  }[]
}

const statusColors: Record<string, string> = {
  received: 'bg-blue-100 text-blue-700',
  in_process: 'bg-yellow-100 text-yellow-700',
  attended: 'bg-green-100 text-green-700',
}

const statusLabels: Record<string, string> = {
  received: 'Received',
  in_process: 'In Process',
  attended: 'Attended',
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => res.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    )
  }

  if (!stats) return <p className="text-gray-500">Failed to load stats.</p>

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'bg-navy' },
    { label: 'Lawyers', value: stats.lawyers, icon: Scale, color: 'bg-blue-600' },
    { label: 'Clinics', value: stats.clinics, icon: Building2, color: 'bg-emerald-600' },
    { label: 'Total Referrals', value: stats.totalReferrals, icon: FileText, color: 'bg-gold' },
    { label: 'Contacts', value: stats.totalContacts, icon: MessageSquare, color: 'bg-purple-600' },
    { label: 'Newsletter', value: stats.totalSubscribers, icon: Mail, color: 'bg-pink-600' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg text-white ${card.color}`}>
                <card.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Referral status breakdown */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h2 className="font-heading text-lg font-semibold text-gray-900 mb-4">Referral Status Breakdown</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-4">
            <Clock className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm text-blue-600">Received</p>
              <p className="text-xl font-bold text-blue-700">{stats.received}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-yellow-50 p-4">
            <Loader2 className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-sm text-yellow-600">In Process</p>
              <p className="text-xl font-bold text-yellow-700">{stats.inProcess}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-green-50 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm text-green-600">Attended</p>
              <p className="text-xl font-bold text-green-700">{stats.attended}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent referrals */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h2 className="font-heading text-lg font-semibold text-gray-900 mb-4">Recent Referrals</h2>
        {stats.recentReferrals.length === 0 ? (
          <p className="text-sm text-gray-500">No referrals yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-3 pr-4 font-medium">Patient</th>
                  <th className="pb-3 pr-4 font-medium">Lawyer</th>
                  <th className="pb-3 pr-4 font-medium">Clinic</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.recentReferrals.map((ref) => (
                  <tr key={ref.id}>
                    <td className="py-3 pr-4 text-gray-900">{ref.patientName}</td>
                    <td className="py-3 pr-4 text-gray-600">{ref.lawyerName}</td>
                    <td className="py-3 pr-4 text-gray-600">{ref.clinicName}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[ref.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[ref.status] || ref.status}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
