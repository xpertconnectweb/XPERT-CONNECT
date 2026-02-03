import Link from 'next/link'
import { Phone } from 'lucide-react'

export function FloatingButton() {
  return (
    <Link
      href="tel:+18449737866"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-gold pl-5 pr-6 py-4 text-white shadow-2xl shadow-gold/30 transition-all duration-300 hover:bg-gold-dark hover:scale-105 hover:shadow-gold/40 group"
      aria-label="Call us"
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
