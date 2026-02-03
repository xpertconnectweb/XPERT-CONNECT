'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Facebook, Instagram, Youtube, Linkedin } from 'lucide-react'
import { Button } from '@/components/ui/Button'

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

const socialLinks = [
  { href: '#', icon: Facebook, label: 'Facebook' },
  { href: '#', icon: Instagram, label: 'Instagram' },
  { href: '#', icon: Youtube, label: 'YouTube' },
  { href: '#', icon: Linkedin, label: 'LinkedIn' },
]

export function Footer() {
  const handleNewsletterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Handle newsletter subscription
    alert('Thank you for subscribing!')
    ;(e.target as HTMLFormElement).reset()
  }

  return (
    <footer className="bg-gray-100 pt-16 lg:pt-20">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 pb-12 md:grid-cols-2 lg:grid-cols-5 lg:gap-8 lg:pb-16">
          {/* Brand */}
          <div className="md:col-span-2 lg:col-span-1">
            <Link href="/" className="mb-5 inline-block">
              <Image
                src="/images/logo.png"
                alt="Xpert Connect"
                width={160}
                height={45}
                className="h-14 w-auto"
              />
            </Link>
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              We don't sell contacts.
              <br />
              We create connections that work.
            </p>
            <p className="mb-6 text-xs italic text-gray-500">
              We are not attorneys and do not provide legal advice.
            </p>
            <Link href="#contact">
              <Button variant="primary" size="sm">
                Free Consultation
              </Button>
            </Link>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-5 font-heading text-sm font-bold uppercase tracking-wider text-navy">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-600 transition-colors hover:text-turquoise"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="mb-5 font-heading text-sm font-bold uppercase tracking-wider text-navy">
              Services
            </h4>
            <ul className="space-y-3">
              {serviceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-600 transition-colors hover:text-turquoise"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="mb-5 font-heading text-sm font-bold uppercase tracking-wider text-navy">
              Subscribe
            </h4>
            <p className="mb-4 text-sm text-gray-600">
              Get updates on new professionals and services in your area.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Enter Your Email Address"
                required
                className="w-full rounded border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-turquoise focus:outline-none"
              />
              <Button type="submit" variant="primary" className="w-full">
                Subscribe
              </Button>
            </form>
          </div>

          {/* Social */}
          <div>
            <h4 className="mb-5 font-heading text-sm font-bold uppercase tracking-wider text-navy">
              Connect With Us
            </h4>
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <Link
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy transition-all hover:bg-turquoise hover:text-white"
                >
                  <social.icon className="h-5 w-5" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bg-navy py-5">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 text-center md:flex-row md:text-left">
          <p className="text-sm text-white/70">
            &copy; {new Date().getFullYear()} Xpert Connect. All Rights Reserved.
          </p>
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <Link href="#" className="text-sm text-white/70 transition-colors hover:text-turquoise">
              Privacy Policy
            </Link>
            <Link href="#" className="text-sm text-white/70 transition-colors hover:text-turquoise">
              Terms of Service
            </Link>
            <Link href="#" className="text-sm text-white/70 transition-colors hover:text-turquoise">
              Disclaimer
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
