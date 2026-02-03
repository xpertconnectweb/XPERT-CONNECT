'use client'

import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

export function FloatingButton() {
  return (
    <Link
      href="#contact"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-turquoise text-white shadow-lg transition-all duration-300 hover:bg-turquoise-dark hover:scale-110"
      aria-label="Contact us"
    >
      <MessageSquare className="h-6 w-6" />
    </Link>
  )
}
