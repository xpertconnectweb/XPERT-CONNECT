'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, Loader2, CheckCircle } from 'lucide-react'
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
        const data = await res.json()
        throw new Error(data.error || 'Failed to create referral')
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

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div ref={modalRef} className="relative z-[10001] w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 id="modal-title" className="font-heading text-lg font-bold text-navy">
              New Referral
            </h2>
            <p className="text-sm text-gray-500">
              Sending to {clinic.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {success ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 mb-4">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="font-heading text-lg font-bold text-navy mb-1">
                Referral Sent!
              </h3>
              <p className="text-sm text-gray-500">
                The clinic has been notified.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="patientName" className="block text-sm font-medium text-gray-700 mb-1">
                  Patient Name *
                </label>
                <input
                  ref={nameInputRef}
                  id="patientName"
                  type="text"
                  required
                  maxLength={100}
                  value={form.patientName}
                  onChange={(e) => updateField('patientName', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-colors"
                  placeholder="Enter patient name"
                />
              </div>

              <div>
                <label htmlFor="patientPhone" className="block text-sm font-medium text-gray-700 mb-1">
                  Patient Phone *
                </label>
                <input
                  id="patientPhone"
                  type="tel"
                  required
                  maxLength={20}
                  value={form.patientPhone}
                  onChange={(e) => updateField('patientPhone', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-colors"
                  placeholder="(305) 555-0000"
                />
              </div>

              <div>
                <label htmlFor="caseType" className="block text-sm font-medium text-gray-700 mb-1">
                  Case Type *
                </label>
                <select
                  id="caseType"
                  required
                  value={form.caseType}
                  onChange={(e) => updateField('caseType', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-colors"
                >
                  <option value="">Select case type</option>
                  {CASE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="coverage" className="block text-sm font-medium text-gray-700 mb-1">
                    Coverage *
                  </label>
                  <select
                    id="coverage"
                    required
                    value={form.coverage}
                    onChange={(e) => updateField('coverage', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-colors"
                  >
                    <option value="">Select coverage</option>
                    {COVERAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pip" className="block text-sm font-medium text-gray-700 mb-1">
                    PIP *
                  </label>
                  <select
                    id="pip"
                    required
                    value={form.pip}
                    onChange={(e) => updateField('pip', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-colors"
                  >
                    <option value="">Select PIP</option>
                    {PIP_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  maxLength={500}
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 resize-none transition-colors"
                  placeholder="Additional details about the patient case..."
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{form.notes.length}/500</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-white hover:bg-gold-dark disabled:opacity-60 transition-colors"
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
