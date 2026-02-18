'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Trash2, Download } from 'lucide-react'

interface SubscriberRow {
  id: number
  email: string
  subscribedAt: string
}

export default function AdminNewsletterPage() {
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchSubscribers = useCallback(async () => {
    fetch('/api/admin/newsletter')
      .then((res) => res.json())
      .then(setSubscribers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchSubscribers()
  }, [fetchSubscribers])

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/admin/newsletter/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      await fetchSubscribers()
    }
  }

  const exportToCSV = () => {
    const headers = ['Email', 'Subscribed Date']
    const rows = subscribers.map((s) => [s.email, new Date(s.subscribedAt).toLocaleString()])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((field) => `"${field}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `newsletter-subscribers-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">Newsletter Subscribers</h1>
          <p className="text-sm text-gray-500 mt-1">{subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={exportToCSV}
          disabled={subscribers.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Subscribed Date</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subscribers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    No subscribers yet.
                  </td>
                </tr>
              ) : (
                subscribers.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-900">{s.email}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(s.subscribedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deleteConfirm === s.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDelete(s.id)}
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
                          onClick={() => setDeleteConfirm(s.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          aria-label="Delete subscriber"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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
