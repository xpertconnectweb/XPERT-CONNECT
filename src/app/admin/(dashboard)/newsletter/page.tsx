'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface SubscriberRow {
  id: number
  email: string
  subscribedAt: string
}

export default function AdminNewsletterPage() {
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/newsletter')
      .then((res) => res.json())
      .then(setSubscribers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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
        <h1 className="font-heading text-2xl font-bold text-gray-900">Newsletter Subscribers</h1>
        <span className="text-sm text-gray-500">{subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Subscribed Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subscribers.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-gray-500">
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
