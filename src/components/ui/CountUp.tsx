'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type CountUpProps = {
  value: number
  durationMs?: number
  suffix?: string
  abbreviateThousands?: boolean
  className?: string
}

/**
 * A number that counts up when it scrolls into view.
 *
 * Two things it gets right that the first version did not.
 *
 * **It renders the real number on the server.** State used to start at 0, so
 * the HTML shipped `0+`, `0+`, `0%` and only became true once JavaScript ran
 * and an observer fired. A crawler read zeros; so did anyone whose script
 * failed. The value is now the initial state, and the animation is the
 * enhancement — it resets to 0 only after it has confirmed it can animate.
 *
 * **It honours `prefers-reduced-motion`.** The global CSS override in
 * globals.css collapses animation and transition durations, but it cannot
 * reach a requestAnimationFrame loop, so this counter kept ticking for
 * everyone who had asked their OS to stop things moving.
 *
 * It also refuses to animate a number that is already on screen at mount:
 * snapping a visible figure back to zero to count it up again is worse than
 * not animating at all.
 */
export function CountUp({
  value,
  durationMs = 1200,
  suffix,
  abbreviateThousands = false,
  className,
}: CountUpProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const hasAnimatedRef = useRef(false)
  const elementRef = useRef<HTMLSpanElement | null>(null)

  const formatter = useMemo(() => {
    return (val: number) => {
      const rounded = Math.round(val)
      if (abbreviateThousands && rounded >= 1000) {
        const abbreviated = Math.round(rounded / 1000)
        return `${abbreviated}K${suffix ?? ''}`
      }
      return `${rounded}${suffix ?? ''}`
    }
  }, [abbreviateThousands, suffix])

  useEffect(() => {
    const element = elementRef.current
    if (!element || hasAnimatedRef.current) return

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof IntersectionObserver === 'undefined') return

    // Already on screen: leave the number alone.
    if (element.getBoundingClientRect().top < window.innerHeight) return

    let frame = 0
    setDisplayValue(0)

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimatedRef.current) return
        hasAnimatedRef.current = true
        observer.disconnect()

        const start = performance.now()

        const step = (now: number) => {
          const progress = Math.min((now - start) / durationMs, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setDisplayValue(value * eased)
          if (progress < 1) frame = requestAnimationFrame(step)
        }

        frame = requestAnimationFrame(step)
      },
      { threshold: 0.4 }
    )

    observer.observe(element)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [value, durationMs])

  return (
    <span ref={elementRef} className={className}>
      {formatter(displayValue)}
    </span>
  )
}
