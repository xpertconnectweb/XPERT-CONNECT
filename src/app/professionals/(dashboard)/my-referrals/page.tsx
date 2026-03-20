'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, FileText, Clock, UserCheck, CheckCircle2, X } from 'lucide-react'
import type { ReferrerReferral } from '@/types/professionals'

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-gray-100', text: 'text-gray-700' },
  assigned: { label: 'Assigned', bg: 'bg-blue-100', text: 'text-blue-700' },
  in_process: { label: 'In Process', bg: 'bg-amber-100', text: 'text-amber-700' },
  completed: { label: 'Completed', bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function MyReferralsPage() {
  const [referrals, setReferrals] = useState<ReferrerReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ReferrerReferral | null>(null)

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch('/api/professionals/referrer-referrals')
      if (!res.ok) throw new Error('Failed to fetch')
      setReferrals(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReferrals()
  }, [fetchReferrals])

  const total = referrals.length
  const pending = referrals.filter((r) => r.status === 'pending').length
  const assigned = referrals.filter((r) => r.status === 'assigned' || r.status === 'in_process').length
  const completed = referrals.filter((r) => r.status === 'completed').length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: total, icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50' },
          { label: 'Pending', value: pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Active', value: assigned, icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Completed', value: completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {referrals.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No referrals yet</p>
            <p className="text-sm text-gray-400 mt-1">Your submitted referrals will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {referrals.map((r) => {
                  const sc = statusConfig[r.status] || statusConfig.pending
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{r.clientName}</td>
                      <td className="px-4 py-3 text-gray-600">{r.state}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{r.serviceNeeded === 'lawyer' ? 'Attorney' : r.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(r.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-semibold text-gray-900">Referral Details</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${(statusConfig[detail.status] || statusConfig.pending).bg} ${(statusConfig[detail.status] || statusConfig.pending).text}`}>
                  {(statusConfig[detail.status] || statusConfig.pending).label}
                </span>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-gray-500 text-xs font-medium uppercase mb-2">Client Info</p>
                <p className="font-medium text-gray-900">{detail.clientName}</p>
                <p className="text-gray-600">{detail.clientPhone}</p>
                {detail.clientEmail && <p className="text-gray-600">{detail.clientEmail}</p>}
                <p className="text-gray-600">{detail.clientAddress}</p>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-gray-500 text-xs font-medium uppercase mb-2">Referral Info</p>
                <div className="flex justify-between">
                  <span className="text-gray-500">State</span>
                  <span className="text-gray-900">{detail.state === 'FL' ? 'Florida' : 'Minnesota'}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Service</span>
                  <span className="text-gray-900 capitalize">{detail.serviceNeeded === 'lawyer' ? 'Attorney' : detail.serviceNeeded}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Case Type</span>
                  <span className="text-gray-900">{detail.caseType}</span>
                </div>
                {detail.notes && (
                  <div className="mt-2">
                    <span className="text-gray-500">Notes</span>
                    <p className="text-gray-900 mt-0.5">{detail.notes}</p>
                  </div>
                )}
              </div>
              {(detail.assignedClinicName || detail.assignedLawyerName) && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-gray-500 text-xs font-medium uppercase mb-2">Assignment</p>
                  {detail.assignedClinicName && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Clinic</span>
                      <span className="text-gray-900">{detail.assignedClinicName}</span>
                    </div>
                  )}
                  {detail.assignedLawyerName && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-500">Attorney</span>
                      <span className="text-gray-900">{detail.assignedLawyerName}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="border-t border-gray-100 pt-3 text-xs text-gray-400">
                Submitted {formatDate(detail.createdAt)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
