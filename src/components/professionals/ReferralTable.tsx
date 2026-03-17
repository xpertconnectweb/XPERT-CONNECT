'use client'

import { useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { Loader2, ArrowRight, Inbox } from 'lucide-react'
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
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 mx-auto mb-4">
          <Inbox className="h-6 w-6 text-gray-300" />
        </div>
        <p className="font-semibold text-gray-900">No referrals yet</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-xs mx-auto">When lawyers send referrals to your clinic, they will appear here for you to manage.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
              <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patient</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Lawyer</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Case Type</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Notes</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {referrals.map((ref) => {
              const currentIdx = STATUS_FLOW.indexOf(ref.status)
              const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null
              return (
                <tr key={ref.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900">{ref.patientName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{ref.patientPhone}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-gray-700">{ref.lawyerName}</p>
                    {ref.lawyerFirm && (
                      <p className="text-xs text-gray-400 mt-0.5">{ref.lawyerFirm}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{ref.caseType}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs max-w-[200px]">
                    {ref.notes ? (
                      <span className="line-clamp-2" title={ref.notes}>{ref.notes}</span>
                    ) : (
                      <span className="text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-400 whitespace-nowrap text-xs">{formatDate(ref.createdAt)}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={ref.status} />
                  </td>
                  <td className="px-5 py-4">
                    {nextStatus ? (
                      <button
                        onClick={() => handleStatusChange(ref.id, nextStatus)}
                        disabled={updatingId === ref.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gold-dark disabled:opacity-50 transition-all duration-200 shadow-sm shadow-gold/20"
                      >
                        {updatingId === ref.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ArrowRight className="h-3 w-3" />
                        )}
                        {STATUS_LABELS[nextStatus]}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 font-medium">Completed</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100/60">
        {referrals.map((ref) => {
          const currentIdx = STATUS_FLOW.indexOf(ref.status)
          const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null
          return (
            <div key={ref.id} className="relative p-5 space-y-3 hover:bg-gray-50/50 transition-colors">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-gold/40" />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{ref.patientName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ref.patientPhone}</p>
                </div>
                <StatusBadge status={ref.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Lawyer</p>
                  <p className="text-gray-700 mt-0.5">{ref.lawyerName}</p>
                  {ref.lawyerFirm && (
                    <p className="text-xs text-gray-400">{ref.lawyerFirm}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Case</p>
                  <p className="text-gray-700 mt-0.5">{ref.caseType}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">{formatDate(ref.createdAt)}</p>
              {ref.notes && (
                <p className="text-xs text-gray-500 bg-gray-50/80 rounded-xl p-3 border border-gray-100/60">{ref.notes}</p>
              )}
              {nextStatus && (
                <button
                  onClick={() => handleStatusChange(ref.id, nextStatus)}
                  disabled={updatingId === ref.id}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gold px-3 py-2.5 text-xs font-semibold text-white hover:bg-gold-dark disabled:opacity-50 transition-all duration-200 shadow-sm shadow-gold/20"
                >
                  {updatingId === ref.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3 w-3" />
                  )}
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
