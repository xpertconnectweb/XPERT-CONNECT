'use client'

import { useEffect, useState } from 'react'
import {
  Users,
  Scale,
  Building2,
  FileText,
  MessageSquare,
  Mail,
  Plus,
  Pencil,
  Trash2,
  Settings,
  Layers,
  Activity,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'

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
  monthlyReferrals: { month: string; count: number }[]
  topClinics: { name: string; count: number }[]
  topLawyers: { name: string; count: number }[]
  totalClinicsEntities: number
  availableClinics: number
  recentActivity: {
    userName: string
    action: string
    targetType: string
    targetName: string
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

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    clinic_created: 'created a clinic',
    clinic_updated: 'updated a clinic',
    clinic_deleted: 'deleted a clinic',
    lawyer_created: 'created a lawyer',
    lawyer_updated: 'updated a lawyer',
    lawyer_deleted: 'deleted a lawyer',
    user_created: 'created a user',
    user_updated: 'updated a user',
    user_deleted: 'deleted a user',
    bulk_toggle_availability: 'toggled availability',
    bulk_delete: 'bulk deleted',
    settings_updated: 'updated settings',
  }
  return map[action] || action
}

function getActionBadge(action: string): string {
  if (action.includes('created')) return 'bg-emerald-50 text-emerald-700'
  if (action.includes('updated') || action.includes('toggle')) return 'bg-amber-50 text-amber-700'
  if (action.includes('deleted')) return 'bg-red-50 text-red-700'
  return 'bg-gray-50 text-gray-700'
}

function getActionIcon(action: string) {
  if (action.includes('created')) return Plus
  if (action.includes('updated') || action.includes('toggle') || action.includes('settings')) return Pencil
  if (action.includes('deleted')) return Trash2
  return Settings
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm font-bold text-[#1a2a4a]">{payload[0].value} referrals</p>
    </div>
  )
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
    { label: 'Total Users', value: stats.totalUsers, icon: Users, gradient: 'from-[#1a2a4a] to-[#2a3f6a]' },
    { label: 'Lawyers', value: stats.lawyers, icon: Scale, gradient: 'from-blue-500 to-blue-600' },
    { label: 'Clinics', value: stats.clinics, icon: Building2, gradient: 'from-emerald-500 to-emerald-600' },
    { label: 'Total Referrals', value: stats.totalReferrals, icon: FileText, gradient: 'from-[#d4a84b] to-[#c49a3f]' },
    { label: 'Contacts', value: stats.totalContacts, icon: MessageSquare, gradient: 'from-purple-500 to-purple-600' },
    { label: 'Newsletter', value: stats.totalSubscribers, icon: Mail, gradient: 'from-pink-500 to-pink-600' },
  ]

  const pieData = [
    { name: 'Received', value: stats.received },
    { name: 'In Process', value: stats.inProcess },
    { name: 'Attended', value: stats.attended },
  ]
  const pieTotal = stats.received + stats.inProcess + stats.attended

  return (
    <div className="space-y-6">
      {/* ── Stat Cards ── */}
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

      {/* ── Charts Row: Referral Trend + Referral Status ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Area Chart - Referral Trends */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200/80">
          <div className="mb-4">
            <h2 className="font-heading text-base font-bold text-navy">Referral Trends</h2>
            <p className="text-xs text-gray-400 mt-0.5">Last 6 months</p>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthlyReferrals} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="navyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a2a4a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#1a2a4a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#1a2a4a"
                  strokeWidth={2.5}
                  fill="url(#navyGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart - Referral Status */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200/80">
          <div className="mb-4">
            <h2 className="font-heading text-base font-bold text-navy">Referral Status</h2>
            <p className="text-xs text-gray-400 mt-0.5">Current distribution</p>
          </div>
          <div className="h-[220px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: 16 }}>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{pieTotal}</p>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Total</p>
              </div>
            </div>
          </div>
          {/* Legend */}
          <div className="flex items-center justify-center gap-5 mt-2">
            {pieData.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                <span className="text-xs text-gray-500">{entry.name}</span>
                <span className="text-xs font-semibold text-gray-700">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charts Row: Top Clinics + Top Lawyers ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Clinics */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200/80">
          <div className="mb-4">
            <h2 className="font-heading text-base font-bold text-navy">Top Clinics by Referrals</h2>
            <p className="text-xs text-gray-400 mt-0.5">Most referred clinics</p>
          </div>
          {stats.topClinics.length === 0 ? (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-sm text-gray-400">No referral data yet</p>
            </div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.topClinics.map((c) => ({ ...c, name: truncate(c.name, 20) }))}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 5, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={130} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <Bar dataKey="count" fill="#d4a84b" radius={[0, 6, 6, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Lawyers */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200/80">
          <div className="mb-4">
            <h2 className="font-heading text-base font-bold text-navy">Top Lawyers by Referrals</h2>
            <p className="text-xs text-gray-400 mt-0.5">Most active lawyers</p>
          </div>
          {stats.topLawyers.length === 0 ? (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-sm text-gray-400">No referral data yet</p>
            </div>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.topLawyers.map((l) => ({ ...l, name: truncate(l.name, 20) }))}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 5, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={130} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Recent Referrals + Recent Activity ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Referrals */}
        <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="font-heading text-base font-bold text-navy">Recent Referrals</h2>
            <p className="text-xs text-gray-400 mt-0.5">Latest 5 referrals</p>
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
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patient</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Lawyer</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Clinic</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/80">
                  {stats.recentReferrals.map((ref) => (
                    <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-gray-900 text-xs">{ref.patientName}</td>
                      <td className="px-5 py-3.5 text-gray-600 text-xs">{ref.lawyerName}</td>
                      <td className="px-5 py-3.5 text-gray-600 text-xs">{truncate(ref.clinicName, 18)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors[ref.status] || 'bg-gray-100 text-gray-600'}`}>
                          {statusLabels[ref.status] || ref.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-[11px]">
                        {formatDate(ref.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-navy" />
              <h2 className="font-heading text-base font-bold text-navy">Recent Activity</h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Latest admin actions</p>
          </div>
          {stats.recentActivity.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-gray-400">No activity logged yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100/80">
              {stats.recentActivity.map((act, i) => {
                const Icon = getActionIcon(act.action)
                return (
                  <div key={i} className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getActionBadge(act.action)}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">{act.userName}</span>
                        {' '}{getActionLabel(act.action)}
                        {act.targetName && (
                          <>
                            {' '}<span className="font-medium text-gray-900">{truncate(act.targetName, 25)}</span>
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(act.createdAt)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
