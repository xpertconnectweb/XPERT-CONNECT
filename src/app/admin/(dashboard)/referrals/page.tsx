'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { ReferralStatus } from '@/types/professionals'

interface ReferralRow {
  id: string
  lawyerName: string
  lawyerFirm: string
  clinicName: string
  patientName: string
  patientPhone: string
  caseType: string
  coverage: string
  pip: string
  notes: string
  status: ReferralStatus
  createdAt: string
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

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)

    fetch(`/api/admin/referrals?${params}`)
      .then((res) => res.json())
      .then(setReferrals)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [statusFilter])

  const filtered = referrals.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.patientName.toLowerCase().includes(q) ||
      r.lawyerName.toLowerCase().includes(q) ||
      r.clinicName.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-gray-900">Referrals</h1>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by patient, lawyer or clinic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setLoading(true); setStatusFilter(e.target.value) }}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        >
          <option value="">All Statuses</option>
          <option value="received">Received</option>
          <option value="in_process">In Process</option>
          <option value="attended">Attended</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Lawyer</th>
                <th className="px-4 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Case Type</th>
                <th className="px-4 py-3 font-medium">Coverage</th>
                <th className="px-4 py-3 font-medium">PIP</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No referrals found.
                  </td>
                </tr>
              ) : (
                filtered.map((ref) => (
                  <tr key={ref.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{ref.patientName}</td>
                    <td className="px-4 py-3 text-gray-600">{ref.patientPhone}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{ref.lawyerName}</div>
                      {ref.lawyerFirm && <div className="text-xs text-gray-400">{ref.lawyerFirm}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ref.clinicName}</td>
                    <td className="px-4 py-3 text-gray-600">{ref.caseType}</td>
                    <td className="px-4 py-3 text-gray-600">{ref.coverage}</td>
                    <td className="px-4 py-3 text-gray-600">{ref.pip}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[ref.status] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabels[ref.status] || ref.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
