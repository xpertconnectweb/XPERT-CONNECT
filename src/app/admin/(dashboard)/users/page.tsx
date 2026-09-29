'use client'

import { useEffect, useState, useCallback, useMemo, useDeferredValue, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Search, AlertTriangle, RefreshCw, FilterX, ChevronLeft, ChevronRight } from 'lucide-react'
import { BulkActionBar } from '@/components/admin/BulkActionBar'
import { ConfirmModal } from '@/components/admin/ConfirmModal'
import type { UserRole } from '@/types/professionals'
import { useProviderSearchIds } from '@/hooks/useProviderSearchIds'

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
  // Read-only, from toAdminSafeUser. Never the full number: the API
  // returns only the last four digits, so this screen cannot be used
  // to export users' mobiles.
  phoneLast4?: string
  phoneVerified?: boolean
  smsReferralAlerts?: boolean
  smsOptedOut?: boolean
}

/**
 * Both pickers are fed by the professionals APIs, which withhold the street
 * address and the phone (see src/lib/api/public-shape.ts) but do return the
 * coarse location. That is why these carry `city`/`state`/`zipCode` and not
 * `address`: the picker used to advertise an address search it could never
 * perform, because the field arrived empty every time.
 *
 * `lat`/`lng`/`available` are here so the rows satisfy the search core's
 * `ClinicLike` / `LawyerLike` shapes.
 */
interface ClinicOption {
  id: string
  name: string
  lat: number
  lng: number
  available: boolean
  city?: string | null
  state?: string | null
  zipCode?: string | null
  specialties?: string[]
}

