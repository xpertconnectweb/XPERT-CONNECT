'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type CountUpProps = {
  value: number
  durationMs?: number
  suffix?: string
  abbreviateThousands?: boolean
  className?: string
}

export function CountUp({
  value,
  durationMs = 1200,
  suffix,
  abbreviateThousands = false,
  className,
}: CountUpProps) {
  const [displayValue, setDisplayValue] = useState(0)
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
    if (!elementRef.current || hasAnimatedRef.current) return

    const element = elementRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimatedRef.current) return
        hasAnimatedRef.current = true
        const start = performance.now()
        const from = 0
        const to = value

        const step = (now: number) => {
          const progress = Math.min((now - start) / durationMs, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          const current = from + (to - from) * eased
          setDisplayValue(current)
          if (progress < 1) {
            requestAnimationFrame(step)
          }
        }

        requestAnimationFrame(step)
      },
      { threshold: 0.4 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [value, durationMs])

  return (
    <span ref={elementRef} className={className}>
      {formatter(displayValue)}
    </span>
  )
}
