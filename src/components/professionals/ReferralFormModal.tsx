'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, Loader2, CheckCircle, User, Phone, Briefcase, Shield, FileCheck, StickyNote } from 'lucide-react'
import type { Clinic } from '@/types/professionals'

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

interface ReferralFormModalProps {
  clinic: Clinic
  onClose: () => void
}

export function ReferralFormModal({ clinic, onClose }: ReferralFormModalProps) {
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    caseType: '',
    coverage: '',
    pip: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Autofocus first field + trap Escape key
  useEffect(() => {
    nameInputRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll while modal open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/professionals/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: clinic.id,
          ...form,
        }),
      })

      if (!res.ok) {
        let message = 'Failed to create referral'
        try {
          const data = await res.json()
          message = data.error || message
        } catch {
          // Server returned non-JSON response
        }
        throw new Error(message)
      }

      setSuccess(true)
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

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const inputBase =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200'
  const selectBase =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200 appearance-none cursor-pointer'

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div ref={modalRef} className="relative z-[10001] w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-modal-in overflow-hidden">
        {/* Header with gradient accent */}
        <div className="relative bg-gradient-to-r from-[#1a2a4a] to-[#2a3f6a] px-6 py-5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
          <div className="relative flex items-center justify-between">
            <div>
              <h2 id="modal-title" className="font-heading text-lg font-bold text-white">
                New Referral
              </h2>
              <p className="text-sm text-white/60 mt-0.5">
                Sending to <span className="text-gold font-medium">{clinic.name}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-all duration-200"
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
              <h3 className="font-heading text-lg font-bold text-navy mb-1">
                Referral Sent!
              </h3>
              <p className="text-sm text-gray-500">
                The clinic has been notified successfully.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700" role="alert">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}

              {/* Patient Name */}
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

              {/* Patient Phone */}
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

              {/* Case Type */}
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

              {/* Coverage + PIP row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="coverage" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <Shield className="h-3.5 w-3.5" />
                    Coverage <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="coverage"
                      required
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
                    PIP <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="pip"
                      required
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

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <StickyNote className="h-3.5 w-3.5" />
                  Notes <span className="text-xs font-normal normal-case tracking-normal text-gray-400">(optional)</span>
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

              {/* Divider */}
              <div className="h-px bg-gray-100" />

              {/* Actions */}
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
