'use client'

import { useState } from 'react'
import { Phone, Mail, MapPin, Clock, Send } from 'lucide-react'
import type { ContactData } from '@/lib/sanity-types'

const iconMap: Record<string, typeof Phone> = { Phone, Mail, MapPin, Clock }

const defaultContactInfo = [
  { icon: Phone, label: 'Call Us', value: '1-844-XPERT-NOW', href: 'tel:+18449737866' },
  { icon: Mail, label: 'Email', value: 'xpertconnect.web@gmail.com', href: 'mailto:xpertconnect.web@gmail.com' },
  { icon: Clock, label: 'Available', value: '24/7 Support', href: null },
  { icon: MapPin, label: 'Locations', value: 'Florida & Minnesota', href: null },
]

interface ContactProps {
  data?: ContactData | null
}

export function Contact({ data }: ContactProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    service: '',
    message: '',
  })

  const label = data?.label ?? 'Contact Us'
  const titleLine1 = data?.titleLine1 ?? 'Been in an Accident?'
  const titleAccent = data?.titleAccent ?? "Let's Connect."
  const description = data?.description ?? "Don't navigate this alone. Our team connects you with experienced professionals who can help with your case. Request a free consultation today."
  const disclaimer = data?.disclaimer ?? 'We are not attorneys and do not provide legal advice. We connect you with licensed professionals.'
  const formTitle = data?.formTitle ?? 'Free Consultation'
  const formDescription = data?.formDescription ?? "Fill out the form and we'll connect you with the right professional."

  const contactInfo = data?.contactInfo
    ? data.contactInfo.map((c) => ({
        icon: iconMap[c.iconName] ?? Phone,
        label: c.label,
        value: c.value,
        href: c.href || null,
      }))
    : defaultContactInfo

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setStatus('idle')

    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setStatus('error')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Request failed')
      }

      setStatus('success')
      setFormData({ name: '', email: '', phone: '', service: '', message: '' })
    } catch {
      setStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  return (
    <section id="contact" className="section relative bg-gray-50 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left Column - Info */}
          <div>
            <span className="section-label">{label}</span>
            <h2 className="section-title text-left">
              {titleLine1}
              <span className="block text-gold">{titleAccent}</span>
            </h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              {description}
            </p>

            {/* Contact Info Cards */}
            <div className="space-y-4 mb-8">
              {contactInfo.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white shadow-sm border border-gray-100 transition-all hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10">
                    <item.icon className="h-5 w-5 text-gold" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{item.label}</p>
                    {item.href ? (
                      <a href={item.href} className="font-heading font-bold text-navy hover:text-gold transition-colors">
                        {item.value}
                      </a>
                    ) : (
                      <p className="font-heading font-bold text-navy">{item.value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Disclaimer */}
            <div className="p-4 bg-navy/5 rounded-xl border-l-4 border-gold">
              <p className="text-sm text-gray-500 italic">
                <strong className="text-navy not-italic">Important:</strong> {disclaimer}
              </p>
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="relative">
            {/* Form Card */}
            <div className="relative bg-gradient-to-br from-navy to-navy-dark rounded-3xl p-8 lg:p-10 shadow-2xl shadow-navy/25">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gold/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />

              <div className="relative z-10">
                <h3 className="font-heading text-2xl font-bold text-white mb-2">
                  {formTitle}
                </h3>
                <p className="text-white/80 mb-8 text-sm">
                  {formDescription}
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="contact-name" className="sr-only">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="contact-name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      autoComplete="name"
                      placeholder="Full Name"
                      required
                      className="w-full rounded-xl border-0 bg-white/10 backdrop-blur-sm px-5 py-4 text-white placeholder-white/60 transition-all focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="contact-email" className="sr-only">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="contact-email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        autoComplete="email"
                        placeholder="Email Address"
                        required
                        className="w-full rounded-xl border-0 bg-white/10 backdrop-blur-sm px-5 py-4 text-white placeholder-white/60 transition-all focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-phone" className="sr-only">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        id="contact-phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        autoComplete="tel"
                        placeholder="Phone Number"
                        pattern="[\d\s\-\+\(\)]{7,20}"
                        title="Please enter a valid phone number (7-15 digits)"
                        required
                        className="w-full rounded-xl border-0 bg-white/10 backdrop-blur-sm px-5 py-4 text-white placeholder-white/60 transition-all focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-service" className="sr-only">
                      Service Type
                    </label>
                    <select
                      id="contact-service"
                      name="service"
                      value={formData.service}
                      onChange={handleChange}
                      required
                      className="w-full cursor-pointer rounded-xl border-0 bg-white/10 backdrop-blur-sm px-5 py-4 text-white transition-all focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 1rem center',
                      }}
                    >
                      <option value="" disabled className="text-gray-700">
                        Select Service Type
                      </option>
                      <option value="legal" className="text-gray-700">
                        Legal Services
                      </option>
                      <option value="medical" className="text-gray-700">
                        Medical Clinics
                      </option>
                      <option value="realestate" className="text-gray-700">
                        Real Estate
                      </option>
                      <option value="other" className="text-gray-700">
                        Other
                      </option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="sr-only">
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      autoComplete="off"
                      placeholder="Tell us about your situation..."
                      rows={4}
                      className="w-full resize-none rounded-xl border-0 bg-white/10 backdrop-blur-sm px-5 py-4 text-white placeholder-white/60 transition-all focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold px-8 py-4 font-heading text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-gold-dark disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit Request
                      </>
                    )}
                  </button>
                  <p className="text-xs text-white/80" aria-live="polite">
                    {status === 'success' && 'Thanks! Our team will reach out shortly.'}
                    {status === 'error' && 'We could not submit your request. Please try again.'}
                  </p>
                  <p className="text-xs text-white/60">
                    By submitting this form, you consent to be contacted about your request. We never sell your information.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
