'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Send, Loader2, CheckCircle, User, Phone, Briefcase, Shield,
  FileCheck, StickyNote, Building2, Hash, Contact, Mail, Scale,
} from 'lucide-react'
import type { Lawyer } from '@/types/professionals'

const CASE_TYPES = [
  'Auto Accident',
  'Slip and Fall',
  'Workplace Injury',
  'Medical Malpractice',
  'Other',
]

const COVERAGE_OPTIONS = [
  '10/20k',
  '25/50k',
  '50/100k',
  '100/300k',
  '250/500k',
  '1M+',
]

const PIP_OPTIONS = ['Yes', 'No', 'N/A']

type LawyerOption = Pick<Lawyer, 'id' | 'name' | 'region' | 'county'>

interface ClinicReferralFormModalProps {
  /** When provided, the specialist is pre-selected and locked. Otherwise a picker is shown. */
  lawyer?: LawyerOption
  onClose: () => void
  /** Fired after a successful POST so callers can refresh their data. */
  onCreated?: () => void
}

export function ClinicReferralFormModal({ lawyer, onClose, onCreated }: ClinicReferralFormModalProps) {
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    caseType: '',
    coverage: '',
    pip: '',
    insuranceCompany: '',
    claimNumber: '',
    adjusterName: '',
    adjusterPhone: '',
    adjusterEmail: '',
    notes: '',
  })
  const [selectedLawyerId, setSelectedLawyerId] = useState(lawyer?.id ?? '')
  const [lawyerOptions, setLawyerOptions] = useState<LawyerOption[]>([])
  const [loadingLawyers, setLoadingLawyers] = useState(!lawyer)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameInputRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    if (lawyer) return
    let cancelled = false
    setLoadingLawyers(true)
    fetch('/api/professionals/lawyers')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load specialists')))
      .then((data: LawyerOption[]) => {
        if (!cancelled) setLawyerOptions(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load specialists')
      })
      .finally(() => {
        if (!cancelled) setLoadingLawyers(false)
      })
    return () => { cancelled = true }
  }, [lawyer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const lawyerId = lawyer?.id ?? selectedLawyerId
    if (!lawyerId) {
      setError('Please select a specialist')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/professionals/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawyerId, ...form }),
      })

      if (!res.ok) {
        let message = 'Failed to create referral'
        try {
          const data = await res.json()
          message = data.error || message
        } catch {}
        throw new Error(message)
      }

      setSuccess(true)
      onCreated?.()
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const inputBase =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200'
  const selectBase =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200 appearance-none cursor-pointer'

  const sectionLabel = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 pt-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gold/10 text-gold">{icon}</div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-700">{text}</h3>
      <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
    </div>
  )

  const optionalTag = (
    <span className="text-xs font-normal normal-case tracking-normal text-gray-400">(optional)</span>
  )

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clinic-referral-title"
    >
      <div className="relative z-[10001] w-full max-w-[min(36rem,calc(100vw-2rem))] max-h-[min(92vh,calc(100vh-2rem))] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-modal-in">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-[#92400e] via-[#b45309] to-[#d97706] px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="clinic-referral-title" className="font-heading text-lg font-bold text-white">
                Refer to Specialist
              </h2>
              <p className="text-sm text-white/70 mt-0.5">
                {lawyer
                  ? <>Sending to <span className="text-amber-100 font-medium">{lawyer.name}</span></>
                  : 'Send a patient referral to a specialist'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-all duration-200"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {success ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 mb-4 ring-4 ring-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
              <h3 className="font-heading text-lg font-bold text-navy mb-1">Referral Sent!</h3>
              <p className="text-sm text-gray-500">The specialist has been notified successfully.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700" role="alert">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}

              {/* Specialist picker (only when not pre-selected) */}
              {!lawyer && (
                <div>
                  <label htmlFor="specialist" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <Scale className="h-3.5 w-3.5" />
                    Specialist <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="specialist"
                      required
                      disabled={loadingLawyers}
                      value={selectedLawyerId}
                      onChange={(e) => setSelectedLawyerId(e.target.value)}
                      className={selectBase}
                    >
                      <option value="">{loadingLawyers ? 'Loading specialists...' : 'Select a specialist'}</option>
                      {lawyerOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}{l.region ? ` — ${l.region}` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              )}

              {sectionLabel(<User className="h-3.5 w-3.5" />, 'Patient')}

              <div>
                <label htmlFor="patientName" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <User className="h-3.5 w-3.5" />
                  Patient Name <span className="text-red-400">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="patientName"
                  type="text"
                  required
                  maxLength={100}
                  value={form.patientName}
                  onChange={(e) => updateField('patientName', e.target.value)}
                  className={inputBase}
                  placeholder="Enter patient full name"
                />
              </div>

              <div>
                <label htmlFor="patientPhone" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <Phone className="h-3.5 w-3.5" />
                  Patient Phone <span className="text-red-400">*</span>
                </label>
                <input
                  id="patientPhone"
                  type="tel"
                  required
                  maxLength={20}
                  value={form.patientPhone}
                  onChange={(e) => updateField('patientPhone', e.target.value)}
                  className={inputBase}
                  placeholder="(305) 555-0000"
                />
              </div>

              <div>
                <label htmlFor="caseType" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <Briefcase className="h-3.5 w-3.5" />
                  Case Type <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    id="caseType"
                    required
                    value={form.caseType}
                    onChange={(e) => updateField('caseType', e.target.value)}
                    className={selectBase}
                  >
                    <option value="">Select case type</option>
                    {CASE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              {sectionLabel(<Shield className="h-3.5 w-3.5" />, 'Insurance')}

              <div>
                <label htmlFor="insuranceCompany" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Insurance Company {optionalTag}
                </label>
                <input
                  id="insuranceCompany"
                  type="text"
                  maxLength={100}
                  value={form.insuranceCompany}
                  onChange={(e) => updateField('insuranceCompany', e.target.value)}
                  className={inputBase}
                  placeholder="e.g. State Farm, GEICO"
                />
              </div>

              <div>
                <label htmlFor="claimNumber" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <Hash className="h-3.5 w-3.5" />
                  Claim Number {optionalTag}
                </label>
                <input
                  id="claimNumber"
                  type="text"
                  maxLength={60}
                  value={form.claimNumber}
                  onChange={(e) => updateField('claimNumber', e.target.value)}
                  className={inputBase}
                  placeholder="Claim #"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="coverage" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <Shield className="h-3.5 w-3.5" />
                    Coverage {optionalTag}
                  </label>
                  <div className="relative">
                    <select
                      id="coverage"
                      value={form.coverage}
                      onChange={(e) => updateField('coverage', e.target.value)}
                      className={selectBase}
                    >
                      <option value="">Select</option>
                      {COVERAGE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="pip" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <FileCheck className="h-3.5 w-3.5" />
                    PIP {optionalTag}
                  </label>
                  <div className="relative">
                    <select
                      id="pip"
                      value={form.pip}
                      onChange={(e) => updateField('pip', e.target.value)}
                      className={selectBase}
                    >
                      <option value="">Select</option>
                      {PIP_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              </div>

              {sectionLabel(<Contact className="h-3.5 w-3.5" />, 'Adjuster')}

              <p className="text-[11px] text-gray-400 -mt-2">
                Editable later by you, the assigned specialist, and admin.
              </p>

              <div>
                <label htmlFor="adjusterName" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <Contact className="h-3.5 w-3.5" />
                  Adjuster Name {optionalTag}
                </label>
                <input
                  id="adjusterName"
                  type="text"
                  maxLength={100}
                  value={form.adjusterName}
                  onChange={(e) => updateField('adjusterName', e.target.value)}
                  className={inputBase}
                  placeholder="Adjuster full name"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="adjusterPhone" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <Phone className="h-3.5 w-3.5" />
                    Adjuster Phone {optionalTag}
                  </label>
                  <input
                    id="adjusterPhone"
                    type="tel"
                    maxLength={20}
                    value={form.adjusterPhone}
                    onChange={(e) => updateField('adjusterPhone', e.target.value)}
                    className={inputBase}
                    placeholder="(305) 555-0000"
                  />
                </div>
                <div>
                  <label htmlFor="adjusterEmail" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <Mail className="h-3.5 w-3.5" />
                    Adjuster Email {optionalTag}
                  </label>
                  <input
                    id="adjusterEmail"
                    type="email"
                    maxLength={100}
                    value={form.adjusterEmail}
                    onChange={(e) => updateField('adjusterEmail', e.target.value)}
                    className={inputBase}
                    placeholder="adjuster@insurance.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="notes" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <StickyNote className="h-3.5 w-3.5" />
                  Notes {optionalTag}
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  maxLength={500}
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  className={`${inputBase} resize-none`}
                  placeholder="Additional details about the patient case..."
                />
                <p className="text-[11px] text-gray-400 mt-1.5 text-right tabular-nums">{form.notes.length}/500</p>
              </div>

              <div className="h-px bg-gray-100" />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[1.4] flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4a84b] to-[#c49a3f] px-4 py-3 text-sm font-bold text-white shadow-md shadow-gold/20 hover:shadow-lg hover:shadow-gold/30 hover:-translate-y-px disabled:opacity-60 disabled:shadow-none disabled:translate-y-0 transition-all duration-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Referral
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
