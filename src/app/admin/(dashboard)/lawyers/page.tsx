'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Search, FilterX } from 'lucide-react'
import { BulkActionBar } from '@/components/admin/BulkActionBar'
import { ConfirmModal } from '@/components/admin/ConfirmModal'

interface Lawyer {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  email: string
  practiceAreas: string[]
  website?: string
  region?: string
  county?: string
  zipCode?: string
  available: boolean
}

interface LawyerForm {
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  email: string
  practiceAreas: string
  website: string
  region: string
  county: string
  zipCode: string
  available: boolean
}

const emptyForm: LawyerForm = {
  name: '',
  address: '',
  lat: 0,
  lng: 0,
  phone: '',
  email: '',
  practiceAreas: '',
  website: '',
  region: '',
  county: '',
  zipCode: '',
  available: true,
}

export default function AdminLawyersPage() {
  const [lawyers, setLawyers] = useState<Lawyer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<LawyerForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [availFilter, setAvailFilter] = useState<string>('')
  const [regionFilter, setRegionFilter] = useState<string>('')
  const [countyFilter, setCountyFilter] = useState<string>('')
  const [practiceAreaFilter, setPracticeAreaFilter] = useState<string>('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState<{ action: string; message: string } | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  const fetchLawyers = useCallback(async () => {
    const res = await fetch('/api/admin/lawyers', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    const data = await res.json()
    setLawyers(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLawyers()
  }, [fetchLawyers])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (lawyer: Lawyer) => {
    setEditingId(lawyer.id)
    setForm({
      name: lawyer.name,
      address: lawyer.address,
      lat: lawyer.lat,
      lng: lawyer.lng,
      phone: lawyer.phone,
      email: lawyer.email,
      practiceAreas: lawyer.practiceAreas.join(', '),
      website: lawyer.website || '',
      region: lawyer.region || '',
      county: lawyer.county || '',
      zipCode: lawyer.zipCode || '',
      available: lawyer.available,
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    const practiceAreasArray = form.practiceAreas
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
      practiceAreas: practiceAreasArray,
      website: form.website || null,
      region: form.region || null,
      county: form.county || null,
      zipCode: form.zipCode || null,
      available: form.available,
    }

    try {
      if (editingId) {
        const res = await fetch(`/api/admin/lawyers/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update lawyer')
        }
      } else {
        const res = await fetch('/api/admin/lawyers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create lawyer')
        }
      }

      setShowModal(false)
      setLoading(true)
      await fetchLawyers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/lawyers/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      setLoading(true)
      await fetchLawyers()
    } else {
      alert('Failed to delete lawyer. Please try again.')
      setDeleteConfirm(null)
    }
  }

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    setTogglingId(id)
    try {
      const res = await fetch(`/api/admin/lawyers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: !currentStatus }),
      })
      if (!res.ok) {
        setTogglingId(null)
        return
      }
      setLoading(true)
      await fetchLawyers()
    } catch (error) {
      console.error('Error toggling availability:', error)
    } finally {
      setTogglingId(null)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (filteredItems: Lawyer[]) => {
    const allFilteredIds = filteredItems.map((l) => l.id)
    const allSelected = allFilteredIds.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allFilteredIds))
    }
  }

  const handleBulkToggle = async (available: boolean) => {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/lawyers/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), available }),
      })
      if (res.ok) {
        setSelectedIds(new Set())
        setLoading(true)
        await fetchLawyers()
      }
    } catch (err) {
      console.error('Bulk toggle error:', err)
    } finally {
      setBulkLoading(false)
      setBulkConfirm(null)
    }
  }

  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/lawyers/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (res.ok) {
        setSelectedIds(new Set())
        setLoading(true)
        await fetchLawyers()
      }
    } catch (err) {
      console.error('Bulk delete error:', err)
    } finally {
      setBulkLoading(false)
      setBulkConfirm(null)
    }
  }

  const handleExportCSV = () => {
    const selected = lawyers.filter((l) => selectedIds.has(l.id))
    const headers = ['Name', 'Address', 'Phone', 'Email', 'Practice Areas', 'Region', 'County', 'ZIP Code', 'Available']
    const rows = selected.map((l) => [
      l.name,
      l.address,
      l.phone,
      l.email,
      l.practiceAreas.join('; '),
      l.region || '',
      l.county || '',
      l.zipCode || '',
      l.available ? 'Yes' : 'No',
    ])
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lawyers-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const regionOptions = useMemo(() => {
    const regions = new Set<string>()
    lawyers.forEach((l) => { if (l.region) regions.add(l.region) })
    return Array.from(regions).sort()
  }, [lawyers])

  const countyOptions = useMemo(() => {
    const counties = new Set<string>()
    lawyers.forEach((l) => {
      if (!l.county) return
      if (regionFilter && l.region !== regionFilter) return
      counties.add(l.county)
    })
    return Array.from(counties).sort()
  }, [lawyers, regionFilter])

  const practiceAreaOptions = useMemo(() => {
    const areas = new Set<string>()
    lawyers.forEach((l) => l.practiceAreas.forEach((a) => areas.add(a)))
    return Array.from(areas).sort()
  }, [lawyers])

  useEffect(() => {
    if (countyFilter && !countyOptions.includes(countyFilter)) {
      setCountyFilter('')
    }
  }, [countyOptions, countyFilter])

  const hasActiveFilters = search || regionFilter || countyFilter || practiceAreaFilter || availFilter

  const clearAllFilters = () => {
    setSearch('')
    setRegionFilter('')
    setCountyFilter('')
    setPracticeAreaFilter('')
    setAvailFilter('')
  }

  const stats = useMemo(() => {
    const avail = lawyers.filter((l) => l.available).length
    return { total: lawyers.length, avail, unavail: lawyers.length - avail }
  }, [lawyers])

  const filtered = lawyers.filter((l) => {
    if (regionFilter && l.region !== regionFilter) return false
    if (countyFilter && l.county !== countyFilter) return false
    if (practiceAreaFilter && !l.practiceAreas.includes(practiceAreaFilter)) return false
    if (availFilter === 'available' && !l.available) return false
    if (availFilter === 'unavailable' && l.available) return false
    if (search) {
      const q = search.toLowerCase()
      const matches =
        l.name.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.region && l.region.toLowerCase().includes(q)) ||
        (l.county && l.county.toLowerCase().includes(q)) ||
        l.practiceAreas.some((a) => a.toLowerCase().includes(q))
      if (!matches) return false
    }
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
        <h1 className="font-heading text-2xl font-bold text-gray-900">Lawyers</h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Lawyer
        </button>
      </div>

      {/* Summary Stats */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={clearAllFilters}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            !hasActiveFilters
              ? 'bg-gold/10 text-gold border border-gold/30'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
          }`}
        >
          Total: {stats.total}
        </button>
        <button
          onClick={() => { clearAllFilters(); setAvailFilter('available') }}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            availFilter === 'available' && !regionFilter && !countyFilter && !practiceAreaFilter && !search
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600 border border-gray-200'
          }`}
        >
          Available: {stats.avail}
        </button>
        <button
          onClick={() => { clearAllFilters(); setAvailFilter('unavailable') }}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            availFilter === 'unavailable' && !regionFilter && !countyFilter && !practiceAreaFilter && !search
              ? 'bg-red-100 text-red-700 border border-red-300'
              : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 border border-gray-200'
          }`}
        >
          Unavailable: {stats.unavail}
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, address, practice area..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <FilterX className="h-4 w-4" />
              Clear Filters
            </button>
          )}
          <span className="ml-auto text-sm font-medium text-gray-500">
            {filtered.length} of {lawyers.length} lawyer{lawyers.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          >
            <option value="">All Regions ({regionOptions.length})</option>
            {regionOptions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          >
            <option value="">All Counties ({countyOptions.length})</option>
            {countyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={practiceAreaFilter}
            onChange={(e) => setPracticeAreaFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          >
            <option value="">All Practice Areas ({practiceAreaOptions.length})</option>
            {practiceAreaOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={availFilter}
            onChange={(e) => setAvailFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          >
            <option value="">All Availability</option>
            <option value="available">Available Only</option>
            <option value="unavailable">Unavailable Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))}
                    onChange={() => toggleSelectAll(filtered)}
                    className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Region</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((lawyer) => (
                <tr key={lawyer.id} className={`hover:bg-gray-50/50 ${selectedIds.has(lawyer.id) ? 'bg-gold/5' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lawyer.id)}
                      onChange={() => toggleSelect(lawyer.id)}
                      className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    <div>{lawyer.name}</div>
                    <div className="text-xs text-gray-400">
                      {lawyer.practiceAreas.slice(0, 2).join(', ')}
                      {lawyer.practiceAreas.length > 2 && ` +${lawyer.practiceAreas.length - 2}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lawyer.address}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {lawyer.region || '\u2014'}
                    {lawyer.county && <div className="text-xs text-gray-400">{lawyer.county}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="text-xs">{lawyer.phone}</div>
                    <div className="text-xs text-gray-400">{lawyer.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAvailability(lawyer.id, lawyer.available)}
                      disabled={togglingId === lawyer.id}
                      className={`relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                        lawyer.available
                          ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
                      } ${togglingId === lawyer.id ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'}`}
                    >
                      {togglingId === lawyer.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <span className={`h-2 w-2 rounded-full transition-all duration-200 ${
                            lawyer.available ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-gray-400'
                          }`} />
                          <span>{lawyer.available ? 'Available' : 'Unavailable'}</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(lawyer)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        aria-label={`Edit ${lawyer.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {deleteConfirm === lawyer.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(lawyer.id)}
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
                          onClick={() => setDeleteConfirm(lawyer.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          aria-label={`Delete ${lawyer.name}`}
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

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selectedIds.size}
        entityType="lawyer"
        onMakeAvailable={() => setBulkConfirm({ action: 'available', message: `Make ${selectedIds.size} lawyer(s) available?` })}
        onMakeUnavailable={() => setBulkConfirm({ action: 'unavailable', message: `Make ${selectedIds.size} lawyer(s) unavailable?` })}
        onExportCSV={handleExportCSV}
        onDelete={() => setBulkConfirm({ action: 'delete', message: `Delete ${selectedIds.size} lawyer(s)? This cannot be undone.` })}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Bulk Confirm Modal */}
      <ConfirmModal
        open={bulkConfirm !== null}
        title={bulkConfirm?.action === 'delete' ? 'Delete Lawyers' : 'Update Lawyers'}
        message={bulkConfirm?.message || ''}
        confirmLabel={bulkConfirm?.action === 'delete' ? 'Delete' : 'Confirm'}
        loading={bulkLoading}
        onConfirm={() => {
          if (bulkConfirm?.action === 'delete') handleBulkDelete()
          else if (bulkConfirm?.action === 'available') handleBulkToggle(true)
          else if (bulkConfirm?.action === 'unavailable') handleBulkToggle(false)
        }}
        onCancel={() => setBulkConfirm(null)}
      />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Lawyer' : 'New Lawyer'}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Lawyer / Firm Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="Law Firm Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="123 Legal Ave, City, FL 00000"
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
                    placeholder="info@lawfirm.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Practice Areas (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.practiceAreas}
                  onChange={(e) => setForm({ ...form, practiceAreas: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="Criminal Defense, Personal Injury, Family Law"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <input
                    type="text"
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="Region"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">County</label>
                  <input
                    type="text"
                    value={form.county}
                    onChange={(e) => setForm({ ...form, county: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="County"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                  <input
                    type="text"
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="33101"
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
                  placeholder="https://lawfirm.com"
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
                  Available
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
