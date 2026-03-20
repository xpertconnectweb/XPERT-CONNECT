'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Search, X, Trash2, Eye } from 'lucide-react'
import type { ReferrerReferral, ReferrerReferralStatus } from '@/types/professionals'

interface ClinicOption { id: string; name: string; address: string }
interface LawyerOption { id: string; name: string; address: string }

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-gray-100', text: 'text-gray-700' },
  assigned: { label: 'Assigned', bg: 'bg-blue-100', text: 'text-blue-700' },
  in_process: { label: 'In Process', bg: 'bg-amber-100', text: 'text-amber-700' },
  completed: { label: 'Completed', bg: 'bg-emerald-100', text: 'text-emerald-700' },
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

  // Assignment form state
  const [assignClinicId, setAssignClinicId] = useState('')
  const [assignClinicName, setAssignClinicName] = useState('')
  const [assignLawyerId, setAssignLawyerId] = useState('')
  const [assignLawyerName, setAssignLawyerName] = useState('')
  const [assignStatus, setAssignStatus] = useState<ReferrerReferralStatus>('pending')
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

  const openDetail = (r: ReferrerReferral) => {
    setSelected(r)
    setAssignClinicId(r.assignedClinicId || '')
    setAssignClinicName(r.assignedClinicName || '')
    setAssignLawyerId(r.assignedLawyerId || '')
    setAssignLawyerName(r.assignedLawyerName || '')
    setAssignStatus(r.status)
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

  // Filter referrals by state for clinic/lawyer dropdowns
  const filteredClinicsForAssignment = selected
    ? clinics.filter((c) => {
        const stateAbbr = selected.state
        const matchesState = c.address.includes(`, ${stateAbbr} `)
        const matchesSearch = !clinicSearch || clinicSearch === assignClinicName ||
          c.name.toLowerCase().includes(clinicSearch.toLowerCase()) ||
          c.address.toLowerCase().includes(clinicSearch.toLowerCase())
        return matchesState && matchesSearch
      })
    : []

  const filteredLawyersForAssignment = selected
    ? lawyers.filter((l) => {
        const stateAbbr = selected.state
        const matchesState = l.address.includes(`, ${stateAbbr} `)
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-gray-900">Partner Referrals</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, referrer, case type..."
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
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
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
        >
          <option value="">All States</option>
          <option value="FL">Florida</option>
          <option value="MN">Minnesota</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-500">No partner referrals found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Referrer</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => {
                  const sc = statusConfig[r.status] || statusConfig.pending
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-600">{r.referrerName}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.clientName}</td>
                      <td className="px-4 py-3 text-gray-600">{r.state}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{r.serviceNeeded === 'lawyer' ? 'Attorney' : r.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(r.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetail(r)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                            aria-label="View details"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-semibold text-gray-900">
                Assign Referral
              </h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Client info (read-only) */}
            <div className="mb-5 rounded-lg bg-gray-50 p-4 text-sm space-y-1">
              <p className="text-xs font-medium uppercase text-gray-400 mb-2">Client Information</p>
              <p><span className="text-gray-500">Name:</span> <strong className="text-gray-900">{selected.clientName}</strong></p>
              <p><span className="text-gray-500">Phone:</span> {selected.clientPhone}</p>
              {selected.clientEmail && <p><span className="text-gray-500">Email:</span> {selected.clientEmail}</p>}
              <p><span className="text-gray-500">Address:</span> {selected.clientAddress}</p>
              <p><span className="text-gray-500">State:</span> {selected.state === 'FL' ? 'Florida' : 'Minnesota'}</p>
              <p><span className="text-gray-500">Service:</span> {selected.serviceNeeded === 'lawyer' ? 'Attorney' : selected.serviceNeeded === 'both' ? 'Both' : 'Clinic'}</p>
              <p><span className="text-gray-500">Case Type:</span> {selected.caseType}</p>
              {selected.notes && <p><span className="text-gray-500">Notes:</span> {selected.notes}</p>}
              <p className="text-xs text-gray-400 pt-1">Referred by {selected.referrerName} on {formatDate(selected.createdAt)}</p>
            </div>

            <div className="space-y-4">
              {/* Clinic assignment */}
              {(selected.serviceNeeded === 'clinic' || selected.serviceNeeded === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign Clinic
                    {assignClinicName && (
                      <span className="ml-2 text-xs text-emerald-600 font-normal">
                        Selected: {assignClinicName}
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
                        if (e.target.value !== assignClinicName) {
                          setAssignClinicId('')
                          setAssignClinicName('')
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                      placeholder={`Search clinics in ${selected.state}...`}
                    />
                    {showClinicDropdown && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                        {filteredClinicsForAssignment.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">No clinics found</div>
                        ) : (
                          filteredClinicsForAssignment.slice(0, 20).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setAssignClinicId(c.id)
                                setAssignClinicName(c.name)
                                setClinicSearch(c.name)
                              }}
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

              {/* Lawyer assignment */}
              {(selected.serviceNeeded === 'lawyer' || selected.serviceNeeded === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign Attorney
                    {assignLawyerName && (
                      <span className="ml-2 text-xs text-emerald-600 font-normal">
                        Selected: {assignLawyerName}
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
                        if (e.target.value !== assignLawyerName) {
                          setAssignLawyerId('')
                          setAssignLawyerName('')
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                      placeholder={`Search attorneys in ${selected.state}...`}
                    />
                    {showLawyerDropdown && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                        {filteredLawyersForAssignment.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">No attorneys found</div>
                        ) : (
                          filteredLawyersForAssignment.slice(0, 20).map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => {
                                setAssignLawyerId(l.id)
                                setAssignLawyerName(l.name)
                                setLawyerSearch(l.name)
                              }}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={assignStatus}
                  onChange={(e) => setAssignStatus(e.target.value as ReferrerReferralStatus)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                >
                  <option value="pending">Pending</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_process">In Process</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {/* Admin Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 resize-none"
                  placeholder="Internal notes..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setSelected(null)}
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
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
