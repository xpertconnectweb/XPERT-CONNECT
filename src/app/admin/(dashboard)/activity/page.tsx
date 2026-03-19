'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ActivityLog } from '@/types/admin'

const ACTION_BADGES: Record<string, { label: string; color: string }> = {
  clinic_created: { label: 'Created', color: 'bg-green-100 text-green-700' },
  clinic_updated: { label: 'Updated', color: 'bg-amber-100 text-amber-700' },
  clinic_deleted: { label: 'Deleted', color: 'bg-red-100 text-red-700' },
  lawyer_created: { label: 'Created', color: 'bg-green-100 text-green-700' },
  lawyer_updated: { label: 'Updated', color: 'bg-amber-100 text-amber-700' },
  lawyer_deleted: { label: 'Deleted', color: 'bg-red-100 text-red-700' },
  user_created: { label: 'Created', color: 'bg-green-100 text-green-700' },
  user_updated: { label: 'Updated', color: 'bg-amber-100 text-amber-700' },
  user_deleted: { label: 'Deleted', color: 'bg-red-100 text-red-700' },
  bulk_toggle_availability: { label: 'Bulk Toggle', color: 'bg-purple-100 text-purple-700' },
  bulk_delete: { label: 'Bulk Delete', color: 'bg-purple-100 text-purple-700' },
  settings_updated: { label: 'Settings', color: 'bg-gray-100 text-gray-700' },
}

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'clinic_created', label: 'Clinic Created' },
  { value: 'clinic_updated', label: 'Clinic Updated' },
  { value: 'clinic_deleted', label: 'Clinic Deleted' },
  { value: 'lawyer_created', label: 'Lawyer Created' },
  { value: 'lawyer_updated', label: 'Lawyer Updated' },
  { value: 'lawyer_deleted', label: 'Lawyer Deleted' },
  { value: 'user_created', label: 'User Created' },
  { value: 'user_updated', label: 'User Updated' },
  { value: 'user_deleted', label: 'User Deleted' },
  { value: 'bulk_toggle_availability', label: 'Bulk Toggle' },
  { value: 'bulk_delete', label: 'Bulk Delete' },
  { value: 'settings_updated', label: 'Settings Updated' },
]

const TARGET_OPTIONS = [
  { value: '', label: 'All Targets' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'user', label: 'User' },
  { value: 'settings', label: 'Settings' },
]

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDetails(details: Record<string, unknown> | undefined, action: string): string {
  if (!details || Object.keys(details).length === 0) return '—'

  const count = details.count as number | undefined
  const operation = details.operation as string | undefined
  const available = details.available as boolean | undefined

  // Bulk actions
  if (action === 'bulk_toggle_availability' && count !== undefined) {
    return `${count} item(s) set to ${available ? 'available' : 'unavailable'}`
  }
  if (action === 'bulk_delete' && count !== undefined) {
    return `${count} item(s) deleted`
  }

  // Generic fallback: show key=value pairs
  const parts: string[] = []
  for (const [k, v] of Object.entries(details)) {
    if (k === 'ids') continue // skip long ID arrays
    parts.push(`${k}: ${v}`)
  }
  return parts.length > 0 ? parts.join(', ') : '—'
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters
  const [actionFilter, setActionFilter] = useState('')
  const [targetFilter, setTargetFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (actionFilter) params.set('action', actionFilter)
    if (targetFilter) params.set('targetType', targetFilter)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)

    try {
      const res = await fetch(`/api/admin/activity-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotalPages(data.totalPages)
        setTotal(data.total)
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err)
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, targetFilter, fromDate, toDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [actionFilter, targetFilter, fromDate, toDate])

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-gray-900">Activity Log</h1>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        >
          {TARGET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          placeholder="From"
        />

        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          placeholder="To"
        />
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500">{total} entries found</p>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No activity logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const badge = ACTION_BADGES[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={log.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {formatTime(log.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium text-xs">
                          {log.user_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="ml-2 text-xs text-gray-400 capitalize">
                            {log.target_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {log.target_name || log.target_id || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[250px]">
                          {formatDetails(log.details, log.action)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
