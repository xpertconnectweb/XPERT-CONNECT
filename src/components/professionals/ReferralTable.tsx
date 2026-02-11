'use client'

import { useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { Loader2, ArrowRight } from 'lucide-react'
import type { Referral, ReferralStatus } from '@/types/professionals'

const STATUS_FLOW: ReferralStatus[] = ['received', 'in_process', 'attended']
const STATUS_LABELS: Record<ReferralStatus, string> = {
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

interface ReferralTableProps {
  referrals: Referral[]
  onStatusChange: (id: string, status: ReferralStatus) => Promise<void>
}

export function ReferralTable({ referrals, onStatusChange }: ReferralTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleStatusChange = async (id: string, newStatus: ReferralStatus) => {
    setUpdatingId(id)
    await onStatusChange(id, newStatus)
    setUpdatingId(null)
  }

  if (referrals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
          <ArrowRight className="h-6 w-6 text-gray-400" />
        </div>
        <p className="font-medium text-gray-900">No referrals yet</p>
        <p className="text-sm text-gray-500 mt-1">Referrals from lawyers will appear here.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Patient</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Lawyer</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Case Type</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {referrals.map((ref) => {
              const currentIdx = STATUS_FLOW.indexOf(ref.status)
              const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null
              return (
                <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-gray-900">{ref.patientName}</p>
                    <p className="text-xs text-gray-500">{ref.patientPhone}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-gray-700">{ref.lawyerName}</p>
                    {ref.lawyerFirm && (
                      <p className="text-xs text-gray-400">{ref.lawyerFirm}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-700">{ref.caseType}</td>
                  <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(ref.createdAt)}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={ref.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    {nextStatus ? (
                      <button
                        onClick={() => handleStatusChange(ref.id, nextStatus)}
                        disabled={updatingId === ref.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50 transition-colors"
                      >
                        {updatingId === ref.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Mark {STATUS_LABELS[nextStatus]}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Completed</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {referrals.map((ref) => {
          const currentIdx = STATUS_FLOW.indexOf(ref.status)
          const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null
          return (
            <div key={ref.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{ref.patientName}</p>
                  <p className="text-xs text-gray-500">{ref.patientPhone}</p>
                </div>
                <StatusBadge status={ref.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Lawyer</p>
                  <p className="text-gray-700">{ref.lawyerName}</p>
                  {ref.lawyerFirm && (
                    <p className="text-xs text-gray-400">{ref.lawyerFirm}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400">Case</p>
                  <p className="text-gray-700">{ref.caseType}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">{formatDate(ref.createdAt)}</p>
              {ref.notes && (
                <p className="text-xs text-gray-500 italic bg-gray-50 rounded-lg p-2">{ref.notes}</p>
              )}
              {nextStatus && (
                <button
                  onClick={() => handleStatusChange(ref.id, nextStatus)}
                  disabled={updatingId === ref.id}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-navy px-3 py-2.5 text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50 transition-colors"
                >
                  {updatingId === ref.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  Mark {STATUS_LABELS[nextStatus]}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
