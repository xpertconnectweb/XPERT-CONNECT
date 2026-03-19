'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, Save } from 'lucide-react'
import { SortableList } from '@/components/admin/SortableList'
import { Toast } from '@/components/admin/Toast'

interface SettingsData {
  specialties_list?: string[]
  practice_areas_list?: string[]
  referral_notifications?: { enabled: boolean; internalEmail: string }
  platform?: { defaultState: string; companyName: string }
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Local state for each section
  const [specialties, setSpecialties] = useState<string[]>([])
  const [practiceAreas, setPracticeAreas] = useState<string[]>([])
  const [notifications, setNotifications] = useState({ enabled: true, internalEmail: '' })
  const [platform, setPlatform] = useState({ defaultState: '', companyName: 'Xpert Connect' })

  // "Add new" inputs
  const [newSpecialty, setNewSpecialty] = useState('')
  const [newPracticeArea, setNewPracticeArea] = useState('')

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
        if (data.specialties_list) setSpecialties(data.specialties_list)
        if (data.practice_areas_list) setPracticeAreas(data.practice_areas_list)
        if (data.referral_notifications) setNotifications(data.referral_notifications)
        if (data.platform) setPlatform(data.platform)
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const saveSection = async (key: string, value: unknown) => {
    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (res.ok) {
        setToast({ message: 'Settings saved successfully', type: 'success' })
      } else {
        setToast({ message: 'Failed to save settings', type: 'error' })
      }
    } catch {
      setToast({ message: 'Failed to save settings', type: 'error' })
    } finally {
      setSavingKey(null)
    }
  }

  const addSpecialty = () => {
    const trimmed = newSpecialty.trim()
    if (trimmed && !specialties.includes(trimmed)) {
      setSpecialties([...specialties, trimmed])
      setNewSpecialty('')
    }
  }

  const addPracticeArea = () => {
    const trimmed = newPracticeArea.trim()
    if (trimmed && !practiceAreas.includes(trimmed)) {
      setPracticeAreas([...practiceAreas, trimmed])
      setNewPracticeArea('')
    }
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
      <h1 className="font-heading text-2xl font-bold text-gray-900">Settings</h1>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Clinic Specialties */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="font-heading text-lg font-semibold text-gray-900 mb-4">Clinic Specialties</h2>
          <p className="text-xs text-gray-400 mb-4">Drag to reorder. These appear as filter options throughout the platform.</p>

          <SortableList items={specialties} onChange={setSpecialties} />

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newSpecialty}
              onChange={(e) => setNewSpecialty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSpecialty()}
              placeholder="Add specialty..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
            <button
              onClick={addSpecialty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => saveSection('specialties_list', specialties)}
              disabled={savingKey === 'specialties_list'}
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-60 transition-colors"
            >
              {savingKey === 'specialties_list' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>

        {/* Practice Areas */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="font-heading text-lg font-semibold text-gray-900 mb-4">Practice Areas</h2>
          <p className="text-xs text-gray-400 mb-4">Drag to reorder. These appear as filter options for lawyers.</p>

          <SortableList items={practiceAreas} onChange={setPracticeAreas} />

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newPracticeArea}
              onChange={(e) => setNewPracticeArea(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPracticeArea()}
              placeholder="Add practice area..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
            <button
              onClick={addPracticeArea}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => saveSection('practice_areas_list', practiceAreas)}
              disabled={savingKey === 'practice_areas_list'}
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-60 transition-colors"
            >
              {savingKey === 'practice_areas_list' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="font-heading text-lg font-semibold text-gray-900 mb-4">Referral Notifications</h2>
          <p className="text-xs text-gray-400 mb-4">Configure email notifications for new referrals.</p>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNotifications({ ...notifications, enabled: !notifications.enabled })}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  notifications.enabled ? 'bg-gold' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    notifications.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-gray-700">
                {notifications.enabled ? 'Notifications enabled' : 'Notifications disabled'}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Email (CC)</label>
              <input
                type="email"
                value={notifications.internalEmail}
                onChange={(e) => setNotifications({ ...notifications, internalEmail: e.target.value })}
                placeholder="admin@company.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              />
              <p className="mt-1 text-xs text-gray-400">Optional. Receives a copy of all referral notifications.</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => saveSection('referral_notifications', notifications)}
              disabled={savingKey === 'referral_notifications'}
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-60 transition-colors"
            >
              {savingKey === 'referral_notifications' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>

        {/* Platform */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
          <h2 className="font-heading text-lg font-semibold text-gray-900 mb-4">Platform</h2>
          <p className="text-xs text-gray-400 mb-4">General platform configuration.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                type="text"
                value={platform.companyName}
                onChange={(e) => setPlatform({ ...platform, companyName: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default State</label>
              <select
                value={platform.defaultState}
                onChange={(e) => setPlatform({ ...platform, defaultState: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              >
                <option value="">All States</option>
                <option value="FL">Florida</option>
                <option value="MN">Minnesota</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">Default filter applied on the public clinics/lawyers pages.</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => saveSection('platform', platform)}
              disabled={savingKey === 'platform'}
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-60 transition-colors"
            >
              {savingKey === 'platform' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
