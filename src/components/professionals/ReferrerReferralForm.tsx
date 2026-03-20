'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, Send, ArrowLeft, User, Phone, Mail, MapPin, Briefcase, FileText, MessageSquare } from 'lucide-react'

interface ReferrerReferralFormProps {
  state: string
  stateName: string
  onBack: () => void
}

export function ReferrerReferralForm({ state, stateName, onBack }: ReferrerReferralFormProps) {
  const [form, setForm] = useState({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    clientAddress: '',
    serviceNeeded: 'clinic' as 'clinic' | 'lawyer' | 'both',
    caseType: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const stateGradient = state === 'FL'
    ? 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)'
    : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)'
  const stateColor = state === 'FL' ? '#c2410c' : '#1d4ed8'
  const stateLightBg = state === 'FL' ? 'rgba(249, 115, 22, 0.06)' : 'rgba(59, 130, 246, 0.06)'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/professionals/referrer-referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, state }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit referral')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleAnother = () => {
    setForm({
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      clientAddress: '',
      serviceNeeded: 'clinic',
      caseType: '',
      notes: '',
    })
    setSuccess(false)
    setError('')
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 animate-in fade-in duration-500">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}>
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-gray-900 mb-3">Referral Submitted!</h2>
        <p className="text-gray-500 mb-2 leading-relaxed max-w-sm mx-auto">
          Your referral for <strong className="text-gray-700">{stateName}</strong> has been submitted successfully.
        </p>
        <p className="text-sm text-gray-400 mb-8">Our admin team will review and assign the appropriate provider.</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleAnother}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            style={{ background: stateGradient }}
          >
            <Send className="h-4 w-4" />
            Submit Another
          </button>
          <button
            onClick={onBack}
            className="rounded-xl px-6 py-3 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
          >
            Change State
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="mb-6 group inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Change state
      </button>

      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        {/* Header with state gradient */}
        <div className="relative overflow-hidden px-7 py-6" style={{ background: stateLightBg }}>
          <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-[0.08]" style={{ background: stateGradient }} />
          <div className="relative flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl shadow-md"
              style={{ background: stateGradient }}
            >
              <span className="text-base font-black text-white">{state}</span>
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-gray-900">
                New Referral — {stateName}
              </h2>
              <p className="text-sm text-gray-500">Fill in the client details below</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-6">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3.5 text-sm text-red-600 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
              {error}
            </div>
          )}

          {/* Client Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <User className="h-3.5 w-3.5 text-gray-400" />
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 bg-gray-50/50 focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                Client Phone <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                required
                value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 bg-gray-50/50 focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              Client Email <span className="text-gray-300 text-xs font-normal ml-1">optional</span>
            </label>
            <input
              type="email"
              value={form.clientEmail}
              onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 bg-gray-50/50 focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
              placeholder="client@example.com"
            />
          </div>

          {/* Address */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              Client Address <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.clientAddress}
              onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 bg-gray-50/50 focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
              placeholder="Street, City, State, ZIP"
            />
          </div>

          {/* Service Needed */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-3">
              <Briefcase className="h-3.5 w-3.5 text-gray-400" />
              Service Needed <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: 'clinic', label: 'Clinic', icon: '🏥' },
                { value: 'lawyer', label: 'Attorney', icon: '⚖️' },
                { value: 'both', label: 'Both', icon: '🤝' },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 cursor-pointer transition-all duration-300 ${
                    form.serviceNeeded === opt.value
                      ? 'border-gold bg-gold/5 shadow-sm'
                      : 'border-gray-100 bg-gray-50/50 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="serviceNeeded"
                    value={opt.value}
                    checked={form.serviceNeeded === opt.value}
                    onChange={() => setForm({ ...form, serviceNeeded: opt.value })}
                    className="sr-only"
                  />
                  {form.serviceNeeded === opt.value && (
                    <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-gold" />
                  )}
                  <span className="text-xl">{opt.icon}</span>
                  <span className={`text-sm font-medium ${form.serviceNeeded === opt.value ? 'text-gray-900' : 'text-gray-500'}`}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Case Type */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <FileText className="h-3.5 w-3.5 text-gray-400" />
              Case Type <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.caseType}
              onChange={(e) => setForm({ ...form, caseType: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 bg-gray-50/50 focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200"
              placeholder="e.g. Personal Injury, Workers Comp, etc."
            />
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
              Notes <span className="text-gray-300 text-xs font-normal ml-1">optional</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 bg-gray-50/50 focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200 resize-none"
              placeholder="Any additional information about the client..."
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-lg transition-all duration-300"
              style={{ background: stateGradient }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {saving ? 'Submitting Referral...' : 'Submit Referral'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
