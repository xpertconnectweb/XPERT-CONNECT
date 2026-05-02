'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewReferralPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [state, setState] = useState('')
  const [serviceNeeded, setServiceNeeded] = useState('')
  const [caseType, setCaseType] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!clientName.trim() || !clientPhone.trim() || !state || !serviceNeeded || !caseType.trim()) {
      setError('Please fill in all required fields')
      setSaving(false)
      return
    }

    try {
      const res = await fetch('/api/partners/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientEmail: clientEmail.trim(),
          clientAddress: clientAddress.trim(),
          state,
          serviceNeeded,
          caseType: caseType.trim(),
          notes: notes.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create referral')
      }

      router.push('/partners/referrals')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2.5 text-sm focus:bg-white focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all duration-200'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5'

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/partners/referrals"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to referrals
      </Link>

      <div className="rounded-2xl bg-white shadow-sm border border-gray-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100" style={{ background: 'linear-gradient(to bottom, #fafbfc, #f5f6f8)' }}>
          <h2 className="font-heading text-lg font-bold text-navy">Submit New Referral</h2>
          <p className="text-xs text-gray-400 mt-1">Fill in client details to submit a referral for review</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={inputClass}
                placeholder="Full name"
              />
            </div>

            <div>
              <label className={labelClass}>
                Client Phone <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                className={inputClass}
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className={labelClass}>Client Email</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className={inputClass}
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label className={labelClass}>Client Address</label>
              <input
                type="text"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                className={inputClass}
                placeholder="Street, City, State ZIP"
              />
            </div>

            <div>
              <label className={labelClass}>
                State <span className="text-red-400">*</span>
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className={inputClass}
              >
                <option value="">Select state</option>
                <option value="FL">Florida</option>
                <option value="MN">Minnesota</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>
                Service Needed <span className="text-red-400">*</span>
              </label>
              <select
                value={serviceNeeded}
                onChange={(e) => setServiceNeeded(e.target.value)}
                className={inputClass}
              >
                <option value="">Select service</option>
                <option value="clinic">Clinic</option>
                <option value="lawyer">Attorney</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Case Type <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
              className={inputClass}
              placeholder="e.g. Personal Injury, Workers Comp..."
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
              placeholder="Additional details about the referral..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/partners/referrals"
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-white hover:bg-gold-dark disabled:opacity-60 shadow-sm hover:shadow-md transition-all duration-200"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Referral
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
