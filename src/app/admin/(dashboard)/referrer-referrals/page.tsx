'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Search, X, Trash2, Eye, FileText, Clock, UserCheck, CheckCircle2 } from 'lucide-react'
import type { ReferrerReferral, ReferrerReferralStatus, CaseConfirmedStatus } from '@/types/professionals'

interface ClinicOption { id: string; name: string; address: string }
interface LawyerOption { id: string; name: string; address: string }

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  assigned: { label: 'Assigned', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  in_process: { label: 'In Process', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
}

const caseConfig: Record<string, { label: string; bg: string; text: string; dot: string; ring: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', ring: 'ring-amber-600/20' },
  confirmed: { label: 'Confirmed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', ring: 'ring-emerald-600/20' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminReferrerReferralsPage() {
  const [referrals, setReferrals] = useState<ReferrerReferral[]>([])
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [lawyers, setLawyers] = useState<LawyerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterState, setFilterState] = useState('')
  const [selected, setSelected] = useState<ReferrerReferral | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Assignment form
  const [assignClinicId, setAssignClinicId] = useState('')
  const [assignClinicName, setAssignClinicName] = useState('')
  const [assignLawyerId, setAssignLawyerId] = useState('')
  const [assignLawyerName, setAssignLawyerName] = useState('')
  const [assignStatus, setAssignStatus] = useState<ReferrerReferralStatus>('pending')
  const [assignCaseConfirmed, setAssignCaseConfirmed] = useState<CaseConfirmedStatus>('pending')
  const [adminNotes, setAdminNotes] = useState('')
  const [clinicSearch, setClinicSearch] = useState('')
  const [lawyerSearch, setLawyerSearch] = useState('')
  const [error, setError] = useState('')

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/referrer-referrals')
      if (!res.ok) throw new Error('Failed to fetch')
      setReferrals(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchClinics = useCallback(async () => {
    const res = await fetch('/api/admin/clinics')
    if (res.ok) {
      const data = await res.json()
      setClinics(data.map((c: ClinicOption) => ({ id: c.id, name: c.name, address: c.address })))
    }
  }, [])

  const fetchLawyers = useCallback(async () => {
    const res = await fetch('/api/admin/lawyers')
    if (res.ok) {
      const data = await res.json()
      setLawyers(data.map((l: LawyerOption) => ({ id: l.id, name: l.name, address: l.address })))
    }
  }, [])

  useEffect(() => {
    fetchReferrals()
    fetchClinics()
    fetchLawyers()
  }, [fetchReferrals, fetchClinics, fetchLawyers])

  // Escape key + body overflow lock for modal
  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [selected])

  // Stats
  const total = referrals.length
  const pendingCount = referrals.filter((r) => r.status === 'pending').length
  const activeCount = referrals.filter((r) => r.status === 'assigned' || r.status === 'in_process').length
  const completedCount = referrals.filter((r) => r.status === 'completed').length

  const openDetail = (r: ReferrerReferral) => {
    setSelected(r)
    setAssignClinicId(r.assignedClinicId || '')
    setAssignClinicName(r.assignedClinicName || '')
    setAssignLawyerId(r.assignedLawyerId || '')
    setAssignLawyerName(r.assignedLawyerName || '')
    setAssignStatus(r.status)
    setAssignCaseConfirmed(r.caseConfirmed || 'pending')
    setAdminNotes(r.adminNotes || '')
    setClinicSearch(r.assignedClinicName || '')
    setLawyerSearch(r.assignedLawyerName || '')
    setError('')
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/admin/referrer-referrals/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: assignStatus,
          assignedClinicId: assignClinicId || null,
          assignedClinicName: assignClinicName || null,
          assignedLawyerId: assignLawyerId || null,
          assignedLawyerName: assignLawyerName || null,
          caseConfirmed: assignCaseConfirmed,
          adminNotes,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update')
      }

      setSelected(null)
      await fetchReferrals()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/referrer-referrals/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleteConfirm(null)
      await fetchReferrals()
    } else {
      alert('Failed to delete referral')
      setDeleteConfirm(null)
    }
  }

  // Filtered lists for assignment
  const filteredClinicsForAssignment = selected
    ? clinics.filter((c) => {
        const matchesState = c.address.includes(`, ${selected.state} `)
        const matchesSearch = !clinicSearch || clinicSearch === assignClinicName ||
          c.name.toLowerCase().includes(clinicSearch.toLowerCase()) ||
          c.address.toLowerCase().includes(clinicSearch.toLowerCase())
        return matchesState && matchesSearch
      })
    : []

  const filteredLawyersForAssignment = selected
    ? lawyers.filter((l) => {
        const matchesState = l.address.includes(`, ${selected.state} `)
        const matchesSearch = !lawyerSearch || lawyerSearch === assignLawyerName ||
          l.name.toLowerCase().includes(lawyerSearch.toLowerCase()) ||
          l.address.toLowerCase().includes(lawyerSearch.toLowerCase())
        return matchesState && matchesSearch
      })
    : []

  const showClinicDropdown = clinicSearch.trim() !== '' && clinicSearch !== assignClinicName
  const showLawyerDropdown = lawyerSearch.trim() !== '' && lawyerSearch !== assignLawyerName

  // Table filters
  const filtered = referrals.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterState && r.state !== filterState) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        r.clientName.toLowerCase().includes(q) ||
        r.referrerName.toLowerCase().includes(q) ||
        r.caseType.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy/10 border-t-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">Partner Referrals</h1>
        <p className="text-sm text-gray-400 mt-1">Manage and assign referrals from external partners</p>
      </div>

      {/* Stats */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a2a4a] to-[#2a3f6a]">
                <FileText className="h-[18px] w-[18px] text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{total}</p>
                <p className="text-[11px] text-gray-400 font-medium">Total</p>
              </div>
            </div>
          </div>
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-amber-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                <Clock className="h-[18px] w-[18px] text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{pendingCount}</p>
                <p className="text-[11px] text-gray-400 font-medium">Pending</p>
              </div>
            </div>
          </div>
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-blue-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
                <UserCheck className="h-[18px] w-[18px] text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{activeCount}</p>
                <p className="text-[11px] text-gray-400 font-medium">Active</p>
              </div>
            </div>
          </div>
          <div className="group relative rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-400" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{completedCount}</p>
                <p className="text-[11px] text-gray-400 font-medium">Completed</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, referrer, case type..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="in_process">In Process</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          className="rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
        >
          <option value="">All States</option>
          <option value="FL">Florida</option>
          <option value="MN">Minnesota</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
          <h2 className="font-heading text-sm font-bold text-navy">Partner Referrals</h2>
          <span className="text-[11px] font-medium text-gray-400 bg-white rounded-full px-2.5 py-0.5 border border-gray-200">
            {filtered.length} total
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
              <FileText className="h-6 w-6 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-900">No partner referrals found</p>
            <p className="text-sm text-gray-400 mt-1">
              {search || filterStatus || filterState ? 'Try adjusting your filters' : 'Partner referrals will appear here'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left bg-gray-50/50">
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Referrer</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Client</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">State</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Service</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Case</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400">Date</th>
                  <th className="px-5 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-gray-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {filtered.map((r) => {
                  const sc = statusConfig[r.status] || statusConfig.pending
                  const cc = caseConfig[r.caseConfirmed] || caseConfig.pending
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors duration-150">
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #c2410c, #ea580c)' }}>
                            {r.referrerName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-gray-700 font-medium">{r.referrerName}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">{r.clientName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{r.caseType}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {r.state === 'FL' ? '🌴' : '❄️'} {r.state}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {r.serviceNeeded === 'lawyer' ? 'Attorney' : r.serviceNeeded === 'both' ? 'Both' : 'Clinic'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${sc.bg} ${sc.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cc.bg} ${cc.text} ${cc.ring}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cc.dot}`} />
                          {cc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetail(r)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gold/10 hover:text-gold transition-colors"
                            aria-label="View & assign"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {deleteConfirm === r.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(r.id)}
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
                              onClick={() => setDeleteConfirm(r.id)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-modal-in" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-lg font-bold text-gray-900">Assign Referral</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Review details and assign a provider</p>
                </div>
                <button onClick={() => setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                  {error}
                </div>
              )}

              {/* Client info card */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Client Information</p>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Name</span><strong className="text-gray-900">{selected.clientName}</strong></div>
                  <div className="flex justify-between"><span className="text-gray-400">Phone</span><span className="text-gray-700">{selected.clientPhone}</span></div>
                  {selected.clientEmail && <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="text-gray-700">{selected.clientEmail}</span></div>}
                  <div className="flex justify-between items-start gap-4"><span className="text-gray-400 shrink-0">Address</span><span className="text-gray-700 text-right">{selected.clientAddress}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">State</span><span className="text-gray-700">{selected.state === 'FL' ? 'Florida' : 'Minnesota'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Service</span><span className="text-gray-700">{selected.serviceNeeded === 'lawyer' ? 'Attorney' : selected.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Case Type</span><span className="text-gray-700">{selected.caseType}</span></div>
                  {selected.notes && <div className="pt-1"><span className="text-gray-400">Notes</span><p className="text-gray-700 mt-0.5">{selected.notes}</p></div>}
                  <div className="pt-1 text-xs text-gray-300">Referred by {selected.referrerName} on {formatDate(selected.createdAt)}</div>
                </div>
              </div>

              {/* Assignment fields */}
              <div className="space-y-4">
                {/* Clinic */}
                {(selected.serviceNeeded === 'clinic' || selected.serviceNeeded === 'both') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Assign Clinic
                      {assignClinicName && (
                        <span className="ml-2 text-xs text-emerald-600 font-normal">
                          Selected: {assignClinicName}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={clinicSearch}
                        onChange={(e) => {
                          setClinicSearch(e.target.value)
                          if (e.target.value !== assignClinicName) { setAssignClinicId(''); setAssignClinicName('') }
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all"
                        placeholder={`Search clinics in ${selected.state}...`}
                      />
                      {showClinicDropdown && (
                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                          {filteredClinicsForAssignment.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">No clinics found in {selected.state}</div>
                          ) : (
                            filteredClinicsForAssignment.slice(0, 20).map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => { setAssignClinicId(c.id); setAssignClinicName(c.name); setClinicSearch(c.name) }}
                                className="w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors border-b border-gray-50 last:border-0"
                              >
                                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                                <p className="text-xs text-gray-500 truncate">{c.address}</p>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Lawyer */}
                {(selected.serviceNeeded === 'lawyer' || selected.serviceNeeded === 'both') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Assign Attorney
                      {assignLawyerName && (
                        <span className="ml-2 text-xs text-emerald-600 font-normal">
                          Selected: {assignLawyerName}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={lawyerSearch}
                        onChange={(e) => {
                          setLawyerSearch(e.target.value)
                          if (e.target.value !== assignLawyerName) { setAssignLawyerId(''); setAssignLawyerName('') }
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all"
                        placeholder={`Search attorneys in ${selected.state}...`}
                      />
                      {showLawyerDropdown && (
                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                          {filteredLawyersForAssignment.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">No attorneys found in {selected.state}</div>
                          ) : (
                            filteredLawyersForAssignment.slice(0, 20).map((l) => (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => { setAssignLawyerId(l.id); setAssignLawyerName(l.name); setLawyerSearch(l.name) }}
                                className="w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors border-b border-gray-50 last:border-0"
                              >
                                <p className="text-sm font-medium text-gray-900">{l.name}</p>
                                <p className="text-xs text-gray-500 truncate">{l.address}</p>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <select
                    value={assignStatus}
                    onChange={(e) => setAssignStatus(e.target.value as ReferrerReferralStatus)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all"
                  >
                    <option value="pending">Pending</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_process">In Process</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                {/* Case Confirmed */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Case Confirmed</label>
                  <select
                    value={assignCaseConfirmed}
                    onChange={(e) => setAssignCaseConfirmed(e.target.value as CaseConfirmedStatus)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                  </select>
                </div>

                {/* Admin Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Admin Notes</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all resize-none"
                    placeholder="Internal notes about this referral..."
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-dark disabled:opacity-60 shadow-sm hover:shadow-md transition-all duration-200"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
