'use client'

import { useEffect, useState } from 'react'
import { Users, Scale, Building2, FileText, MessageSquare, Mail, Inbox, Clock, CheckCircle2, Loader2 } from 'lucide-react'

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
  received: 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/10',
  in_process: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/10',
  attended: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10',
}

const statusLabels: Record<string, string> = {
  received: 'Received',
  in_process: 'In Process',
  attended: 'Attended',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch stats')
        return res.json()
      })
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
      </div>
    )
  }

  if (!stats) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-gray-400">Failed to load stats.</p>
    </div>
  )

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, gradient: 'from-[#1a2a4a] to-[#2a3f6a]', accent: 'bg-navy' },
    { label: 'Lawyers', value: stats.lawyers, icon: Scale, gradient: 'from-blue-500 to-blue-600', accent: 'bg-blue-500' },
    { label: 'Clinics', value: stats.clinics, icon: Building2, gradient: 'from-emerald-500 to-emerald-600', accent: 'bg-emerald-500' },
    { label: 'Total Referrals', value: stats.totalReferrals, icon: FileText, gradient: 'from-[#d4a84b] to-[#c49a3f]', accent: 'bg-gold' },
    { label: 'Contacts', value: stats.totalContacts, icon: MessageSquare, gradient: 'from-purple-500 to-purple-600', accent: 'bg-purple-500' },
    { label: 'Newsletter', value: stats.totalSubscribers, icon: Mail, gradient: 'from-pink-500 to-pink-600', accent: 'bg-pink-500' },
  ]

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="group rounded-2xl bg-white p-5 shadow-sm border border-gray-200/80 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-sm`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Referral status breakdown */}
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200/80">
        <h2 className="font-heading text-base font-bold text-navy mb-5">Referral Status</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="relative rounded-xl border border-gray-200/80 p-5 overflow-hidden hover:shadow-sm transition-shadow">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-blue-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
                <Inbox className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.received}</p>
                <p className="text-xs text-gray-400 font-medium">Received</p>
              </div>
            </div>
          </div>
          <div className="relative rounded-xl border border-gray-200/80 p-5 overflow-hidden hover:shadow-sm transition-shadow">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-amber-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.inProcess}</p>
                <p className="text-xs text-gray-400 font-medium">In Process</p>
              </div>
            </div>
          </div>
          <div className="relative rounded-xl border border-gray-200/80 p-5 overflow-hidden hover:shadow-sm transition-shadow">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.attended}</p>
                <p className="text-xs text-gray-400 font-medium">Attended</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent referrals */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="font-heading text-base font-bold text-navy">Recent Referrals</h2>
          <p className="text-xs text-gray-400 mt-0.5">Latest 5 referrals across all clinics</p>
        </div>
        {stats.recentReferrals.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">No referrals yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
                  <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patient</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Lawyer</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Clinic</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {stats.recentReferrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900">{ref.patientName}</td>
                    <td className="px-6 py-4 text-gray-600">{ref.lawyerName}</td>
                    <td className="px-6 py-4 text-gray-600">{ref.clinicName}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[ref.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[ref.status] || ref.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {formatDate(ref.createdAt)}
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
