'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Send, Loader2, CheckCircle, User, Phone, Mail, Globe, MapPin } from 'lucide-react'
import type { DirectoryContact } from '@/types/professionals'
import { safeHttpUrl } from '@/lib/security/url'

interface InfoRequestModalProps {
  firm: { id: string; name: string }
  onClose: () => void
}

/**
 * "Get information" for one firm in the public directory.
 *
 * The listing carries no phone, website or address; this is where a
 * visitor gets them. Name, phone and email go to
 * /api/public/lawyers/[id]/inquiry, which records the lead and answers
 * with the firm's contact details, shown here in place of the form.
 *
 * Same shell as ClinicReferralFormModal — backdrop click and Escape
 * close it, body scroll is locked while it is open.
 */
export function InfoRequestModal({ firm, onClose }: InfoRequestModalProps) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contact, setContact] = useState<DirectoryContact | null>(null)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/public/lawyers/${encodeURIComponent(firm.id)}/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.contact) {
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }
      setContact(data.contact)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const inputBase =
    'w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/10 transition-all duration-200'
  const labelBase =
    'flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-request-title"
      data-testid="info-request-modal"
    >
      <div className="relative z-[10001] w-full max-w-[min(28rem,calc(100vw-2rem))] max-h-[min(92vh,calc(100vh-2rem))] overflow-y-auto rounded-2xl bg-white shadow-2xl animate-modal-in">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-navy to-navy-light px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="info-request-title" className="font-heading text-lg font-bold text-white">
                Get information
              </h2>
              <p className="text-sm text-white/70 mt-0.5 truncate">
                About <span className="text-gold font-medium">{firm.name}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-all duration-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          {contact ? (
            <div data-testid="info-request-contact">
              <div className="flex flex-col items-center text-center mb-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 mb-3 ring-4 ring-emerald-100">
                  <CheckCircle className="h-7 w-7 text-emerald-500" />
                </div>
                <h3 className="font-heading text-lg font-bold text-navy">Thank you, {form.name.split(' ')[0]}!</h3>
                <p className="text-sm text-gray-500 mt-1">Here is how to reach {contact.name}.</p>
              </div>

              <div className="space-y-2.5">
                <a
                  href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy to-navy-light px-4 py-3 text-sm font-bold text-white shadow-md shadow-navy/20 hover:shadow-lg hover:shadow-navy/30 transition-all duration-200"
                >
                  <Phone className="h-4 w-4" />
                  {contact.phone}
                </a>
                {safeHttpUrl(contact.website) && (
                  <a
                    href={safeHttpUrl(contact.website)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                    Visit website
                  </a>
                )}
                {contact.address && (
                  <p className="flex items-start justify-center gap-1.5 pt-1 text-center text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-px" />
                    {contact.address}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-500">
                Leave your details to see this firm&rsquo;s contact information.
              </p>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700" role="alert">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="info-name" className={labelBase}>
                  <User className="h-3.5 w-3.5" />
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="info-name"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={inputBase}
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label htmlFor="info-phone" className={labelBase}>
                  <Phone className="h-3.5 w-3.5" />
                  Phone <span className="text-red-400">*</span>
                </label>
                <input
                  id="info-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  maxLength={40}
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className={inputBase}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label htmlFor="info-email" className={labelBase}>
                  <Mail className="h-3.5 w-3.5" />
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  id="info-email"
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={200}
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={inputBase}
                  placeholder="you@example.com"
                />
              </div>

              {/* Honeypot: invisible to people, filled in by bots. */}
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={form.company}
                onChange={(e) => updateField('company', e.target.value)}
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />

              <button
                type="submit"
                disabled={loading}
                data-testid="info-request-submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy to-navy-light px-4 py-3 text-sm font-bold text-white shadow-md shadow-navy/20 hover:shadow-lg hover:shadow-navy/30 disabled:opacity-60 transition-all duration-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Get information
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
