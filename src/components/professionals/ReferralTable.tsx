'use client'

import { useState, useEffect } from 'react'
import { StatusBadge } from './StatusBadge'
import {
  Loader2,
  ArrowRight,
  Inbox,
  Eye,
  X,
  User,
  Phone,
  Scale,
  Briefcase,
  Shield,
  FileCheck,
  Calendar,
  Clock,
  MessageSquare,
  Building2,
} from 'lucide-react'
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/* ── Detail Modal ── */
function ReferralDetailModal({ referral, onClose }: { referral: Referral; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [onClose])

  const statusColor = {
    received: 'from-blue-500 to-blue-600',
    in_process: 'from-amber-500 to-amber-600',
    attended: 'from-emerald-500 to-emerald-600',
  }[referral.status]

  const rows = [
    { icon: User, label: 'Patient', value: referral.patientName },
    { icon: Phone, label: 'Phone', value: referral.patientPhone },
    { icon: Scale, label: 'Lawyer', value: referral.lawyerName },
    { icon: Building2, label: 'Firm', value: referral.lawyerFirm },
    { icon: Briefcase, label: 'Case Type', value: referral.caseType },
    { icon: Shield, label: 'Coverage', value: referral.coverage },
    { icon: FileCheck, label: 'PIP', value: referral.pip },
    { icon: Calendar, label: 'Created', value: formatDateTime(referral.createdAt) },
    { icon: Clock, label: 'Updated', value: formatDateTime(referral.updatedAt) },
  ]

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl animate-modal-in overflow-hidden">
        {/* Header */}
        <div className="relative shrink-0 bg-gradient-to-r from-[#1a2a4a] to-[#2a3f6a] px-6 py-5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
          <div className="relative flex items-start justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold text-white">Referral Details</h2>
              <p className="text-sm text-white/50 mt-0.5">ID: {referral.id.slice(0, 8)}</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-all"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Status pill */}
          <div className="relative mt-3">
            <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${statusColor} px-3.5 py-1.5 shadow-lg`}>
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {STATUS_LABELS[referral.status]}
              </span>
            </div>
          </div>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0 divide-y divide-gray-100">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <Icon className="h-4 w-4 text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{value || '—'}</p>
              </div>
            </div>
          ))}

          {referral.notes && (
            <div className="py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 mt-0.5">
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Notes</p>
                  <p className="text-sm text-gray-700 mt-1 leading-relaxed bg-gray-50 rounded-xl p-3 border border-gray-100">
                    {referral.notes}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Table ── */
interface ReferralTableProps {
  referrals: Referral[]
  onStatusChange: (id: string, status: ReferralStatus) => Promise<void>
}

export function ReferralTable({ referrals, onStatusChange }: ReferralTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Referral | null>(null)

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
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
          <h2 className="font-heading text-sm font-bold text-navy">All Referrals</h2>
          <span className="text-[11px] font-medium text-gray-400 bg-white rounded-full px-2.5 py-0.5 border border-gray-200">
            {referrals.length} total
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Patient</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Lawyer</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Case Type</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                <th className="px-5 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80">
              {referrals.map((ref) => {
                const currentIdx = STATUS_FLOW.indexOf(ref.status)
                const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null
                return (
                  <tr key={ref.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">{ref.patientName}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{ref.patientPhone}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-700">{ref.lawyerName}</p>
                      {ref.lawyerFirm && (
                        <p className="text-[11px] text-gray-400 mt-0.5">{ref.lawyerFirm}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600 text-xs">{ref.caseType}</td>
                    <td className="px-5 py-4 text-gray-400 whitespace-nowrap text-xs">{formatDate(ref.createdAt)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={ref.status} />
                    </td>
                    <td className="px-5 py-4">
                      {nextStatus ? (
                        <button
                          onClick={() => handleStatusChange(ref.id, nextStatus)}
                          disabled={updatingId === ref.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#d4a84b] to-[#c49a3f] px-3.5 py-1.5 text-xs font-semibold text-white hover:shadow-md hover:shadow-gold/20 disabled:opacity-50 transition-all duration-200 shadow-sm"
                        >
                          {updatingId === ref.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowRight className="h-3 w-3" />
                          )}
                          {STATUS_LABELS[nextStatus]}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Completed
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => setSelected(ref)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-navy/5 hover:text-navy transition-all"
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
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
                  <div className="flex items-center gap-2">
                    <StatusBadge status={ref.status} />
                    <button
                      onClick={() => setSelected(ref)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-navy/5 hover:text-navy transition-all"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Lawyer</p>
                    <p className="text-gray-700 mt-0.5">{ref.lawyerName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Case</p>
                    <p className="text-gray-700 mt-0.5">{ref.caseType}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400">{formatDate(ref.createdAt)}</p>
                {ref.notes && (
                  <p className="text-xs text-gray-500 bg-gray-50/80 rounded-xl p-3 border border-gray-100/60 line-clamp-2">{ref.notes}</p>
                )}
                {nextStatus && (
                  <button
                    onClick={() => handleStatusChange(ref.id, nextStatus)}
                    disabled={updatingId === ref.id}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#d4a84b] to-[#c49a3f] px-3 py-2.5 text-xs font-semibold text-white hover:shadow-md disabled:opacity-50 transition-all duration-200 shadow-sm"
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

      {/* Detail Modal */}
      {selected && (
        <ReferralDetailModal referral={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
