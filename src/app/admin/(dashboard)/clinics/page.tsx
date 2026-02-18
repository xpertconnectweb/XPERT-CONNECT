'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Search, ToggleLeft, ToggleRight } from 'lucide-react'

interface Clinic {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  email: string
  specialties: string[]
  website?: string
  region?: string
  county?: string
  available: boolean
}

interface ClinicForm {
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  email: string
  specialties: string
  website: string
  region: string
  county: string
  available: boolean
}

const emptyForm: ClinicForm = {
  name: '',
  address: '',
  lat: 0,
  lng: 0,
  phone: '',
  email: '',
  specialties: '',
  website: '',
  region: '',
  county: '',
  available: true,
}

export default function AdminClinicsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClinicForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [availFilter, setAvailFilter] = useState<string>('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchClinics = useCallback(async () => {
    const res = await fetch('/api/professionals/clinics')
    const data = await res.json()
    setClinics(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClinics()
  }, [fetchClinics])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (clinic: Clinic) => {
    setEditingId(clinic.id)
    setForm({
      name: clinic.name,
      address: clinic.address,
      lat: clinic.lat,
      lng: clinic.lng,
      phone: clinic.phone,
      email: clinic.email,
      specialties: clinic.specialties.join(', '),
      website: clinic.website || '',
      region: clinic.region || '',
      county: clinic.county || '',
      available: clinic.available,
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const specialtiesArray = form.specialties
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const payload = {
      name: form.name,
      address: form.address,
      lat: form.lat,
      lng: form.lng,
      phone: form.phone,
      email: form.email,
      specialties: specialtiesArray,
      website: form.website || null,
      region: form.region || null,
      county: form.county || null,
      available: form.available,
    }

    try {
      if (editingId) {
        const res = await fetch(`/api/admin/clinics/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update clinic')
        }
      } else {
        const res = await fetch('/api/admin/clinics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create clinic')
        }
      }

      setShowModal(false)
      await fetchClinics()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/clinics/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      await fetchClinics()
    }
  }

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    setTogglingId(id)
    try {
      const res = await fetch(`/api/admin/clinics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: !currentStatus }),
      })

      if (!res.ok) {
        console.error('Failed to toggle availability')
        setTogglingId(null)
        return
      }

      await fetchClinics()
    } catch (error) {
      console.error('Error toggling availability:', error)
    } finally {
      setTogglingId(null)
    }
  }

  const filtered = clinics.filter((c) => {
    if (search) {
      const q = search.toLowerCase()
      const matches =
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.region && c.region.toLowerCase().includes(q)) ||
        (c.county && c.county.toLowerCase().includes(q))
      if (!matches) return false
    }
    if (availFilter === 'available' && !c.available) return false
    if (availFilter === 'unavailable' && c.available) return false
    return true
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
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-gray-900">Clinics</h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Clinic
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search clinics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          />
        </div>
        <select
          value={availFilter}
          onChange={(e) => setAvailFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        >
          <option value="">All Clinics</option>
          <option value="available">Available Only</option>
          <option value="unavailable">Unavailable Only</option>
        </select>
        <span className="text-sm text-gray-500">
          {filtered.length} clinic{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Clinics table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Region</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((clinic) => (
                <tr key={clinic.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    <div>{clinic.name}</div>
                    <div className="text-xs text-gray-400">
                      {clinic.specialties.slice(0, 2).join(', ')}
                      {clinic.specialties.length > 2 && ` +${clinic.specialties.length - 2}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{clinic.address}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {clinic.region || '—'}
                    {clinic.county && <div className="text-xs text-gray-400">{clinic.county}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="text-xs">{clinic.phone}</div>
                    <div className="text-xs text-gray-400">{clinic.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAvailability(clinic.id, clinic.available)}
                      disabled={togglingId === clinic.id}
                      className={`relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                        clinic.available
                          ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
                      } ${togglingId === clinic.id ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'}`}
                    >
                      {togglingId === clinic.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <span className={`h-2 w-2 rounded-full transition-all duration-200 ${
                            clinic.available ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-gray-400'
                          }`} />
                          <span>{clinic.available ? 'Available' : 'Unavailable'}</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(clinic)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        aria-label={`Edit ${clinic.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {deleteConfirm === clinic.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(clinic.id)}
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
                          onClick={() => setDeleteConfirm(clinic.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          aria-label={`Delete ${clinic.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Clinic' : 'New Clinic'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="Florida Injury Centers"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="123 Medical Plaza, Miami, FL 33101"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude *</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="25.7617"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude *</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="-80.1918"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="+1 (305) 555-0123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="info@clinic.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Specialties (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.specialties}
                  onChange={(e) => setForm({ ...form, specialties: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="Chiropractic, Physical Therapy, Pain Management"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <input
                    type="text"
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="South Florida"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">County</label>
                  <input
                    type="text"
                    value={form.county}
                    onChange={(e) => setForm({ ...form, county: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="Miami-Dade"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="https://clinic.com"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="available"
                  checked={form.available}
                  onChange={(e) => setForm({ ...form, available: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold"
                />
                <label htmlFor="available" className="text-sm font-medium text-gray-700">
                  Available for referrals
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-60 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
