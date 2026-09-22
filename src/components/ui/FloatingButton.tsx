'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Phone } from 'lucide-react'

export function FloatingButton() {
  const [atFooter, setAtFooter] = useState(false)

  useEffect(() => {
    // The pill is pinned to the bottom-right corner, which is where the
    // footer keeps the copyright and the Privacy Policy / SMS Terms
    // links — the two URLs the carrier checks are reachable. Moving the
    // links somewhere else only relocates the collision to another
    // breakpoint, so the pill retires instead: by the time the footer is
    // on screen it offers the same number as a tel: link, and the
    // call-to-action has nothing left to add.
    const boundary = document.querySelector('[data-cta-boundary]')
    if (!boundary) return

    const observer = new IntersectionObserver(
      ([entry]) => setAtFooter(entry.isIntersecting),
      // Start the fade just before the footer clears the fold, so the
      // pill is already gone when the links arrive under it.
      { rootMargin: '0px 0px 32px 0px' }
    )

    observer.observe(boundary)
    return () => observer.disconnect()
  }, [])

  return (
    <Link
      href="tel:+18449737866"
      aria-label="Call us"
      aria-hidden={atFooter || undefined}
      tabIndex={atFooter ? -1 : undefined}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-gold pl-5 pr-6 py-4 text-navy-dark shadow-2xl shadow-gold/30 transition-all duration-300 hover:bg-gold-dark hover:text-white hover:shadow-gold/40 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 motion-reduce:transition-none ${
        atFooter
          ? 'pointer-events-none translate-y-4 opacity-0'
          : 'translate-y-0 opacity-100 hover:scale-105'
      }`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
        <Phone className="h-5 w-5 animate-pulse" />
      </span>
      <span className="font-heading text-sm font-bold uppercase tracking-wide hidden sm:block">
        Call Now
      </span>
    </Link>
  )
}
