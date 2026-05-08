'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Search, AlertTriangle, RefreshCw } from 'lucide-react'
import { BulkActionBar } from '@/components/admin/BulkActionBar'
import { ConfirmModal } from '@/components/admin/ConfirmModal'
import type { UserRole } from '@/types/professionals'

interface UserRow {
  id: string
  name: string
  username: string
  role: UserRole
  email: string
  firmName?: string
  clinicId?: string
  lawyerId?: string
  state?: string
  createdAt?: string
}

interface ClinicOption {
  id: string
  name: string
  address: string
}

interface LawyerOption {
  id: string
  name: string
  region?: string
  county?: string
}

interface UserForm {
  name: string
  username: string
  password: string
  role: UserRole
  email: string
  firmName: string
  clinicId: string
  lawyerId: string
  state: string
}

const emptyForm: UserForm = {
  name: '',
  username: '',
  password: '',
  role: 'lawyer',
  email: '',
  firmName: '',
  clinicId: '',
  lawyerId: '',
  state: '',
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [lawyerFirms, setLawyerFirms] = useState<LawyerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [clinicSearch, setClinicSearch] = useState('')
  const [lawyerSearch, setLawyerSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState<{ action: string; message: string } | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  // Defensive fetcher: never throws to a render boundary, surfaces a
  // human-readable error string that we can display inline.
  async function safeFetchJson<T>(url: string, label: string): Promise<{ data?: T; error?: string }> {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`
        try {
          const body = await res.json()
          if (body?.error) detail = `${body.error} (HTTP ${res.status})`
        } catch { /* non-JSON response */ }
        return { error: `${label}: ${detail}` }
      }
      const data = await res.json()
      return { data: data as T }
    } catch (err) {
      return { error: `${label}: ${err instanceof Error ? err.message : 'network error'}` }
    }
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    const [u, c, l] = await Promise.all([
      safeFetchJson<UserRow[]>('/api/admin/users', 'Users'),
      safeFetchJson<ClinicOption[]>('/api/professionals/clinics', 'Clinics'),
      safeFetchJson<LawyerOption[]>('/api/professionals/lawyers', 'Lawyer firms'),
    ])

    const errors: string[] = []
    if (u.error) errors.push(u.error); else setUsers(Array.isArray(u.data) ? u.data : [])
    if (c.error) errors.push(c.error)
    else setClinics(
      (Array.isArray(c.data) ? c.data : []).map((c) => ({
        id: c.id, name: c.name, address: c.address ?? '',
      }))
    )
    if (l.error) errors.push(l.error)
    else setLawyerFirms(
      (Array.isArray(l.data) ? l.data : []).map((l) => ({
        id: l.id, name: l.name, region: l.region, county: l.county,
      }))
    )

    if (errors.length > 0) setLoadError(errors.join(' · '))
    setLoading(false)
  }, [])

  const fetchUsers = useCallback(async () => {
    const u = await safeFetchJson<UserRow[]>('/api/admin/users', 'Users')
    if (u.error) setLoadError(u.error)
    else setUsers(Array.isArray(u.data) ? u.data : [])
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Build a map of clinicId -> clinicName for the table
  const clinicNameMap = new Map(clinics.map((c) => [c.id, c.name]))
  const lawyerNameMap = new Map(lawyerFirms.map((l) => [l.id, l.name]))

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setClinicSearch('')
    setLawyerSearch('')
    setError('')
    setShowModal(true)
  }

  const openEdit = (user: UserRow) => {
    setEditingId(user.id)
    setForm({
      name: user.name,
      username: user.username,
      password: '',
      role: user.role,
      email: user.email,
      firmName: user.firmName || '',
      clinicId: user.clinicId || '',
      lawyerId: user.lawyerId || '',
      state: user.state || '',
    })
    setClinicSearch(user.clinicId ? clinicNameMap.get(user.clinicId) || '' : '')
    setLawyerSearch(user.lawyerId ? lawyerNameMap.get(user.lawyerId) || '' : '')
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    // Validate clinic selection for clinic role
    if (form.role === 'clinic' && !form.clinicId) {
      setError('Please select a clinic from the list')
      setSaving(false)
      return
    }

    try {
      if (editingId) {
        const body: Record<string, string> = {
          name: form.name,
          username: form.username,
          role: form.role,
          email: form.email,
        }
        if (form.password) body.password = form.password
        if (form.role === 'lawyer') {
          body.firmName = form.firmName
          body.state = form.state
          body.lawyerId = form.lawyerId
        }
        if (form.role === 'clinic') body.clinicId = form.clinicId

        const res = await fetch(`/api/admin/users/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update user')
        }
      } else {
        if (!form.password) {
          setError('Password is required for new users')
          setSaving(false)
          return
        }
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create user')
        }
      }

      setShowModal(false)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      await fetchUsers()
    } else {
      let message = 'Failed to delete user'
      try {
        const data = await res.json()
        message = data.error || message
      } catch { /* ignore */ }
      alert(message)
      setDeleteConfirm(null)
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

  const toggleSelectAll = () => {
    const allIds = users.map((u) => u.id)
    const allSelected = allIds.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  const handleBulkDelete = async () => {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/users/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (res.ok) {
        setSelectedIds(new Set())
        await fetchUsers()
      } else {
        const data = await res.json()
        alert(data.error || 'Bulk delete failed')
      }
    } catch (err) {
      console.error('Bulk delete error:', err)
    } finally {
      setBulkLoading(false)
      setBulkConfirm(null)
    }
  }

  // Filter clinics for the searchable dropdown
  const filteredClinics = clinicSearch.trim()
    ? clinics.filter(
        (c) =>
          c.name.toLowerCase().includes(clinicSearch.toLowerCase()) ||
          c.address.toLowerCase().includes(clinicSearch.toLowerCase())
      )
    : clinics

  // Show dropdown only when searching and no clinic is selected yet, or when editing the search
  const selectedClinicName = form.clinicId ? clinicNameMap.get(form.clinicId) : null
  const showClinicDropdown =
    form.role === 'clinic' &&
    clinicSearch.trim() !== '' &&
    clinicSearch !== selectedClinicName

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
        <h1 className="font-heading text-2xl font-bold text-gray-900">Users</h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-white hover:bg-gold-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          New User
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Some data failed to load</p>
            <p className="text-xs text-amber-800 mt-1 break-words font-mono">{loadError}</p>
          </div>
          <button
            onClick={fetchAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={Array.isArray(users) && users.length > 0 && users.every((u) => selectedIds.has(u.id))}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(Array.isArray(users) ? users : []).map((user) => (
                <tr key={user.id} className={`hover:bg-gray-50/50 ${selectedIds.has(user.id) ? 'bg-gold/5' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(user.id)}
                      onChange={() => toggleSelect(user.id)}
                      className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.username}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : user.role === 'lawyer'
                        ? 'bg-blue-100 text-blue-700'
                        : user.role === 'referrer'
                        ? 'bg-orange-100 text-orange-700'
                        : user.role === 'partner'
                        ? 'bg-teal-100 text-teal-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {user.role === 'lawyer' ? 'Attorney' : user.role === 'clinic' ? 'Clinic' : user.role === 'referrer' ? 'Referrer' : user.role === 'partner' ? 'Partner' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {user.role === 'lawyer' && (
                      <span>
                        {user.lawyerId
                          ? (lawyerNameMap.get(user.lawyerId) || user.firmName || '—')
                          : (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              ⚠ Not linked to firm
                            </span>
                          )}
                        {user.state && (
                          <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            {user.state}
                          </span>
                        )}
                      </span>
                    )}
                    {user.role === 'clinic' && (clinicNameMap.get(user.clinicId || '') || user.clinicId || '—')}
                    {user.role === 'referrer' && '—'}
                    {user.role === 'partner' && '—'}
                    {user.role === 'admin' && '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(user)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {deleteConfirm === user.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(user.id)}
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
                          onClick={() => setDeleteConfirm(user.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          aria-label={`Delete ${user.name}`}
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
        entityType="user"
        onDelete={() => setBulkConfirm({ action: 'delete', message: `Delete ${selectedIds.size} user(s)? This cannot be undone.` })}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Bulk Confirm Modal */}
      <ConfirmModal
        open={bulkConfirm !== null}
        title="Delete Users"
        message={bulkConfirm?.message || ''}
        confirmLabel="Delete"
        loading={bulkLoading}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkConfirm(null)}
      />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-semibold text-gray-900">
                {editingId ? 'Edit User' : 'New User'}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="letters, numbers, underscore"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingId && <span className="text-gray-400">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder={editingId ? '********' : 'Min. 8 characters'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => {
                    const newRole = e.target.value as UserRole
                    setForm({ ...form, role: newRole, clinicId: '', lawyerId: '', firmName: '', state: '' })
                    setClinicSearch('')
                    setLawyerSearch('')
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                >
                  <option value="lawyer">Attorney</option>
                  <option value="clinic">Clinic</option>
                  <option value="referrer">Referrer</option>
                  <option value="partner">Partner</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                  placeholder="user@example.com"
                />
              </div>

              {form.role === 'lawyer' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Linked Firm
                      {form.lawyerId && (
                        <span className="ml-2 text-xs text-emerald-600 font-normal">
                          Selected: {lawyerNameMap.get(form.lawyerId)}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={lawyerSearch}
                        onChange={(e) => {
                          setLawyerSearch(e.target.value)
                          const selectedName = form.lawyerId ? lawyerNameMap.get(form.lawyerId) : null
                          if (e.target.value !== selectedName) {
                            setForm({ ...form, lawyerId: '' })
                          }
                        }}
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                        placeholder="Search firm by name or region..."
                      />
                      {(() => {
                        const selectedName = form.lawyerId ? lawyerNameMap.get(form.lawyerId) : null
                        const showLawyerDropdown = lawyerSearch.trim() !== '' && lawyerSearch !== selectedName
                        if (!showLawyerDropdown) return null
                        const q = lawyerSearch.toLowerCase()
                        const filtered = lawyerFirms.filter(
                          (l) =>
                            l.name.toLowerCase().includes(q) ||
                            (l.region && l.region.toLowerCase().includes(q)) ||
                            (l.county && l.county.toLowerCase().includes(q))
                        )
                        return (
                          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                            {filtered.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-gray-500">No firms found</div>
                            ) : (
                              filtered.slice(0, 20).map((l) => (
                                <button
                                  key={l.id}
                                  type="button"
                                  onClick={() => {
                                    setForm({ ...form, lawyerId: l.id })
                                    setLawyerSearch(l.name)
                                  }}
                                  className="w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors border-b border-gray-50 last:border-0"
                                >
                                  <p className="text-sm font-medium text-gray-900">{l.name}</p>
                                  {(l.region || l.county) && (
                                    <p className="text-xs text-gray-500 truncate">
                                      {[l.region, l.county && `${l.county} County`].filter(Boolean).join(' · ')}
                                    </p>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Required for the attorney to see/manage referrals targeted at the firm.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Firm Name (legacy display)</label>
                    <input
                      type="text"
                      value={form.firmName}
                      onChange={(e) => setForm({ ...form, firmName: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                      placeholder="Law firm name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State Filter</label>
                    <select
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    >
                      <option value="">All States</option>
                      <option value="FL">Florida (FL)</option>
                      <option value="MN">Minnesota (MN)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Limits which clinics this attorney can see</p>
                  </div>
                </>
              )}

              {form.role === 'clinic' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Linked Clinic
                    {form.clinicId && (
                      <span className="ml-2 text-xs text-emerald-600 font-normal">
                        Selected: {clinicNameMap.get(form.clinicId)}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={clinicSearch}
                      onChange={(e) => {
                        setClinicSearch(e.target.value)
                        // Clear selection if user edits the search
                        if (e.target.value !== selectedClinicName) {
                          setForm({ ...form, clinicId: '' })
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                      placeholder="Search clinic by name or address..."
                    />
                    {/* Dropdown results */}
                    {showClinicDropdown && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                        {filteredClinics.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">No clinics found</div>
                        ) : (
                          filteredClinics.slice(0, 20).map((clinic) => (
                            <button
                              key={clinic.id}
                              type="button"
                              onClick={() => {
                                setForm({ ...form, clinicId: clinic.id })
                                setClinicSearch(clinic.name)
                              }}
                              className="w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors border-b border-gray-50 last:border-0"
                            >
                              <p className="text-sm font-medium text-gray-900">{clinic.name}</p>
                              <p className="text-xs text-gray-500 truncate">{clinic.address}</p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {!form.clinicId && clinicSearch && clinicSearch !== selectedClinicName && (
                    <p className="mt-1 text-xs text-amber-600">Select a clinic from the list above</p>
                  )}
                </div>
              )}
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
