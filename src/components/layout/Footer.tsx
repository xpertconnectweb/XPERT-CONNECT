'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Phone, Mail } from 'lucide-react'

const quickLinks = [
  { href: '#about', label: 'About Us' },
  { href: '#services', label: 'Services' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#benefits', label: 'Benefits' },
  { href: '#contact', label: 'Contact Us' },
]

const serviceLinks = [
  { href: '#services', label: 'Legal Services' },
  { href: '#services', label: 'Medical Clinics' },
  { href: '#services', label: 'Real Estate' },
  { href: '#contact', label: 'Free Consultation' },
]


export function Footer() {
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleNewsletterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setNewsletterStatus('loading')

    const form = e.currentTarget
    const formData = new FormData(form)

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email: formData.get('email') }),
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Request failed')
      }

      setNewsletterStatus('success')
      form.reset()
    } catch {
      setNewsletterStatus('error')
    }
  }

  return (
    <footer className="bg-navy text-white">
      {/* Main Footer */}
      <div className="container mx-auto px-4 py-16 lg:py-20">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand Column */}
          <div className="lg:col-span-4">
            <Link href="/" className="inline-block mb-6">
              <Image
                src="/images/logo.png"
                alt="Xpert Connect"
                width={160}
                height={45}
                className="h-12 w-auto brightness-0 invert"
              />
            </Link>
            <p className="text-white/75 mb-6 leading-relaxed">
              We don't sell contacts. We create trusted connections.
              Connecting clients with verified professionals since 2004.
            </p>

            {/* Contact Info */}
            <div className="space-y-3">
              <a href="tel:+18449737866" className="flex items-center gap-3 text-white/80 hover:text-gold transition-colors">
                <Phone className="h-4 w-4" />
                <span>1-844-XPERT-NOW</span>
              </a>
              <a href="mailto:xpertconnect.web@gmail.com" className="flex items-center gap-3 text-white/80 hover:text-gold transition-colors">
                <Mail className="h-4 w-4" />
                <span>xpertconnect.web@gmail.com</span>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-2">
            <h4 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-6">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-white/75 hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div className="lg:col-span-2">
            <h4 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-6">
              Services
            </h4>
            <ul className="space-y-3">
              {serviceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-white/75 hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-4">
            <h4 className="font-heading text-sm font-bold uppercase tracking-wider text-white mb-6">
              Stay Updated
            </h4>
            <p className="text-white/75 mb-6">
              Subscribe for updates, resources, and client success insights.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="space-y-3">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                type="email"
                name="email"
                id="newsletter-email"
                placeholder="Enter your email"
                required
                className="w-full rounded-xl border-0 bg-white/10 px-5 py-4 text-white placeholder-white/50 transition-all focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
              <button
                type="submit"
                disabled={newsletterStatus === 'loading'}
                className="w-full rounded-xl bg-gold px-5 py-4 font-heading text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-gold-dark"
              >
                {newsletterStatus === 'loading' ? 'Subscribing...' : 'Subscribe'}
              </button>
            </form>
            <p className="text-xs text-white/70 mt-3" aria-live="polite">
              {newsletterStatus === 'success' && 'You are subscribed. Welcome to Xpert Connect.'}
              {newsletterStatus === 'error' && 'Something went wrong. Please try again in a moment.'}
            </p>

          </div>
        </div>
      </div>

      {/* Disclaimer Bar */}
      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-white/70 italic">
            We are not attorneys and do not provide legal advice. We connect you with licensed professionals in our network.
          </p>
          <p className="mt-2 text-center text-xs text-white/70">
            Locations: Florida and Minnesota
          </p>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bg-navy-dark">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
            <p className="text-sm text-white/70">
              &copy; {new Date().getFullYear()} Xpert Connect. All Rights Reserved.
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              <Link href="#" className="text-sm text-white/70 hover:text-gold transition-colors">
                Privacy Policy
              </Link>
              <Link href="#" className="text-sm text-white/70 hover:text-gold transition-colors">
                Terms of Service
              </Link>
              <Link href="#" className="text-sm text-white/70 hover:text-gold transition-colors">
                Disclaimer
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