interface LawyerOption {
  id: string
  name: string
  lat: number
  lng: number
  available: boolean
  region?: string
  county?: string
  city?: string | null
  state?: string | null
  zipCode?: string | null
  practiceAreas?: string[]
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

// One entry per role, in the order the table groups them: the handful
// of staff and attorney accounts first, the 1,100+ clinic logins last.
const ROLE_META: Record<UserRole, { label: string; plural: string; badge: string; chip: string }> = {
  admin: { label: 'Admin', plural: 'Admins', badge: 'bg-purple-100 text-purple-700', chip: 'bg-purple-100 text-purple-700 border-purple-300' },
  lawyer: { label: 'Attorney', plural: 'Attorneys', badge: 'bg-blue-100 text-blue-700', chip: 'bg-blue-100 text-blue-700 border-blue-300' },
  referrer: { label: 'Referrer', plural: 'Referrers', badge: 'bg-orange-100 text-orange-700', chip: 'bg-orange-100 text-orange-700 border-orange-300' },
  partner: { label: 'Partner', plural: 'Partners', badge: 'bg-teal-100 text-teal-700', chip: 'bg-teal-100 text-teal-700 border-teal-300' },
  directory: { label: 'Legal Directory', plural: 'Legal Directory', badge: 'bg-slate-100 text-slate-700', chip: 'bg-slate-100 text-slate-700 border-slate-300' },
  clinic: { label: 'Clinic', plural: 'Clinics', badge: 'bg-emerald-100 text-emerald-700', chip: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
}
const ROLE_ORDER = Object.keys(ROLE_META) as UserRole[]

const USERS_PER_PAGE = 50

// Case- and accent-insensitive, so "clinica" finds "Clínica".
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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
  const [phoneConfirm, setPhoneConfirm] = useState<string | null>(null)
  const [phoneClearing, setPhoneClearing] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [stateFilter, setStateFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState<'' | 'with' | 'without'>('')
  const [page, setPage] = useState(0)
  // Typing stays responsive while 1,100+ rows re-filter behind it.
  const deferredSearch = useDeferredValue(search)
  const tableRef = useRef<HTMLDivElement>(null)

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
        id: c.id, name: c.name, lat: c.lat, lng: c.lng, available: c.available,
        city: c.city, state: c.state, zipCode: c.zipCode, specialties: c.specialties,
      }))
    )
    if (l.error) errors.push(l.error)
    else setLawyerFirms(
      (Array.isArray(l.data) ? l.data : []).map((l) => ({
        id: l.id, name: l.name, lat: l.lat, lng: l.lng, available: l.available,
        region: l.region, county: l.county,
        city: l.city, state: l.state, zipCode: l.zipCode, practiceAreas: l.practiceAreas,
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
  const clinicNameMap = useMemo(() => new Map(clinics.map((c) => [c.id, c.name])), [clinics])
  const lawyerNameMap = useMemo(() => new Map(lawyerFirms.map((l) => [l.id, l.name])), [lawyerFirms])
  const clinicStateMap = useMemo(() => new Map(clinics.map((c) => [c.id, c.state || ''])), [clinics])

  // Clinic users carry no state of their own; theirs is the clinic's.
  const userState = useCallback(
    (u: UserRow) => u.state || (u.clinicId ? clinicStateMap.get(u.clinicId) : '') || '',
    [clinicStateMap]
  )

  const userOrg = useCallback(
    (u: UserRow) =>
      u.role === 'clinic'
        ? clinicNameMap.get(u.clinicId || '') || ''
        : u.role === 'lawyer'
        ? (u.lawyerId && lawyerNameMap.get(u.lawyerId)) || u.firmName || ''
        : '',
    [clinicNameMap, lawyerNameMap]
  )

  const roleCounts = useMemo(() => {
    const counts = Object.fromEntries(ROLE_ORDER.map((r) => [r, 0])) as Record<UserRole, number>
    users.forEach((u) => { if (u.role in counts) counts[u.role]++ })
    return counts
  }, [users])

  const stateOptions = useMemo(
    () => Array.from(new Set(users.map(userState).filter(Boolean))).sort(),
    [users, userState]
  )

  const filtered = useMemo(() => {
    const q = fold(deferredSearch.trim())
    return users
      .filter((u) => {
        if (roleFilter && u.role !== roleFilter) return false
        if (stateFilter === 'none' ? userState(u) !== '' : stateFilter && userState(u) !== stateFilter) return false
        if (emailFilter === 'with' && !u.email) return false
        if (emailFilter === 'without' && u.email) return false
        if (q && !fold(`${u.name} ${u.username} ${u.email} ${userOrg(u)}`).includes(q)) return false
        return true
      })
      .sort((a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        a.name.localeCompare(b.name)
      )
  }, [users, deferredSearch, roleFilter, stateFilter, emailFilter, userState, userOrg])

  const pageCount = Math.max(1, Math.ceil(filtered.length / USERS_PER_PAGE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(currentPage * USERS_PER_PAGE, (currentPage + 1) * USERS_PER_PAGE)

  // The pager sits under the table; moving pages from there should land
  // on the first new row, not on the bottom of the next fifty.
  const goToPage = (p: number) => {
    setPage(p)
    tableRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Any filter change starts over at page one.
  useEffect(() => { setPage(0) }, [deferredSearch, roleFilter, stateFilter, emailFilter])

  const hasActiveFilters = Boolean(search || roleFilter || stateFilter || emailFilter)
  const clearAllFilters = () => {
    setSearch('')
    setRoleFilter('')
    setStateFilter('')
    setEmailFilter('')
  }

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
        if (form.role === 'directory') body.state = form.state
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

  // The header checkbox covers the rows on screen, not every user: with
  // 1,100+ accounts behind the filters, "select all" feeding the bulk
  // delete must never reach rows nobody is looking at.
  const pageIds = pageRows.map((u) => u.id)
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pageIds.forEach((id) => (pageAllSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }

  /**
   * The only SMS write an admin has. Its own endpoint rather than a
   * field on the user PATCH, so a stray key in a form submission can
   * never trigger it and it produces its own audit entry.
   */
  const handleClearPhone = async () => {
    if (!phoneConfirm) return
    setPhoneClearing(true)
    try {
      const res = await fetch(`/api/admin/users/${phoneConfirm}/phone`, { method: 'DELETE' })
      if (!res.ok) {
        setError('Could not clear the phone number')
        return
      }
      setPhoneConfirm(null)
      await fetchAll()
    } finally {
      setPhoneClearing(false)
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

  // Both pickers run on the shared search core, same as the maps and the
  // clinics/lawyers tables. Hooks have to be called unconditionally, so these
  // sit here rather than next to the JSX that consumes them.
  const clinicSearchIds = useProviderSearchIds(clinics, clinicSearch, 'clinic')
  const lawyerSearchIds = useProviderSearchIds(lawyerFirms, lawyerSearch, 'lawyer')

  const filteredClinics = clinicSearchIds
    ? clinics.filter((c) => clinicSearchIds.has(c.id))
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

      {/* Role chips: a count per role that doubles as a one-click filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={clearAllFilters}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            !hasActiveFilters
              ? 'bg-gold/10 text-gold border-gold/30'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
          }`}
        >
          All users: {users.length.toLocaleString()}
        </button>
        {ROLE_ORDER.filter((r) => roleCounts[r] > 0).map((r) => (
          <button
            key={r}
            onClick={() => { clearAllFilters(); setRoleFilter(r) }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              roleFilter === r && !search && !stateFilter && !emailFilter
                ? ROLE_META[r].chip
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
            }`}
          >
            {ROLE_META[r].plural}: {roleCounts[r].toLocaleString()}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, username, email, firm or clinic..."
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
            {filtered.length.toLocaleString()} of {users.length.toLocaleString()} user{users.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          >
            <option value="">All Roles</option>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>{ROLE_META[r].label} ({roleCounts[r]})</option>
            ))}
          </select>

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          >
            <option value="">All States</option>
            {stateOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="none">No state</option>
          </select>

          <select
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value as '' | 'with' | 'without')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          >
            <option value="">Any Email</option>
            <option value="with">With email</option>
            <option value="without">Without email (no notifications)</option>
          </select>
        </div>
      </div>

      {/* Users table */}
      <div ref={tableRef} className="scroll-mt-4 rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    onChange={toggleSelectAll}
                    title="Select the users on this page"
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
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                    No users match these filters.
                  </td>
                </tr>
              )}
              {pageRows.map((user) => (
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
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${(ROLE_META[user.role] ?? ROLE_META.admin).badge}`}>
                      {(ROLE_META[user.role] ?? ROLE_META.admin).label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.email || <span className="text-xs text-gray-400">No email</span>}
                  </td>
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
                    {user.role === 'clinic' && (
                      <span>
                        {clinicNameMap.get(user.clinicId || '') || user.clinicId || '—'}
                        {userState(user) && (
                          <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            {userState(user)}
                          </span>
                        )}
                      </span>
                    )}
                    {user.role === 'directory' && (
                      user.state
                        ? (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            {user.state}
                          </span>
                        )
                        : <span className="text-gray-400">All states</span>
                    )}
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
        {filtered.length > USERS_PER_PAGE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
            <span>
              Showing {(currentPage * USERS_PER_PAGE + 1).toLocaleString()}–
              {Math.min((currentPage + 1) * USERS_PER_PAGE, filtered.length).toLocaleString()} of{' '}
              {filtered.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-xs">
                Page {currentPage + 1} of {pageCount}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
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

      <ConfirmModal
        open={phoneConfirm !== null}
        title="Clear phone & SMS consent"
        message="This removes the user's mobile number, their verification and their consent record. They will stop receiving text alerts and would have to opt in again themselves. Any record of a STOP reply is kept."
        confirmLabel="Clear"
        loading={phoneClearing}
        onConfirm={handleClearPhone}
        onCancel={() => setPhoneConfirm(null)}
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
                  <option value="directory">Legal Directory</option>
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

              {/* SMS status — READ ONLY, and deliberately so.
                  There is no input here and no key for it in the PATCH
                  allowlist: an admin must never be able to enter a
                  number or switch alerts on for someone else, because
                  consent recorded by a third party is not consent.
                  Clearing is the one action offered, since revocation
                  is always safe. */}
              {editingId && (() => {
                const target = users.find((u) => u.id === editingId)
                if (!target) return null
                return (
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">SMS alerts</p>
                    {target.phoneLast4 ? (
                      <div className="space-y-1 text-xs text-gray-600">
                        <p>
                          Number: <span className="font-mono">••• ••• {target.phoneLast4}</span>
                          {target.phoneVerified ? (
                            <span className="ml-2 text-emerald-600">verified</span>
                          ) : (
                            <span className="ml-2 text-amber-600">not verified</span>
                          )}
                        </p>
                        <p>
                          Alerts:{' '}
                          {target.smsReferralAlerts ? (
                            <span className="text-emerald-600">on</span>
                          ) : (
                            <span className="text-gray-500">off</span>
                          )}
                          {target.smsOptedOut && (
                            <span className="ml-2 text-red-600">replied STOP</span>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => setPhoneConfirm(target.id)}
                          className="mt-2 text-xs text-red-600 hover:text-red-700"
                        >
                          Clear phone &amp; SMS consent
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">
                        No number on file. Only the user can add one, from their own
                        Notifications page.
                      </p>
                    )}
                  </div>
                )
              })()}

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
                        placeholder="Search firm by name, city or county..."
                      />
                      {(() => {
                        const selectedName = form.lawyerId ? lawyerNameMap.get(form.lawyerId) : null
                        const showLawyerDropdown = lawyerSearch.trim() !== '' && lawyerSearch !== selectedName
                        if (!showLawyerDropdown) return null
                        const filtered = lawyerSearchIds
                          ? lawyerFirms.filter((l) => lawyerSearchIds.has(l.id))
                          : lawyerFirms
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
                </>
              )}

              {/* Shared by attorney and legal-directory accounts: both are
                  scoped to a state by src/lib/data.ts getLawyersByState /
                  getClinicsByState. Leaving it blank means every state. */}
              {(form.role === 'lawyer' || form.role === 'directory') && (
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
                  <p className="mt-1 text-xs text-gray-400">
                    {form.role === 'lawyer'
                      ? 'Limits which clinics this attorney can see'
                      : 'Limits which attorneys this account can browse, and centers their map'}
                  </p>
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
                      placeholder="Search clinic by name, city or ZIP..."
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
                              <p className="text-xs text-gray-500 truncate">
                                {[clinic.city, clinic.state, clinic.zipCode].filter(Boolean).join(', ')}
                              </p>
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
