'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, Send, ArrowLeft } from 'lucide-react'

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
      <div className="max-w-lg mx-auto text-center py-12 animate-in fade-in duration-500">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="font-heading text-2xl font-bold text-gray-900 mb-2">Referral Submitted!</h2>
        <p className="text-gray-500 mb-8">
          Your referral for <strong>{stateName}</strong> has been submitted successfully. Our admin team will review it and assign the appropriate provider.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleAnother}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-white hover:bg-gold-dark transition-colors"
          >
            <Send className="h-4 w-4" />
            Submit Another
          </button>
          <button
            onClick={onBack}
            className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Back to State Selection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Change state
      </button>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #fff7ed, #ffffff)' }}>
          <h2 className="font-heading text-lg font-bold text-gray-900">
            New Referral — {stateName}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Fill in the client details below</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Phone <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                required
                value={form.clientPhone}
                onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Email <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </label>
            <input
              type="email"
              value={form.clientEmail}
              onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              placeholder="client@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Address <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.clientAddress}
              onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              placeholder="Street, City, State, ZIP"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Service Needed <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {([
                { value: 'clinic', label: 'Clinic' },
                { value: 'lawyer', label: 'Attorney' },
                { value: 'both', label: 'Both' },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer transition-all ${
                    form.serviceNeeded === opt.value
                      ? 'border-gold bg-gold/10 text-gold-dark'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
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
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Case Type <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.caseType}
              onChange={(e) => setForm({ ...form, caseType: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
              placeholder="e.g. Personal Injury, Workers Comp, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 resize-none"
              placeholder="Any additional information..."
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-white hover:bg-gold-dark disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {saving ? 'Submitting...' : 'Submit Referral'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
