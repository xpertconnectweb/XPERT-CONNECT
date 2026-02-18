'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Search } from 'lucide-react'
import type { UserRole } from '@/types/professionals'

interface UserRow {
  id: string
  name: string
  username: string
  role: UserRole
  email: string
  firmName?: string
  clinicId?: string
  createdAt?: string
}

interface ClinicOption {
  id: string
  name: string
  address: string
}

interface UserForm {
  name: string
  username: string
  password: string
  role: UserRole
  email: string
  firmName: string
  clinicId: string
}

const emptyForm: UserForm = {
  name: '',
  username: '',
  password: '',
  role: 'lawyer',
  email: '',
  firmName: '',
  clinicId: '',
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [clinicSearch, setClinicSearch] = useState('')

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data)
    setLoading(false)
  }, [])

  const fetchClinics = useCallback(async () => {
    const res = await fetch('/api/professionals/clinics')
    if (res.ok) {
      const data = await res.json()
      setClinics(data.map((c: ClinicOption) => ({ id: c.id, name: c.name, address: c.address })))
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchClinics()
  }, [fetchUsers, fetchClinics])

  // Build a map of clinicId -> clinicName for the table
  const clinicNameMap = new Map(clinics.map((c) => [c.id, c.name]))

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setClinicSearch('')
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
    })
    // Pre-fill clinic search with current clinic name
    if (user.clinicId) {
      setClinicSearch(clinicNameMap.get(user.clinicId) || '')
    } else {
      setClinicSearch('')
    }
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
        if (form.role === 'lawyer') body.firmName = form.firmName
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

      {/* Users table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.username}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : user.role === 'lawyer'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {user.role === 'lawyer' ? 'Attorney' : user.role === 'clinic' ? 'Clinic' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {user.role === 'lawyer' && (user.firmName || '—')}
                    {user.role === 'clinic' && (clinicNameMap.get(user.clinicId || '') || user.clinicId || '—')}
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
                    setForm({ ...form, role: newRole, clinicId: '', firmName: '' })
                    setClinicSearch('')
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                >
                  <option value="lawyer">Attorney</option>
                  <option value="clinic">Clinic</option>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Firm Name</label>
                  <input
                    type="text"
                    value={form.firmName}
                    onChange={(e) => setForm({ ...form, firmName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                    placeholder="Law firm name"
                  />
                </div>
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
