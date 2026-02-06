'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Phone, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '#about', label: 'About Us' },
  { href: '#services', label: 'Services' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#benefits', label: 'Benefits' },
  { href: '#contact', label: 'Contact' },
]

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false)
      }
    }

    window.addEventListener('scroll', handleScroll)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileMenuOpen])

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        isScrolled
          ? 'bg-white/95 backdrop-blur-lg shadow-lg shadow-black/5'
          : 'bg-transparent'
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy"
      >
        Skip to content
      </a>
      <div className="container mx-auto px-4">
        <div className="grid h-20 lg:h-24 items-center grid-cols-[auto_1fr_auto]">
          {/* Logo */}
          <Link href="/" className="flex items-center relative z-10 justify-self-start">
            <Image
              src="/images/logo.png"
              alt="Xpert Connect"
              width={180}
              height={50}
              className={cn(
                'h-10 lg:h-12 w-auto transition-all duration-300',
                !isScrolled && 'brightness-0 invert'
              )}
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:block justify-self-center" aria-label="Primary">
            <ul className="flex items-center justify-center gap-1 lg:translate-x-20">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      'px-4 py-2 font-heading text-sm font-medium transition-all duration-300 rounded-lg',
                      isScrolled
                        ? 'text-gray-700 hover:text-gold hover:bg-gold/5'
                        : 'text-white/90 hover:text-white hover:bg-white/10'
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center justify-self-end gap-3">
            {/* Phone CTA */}
            <Link
              href="tel:+18449737866"
              className={cn(
                'hidden md:flex items-center gap-2.5 rounded-full px-6 py-3 font-heading text-sm font-bold transition-all duration-300',
                isScrolled
                  ? 'bg-gold text-white hover:bg-gold-dark shadow-lg shadow-gold/25'
                  : 'bg-white/10 backdrop-blur-sm text-white border border-white/20 hover:bg-white/20'
              )}
            >
              <Phone className="h-4 w-4" />
              <span>1-844-XPERT-NOW</span>
            </Link>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg lg:hidden transition-colors',
                isScrolled ? 'text-navy' : 'text-white'
              )}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        id="mobile-menu"
        className={cn(
          'absolute left-0 right-0 top-20 bg-white shadow-xl transition-all duration-300 lg:hidden rounded-b-2xl overflow-hidden',
          isMobileMenuOpen
            ? 'opacity-100 visible translate-y-0'
            : 'opacity-0 invisible -translate-y-4'
        )}
      >
        <nav className="container mx-auto px-4 py-6" aria-label="Mobile">
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={closeMobileMenu}
                  className="block rounded-xl px-4 py-3 text-center font-heading text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gold"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="pt-4">
              <Link
                href="tel:+18449737866"
                onClick={closeMobileMenu}
                className="flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-4 font-heading text-sm font-bold text-white shadow-lg shadow-gold/25"
              >
                <Phone className="h-4 w-4" />
                <span>1-844-XPERT-NOW</span>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
