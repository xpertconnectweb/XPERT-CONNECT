'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'

export function RouteProgressBar() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const prevPathname = useRef(pathname)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      // Route changed — start the bar
      prevPathname.current = pathname
      setVisible(true)
      setProgress(0)

      // Quick ramp to ~30%
      requestAnimationFrame(() => setProgress(30))

      // Simulate progress: 30% → 70% over 300ms
      timerRef.current = setTimeout(() => setProgress(70), 150)

      // Complete
      const complete = setTimeout(() => {
        setProgress(100)
        // Fade out after reaching 100%
        setTimeout(() => {
          setVisible(false)
          setProgress(0)
        }, 300)
      }, 350)

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        clearTimeout(complete)
      }
    }
  }, [pathname])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2.5px]">
      <div
        className="h-full rounded-r-full transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #d4a84b, #e8c36a, #d4a84b)',
          boxShadow: '0 0 8px rgba(212, 168, 75, 0.4)',
        }}
      />
    </div>
  )
}
