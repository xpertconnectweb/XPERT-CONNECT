'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Send, Loader2, CheckCircle, User, Phone, Briefcase, StickyNote,
  Stethoscope, Building2,
} from 'lucide-react'
import type { Clinic } from '@/types/professionals'
import { MEDICAL_SPECIALTY_TYPES, type MedicalSpecialtyType } from '@/lib/medical-specialties'

const CASE_TYPES = [
  'Auto Accident',
  'Slip and Fall',
  'Workplace Injury',
  'Sports Injury',
  'Chronic Pain',
  'Other',
]

type ClinicOption = Pick<Clinic, 'id' | 'name' | 'region' | 'county' | 'specialties'>

interface MedicalSpecialistReferralModalProps {
  onClose: () => void
  onCreated?: () => void
}

export function MedicalSpecialistReferralModal({ onClose, onCreated }: MedicalSpecialistReferralModalProps) {
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    specialistType: '' as MedicalSpecialtyType | '',
    caseType: '',
    targetClinicId: '',
    notes: '',
  })
  const [clinicOptions, setClinicOptions] = useState<ClinicOption[]>([])
  const [loadingClinics, setLoadingClinics] = useState(false)
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

  // Load clinics whenever specialty changes.
  useEffect(() => {
    if (!form.specialistType) {
      setClinicOptions([])
      return
    }
    let cancelled = false
    setLoadingClinics(true)
    fetch(`/api/professionals/clinics?specialty=${encodeURIComponent(form.specialistType)}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load clinics')))
      .then((data: ClinicOption[]) => {
        if (!cancelled) {
          setClinicOptions(data)
          // Reset target if the previously selected clinic is no longer in the filtered list
          if (form.targetClinicId && !data.some((c) => c.id === form.targetClinicId)) {
            setForm((prev) => ({ ...prev, targetClinicId: '' }))
          }
        }
      })
      .catch(() => { /* swallow — picker is optional */ })
      .finally(() => { if (!cancelled) setLoadingClinics(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.specialistType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.specialistType) {
      setError('Please select a specialist type')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/professionals/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referralKind: 'medical_specialist',
          patientName: form.patientName,
          patientPhone: form.patientPhone,
          caseType: form.caseType || form.specialistType,
          specialistType: form.specialistType,
          targetClinicId: form.targetClinicId || undefined,
          notes: form.notes,
        }),
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

  const updateField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const inputBase =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/10 transition-all duration-200'
  const selectBase =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/10 transition-all duration-200 appearance-none cursor-pointer'

  const sectionLabel = (icon: React.ReactNode, text: string) => (
    <div className="flex items-center gap-2 pt-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 text-teal-600">{icon}</div>
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
      aria-labelledby="medical-referral-title"
    >
      <div className="relative z-[10001] w-full max-w-[min(36rem,calc(100vw-2rem))] max-h-[min(92vh,calc(100vh-2rem))] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-modal-in">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-[#0f766e] via-[#14b8a6] to-[#10b981] px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="medical-referral-title" className="font-heading text-lg font-bold text-white">
                Refer to Medical Specialist
              </h2>
              <p className="text-sm text-white/70 mt-0.5">
                Send a patient to a medical specialist
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
              <p className="text-sm text-gray-500">The medical specialist has been notified.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700" role="alert">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}

              {sectionLabel(<Stethoscope className="h-3.5 w-3.5" />, 'Specialist')}

              <div>
                <label htmlFor="specialistType" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Specialist Type <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select
                    id="specialistType"
                    required
                    value={form.specialistType}
                    onChange={(e) => updateField('specialistType', e.target.value as MedicalSpecialtyType)}
                    className={selectBase}
                  >
                    <option value="">Select a specialist type</option>
                    {MEDICAL_SPECIALTY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="targetClinicId" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Target Clinic {optionalTag}
                </label>
                <div className="relative">
                  <select
                    id="targetClinicId"
                    value={form.targetClinicId}
                    onChange={(e) => updateField('targetClinicId', e.target.value)}
                    disabled={!form.specialistType || loadingClinics}
                    className={selectBase}
                  >
                    <option value="">
                      {!form.specialistType
                        ? 'Pick a specialist type first'
                        : loadingClinics
                          ? 'Loading clinics...'
                          : clinicOptions.length === 0
                            ? 'No clinics in your state match — leave empty and XPERT will match'
                            : 'Let XPERT match (optional)'}
                    </option>
                    {clinicOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.region ? ` — ${c.region}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Leave empty if you want XPERT to match a clinic for you.
                </p>
              </div>

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
                  Reason / Case Type {optionalTag}
                </label>
                <div className="relative">
                  <select
                    id="caseType"
                    value={form.caseType}
                    onChange={(e) => updateField('caseType', e.target.value)}
                    className={selectBase}
                  >
                    <option value="">Defaults to the specialist type</option>
                    {CASE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
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
                  placeholder="Patient symptoms, urgency, or anything the specialist should know..."
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
                  className="flex-[1.4] flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0f766e] to-[#10b981] px-4 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 hover:-translate-y-px disabled:opacity-60 disabled:shadow-none disabled:translate-y-0 transition-all duration-200"
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
