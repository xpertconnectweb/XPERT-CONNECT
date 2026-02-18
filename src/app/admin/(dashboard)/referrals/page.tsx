'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Search, Eye, Trash2, X } from 'lucide-react'
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
  const [selectedReferral, setSelectedReferral] = useState<ReferralRow | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchReferrals = useCallback(async () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)

    fetch(`/api/admin/referrals?${params}`)
      .then((res) => res.json())
      .then(setReferrals)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => {
    fetchReferrals()
  }, [fetchReferrals])

  const handleStatusChange = async (id: string, newStatus: ReferralStatus) => {
    try {
      const res = await fetch(`/api/professionals/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        await fetchReferrals()
      }
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/professionals/referrals/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setDeleteConfirm(null)
        await fetchReferrals()
      }
    } catch (error) {
      console.error('Failed to delete referral:', error)
    }
  }

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
                <th className="px-4 py-3 font-medium">Lawyer</th>
                <th className="px-4 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Case Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No referrals found.
                  </td>
                </tr>
              ) : (
                filtered.map((ref) => (
                  <tr key={ref.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      <div>{ref.patientName}</div>
                      <div className="text-xs text-gray-500">{ref.patientPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{ref.lawyerName}</div>
                      {ref.lawyerFirm && <div className="text-xs text-gray-400">{ref.lawyerFirm}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ref.clinicName}</td>
                    <td className="px-4 py-3 text-gray-600">{ref.caseType}</td>
                    <td className="px-4 py-3">
                      <select
                        value={ref.status}
                        onChange={(e) => handleStatusChange(ref.id, e.target.value as ReferralStatus)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium border-0 cursor-pointer ${statusColors[ref.status] || 'bg-gray-100 text-gray-600'}`}
                      >
                        <option value="received">Received</option>
                        <option value="in_process">In Process</option>
                        <option value="attended">Attended</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedReferral(ref)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          aria-label="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {deleteConfirm === ref.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(ref.id)}
                              className="rounded-lg px-2 py-1 text-xs bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="rounded-lg px-2 py-1 text-xs bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(ref.id)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            aria-label="Delete referral"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-semibold text-gray-900">Referral Details</h2>
              <button onClick={() => setSelectedReferral(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Patient Name</label>
                  <p className="text-gray-900">{selectedReferral.patientName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Patient Phone</label>
                  <p className="text-gray-900">{selectedReferral.patientPhone}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Lawyer</label>
                  <p className="text-gray-900">{selectedReferral.lawyerName}</p>
                  {selectedReferral.lawyerFirm && <p className="text-sm text-gray-500">{selectedReferral.lawyerFirm}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Clinic</label>
                  <p className="text-gray-900">{selectedReferral.clinicName}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Case Type</label>
                  <p className="text-gray-900">{selectedReferral.caseType}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[selectedReferral.status]}`}>
                    {statusLabels[selectedReferral.status]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Coverage</label>
                  <p className="text-gray-900">{selectedReferral.coverage}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">PIP</label>
                  <p className="text-gray-900">{selectedReferral.pip}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Notes</label>
                <p className="text-gray-900 whitespace-pre-wrap">{selectedReferral.notes || '—'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
                <p className="text-gray-900">{new Date(selectedReferral.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedReferral(null)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
