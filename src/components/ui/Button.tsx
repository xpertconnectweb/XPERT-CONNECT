'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-heading font-semibold uppercase tracking-wide rounded transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      primary: 'bg-turquoise text-white border-2 border-turquoise hover:bg-turquoise-dark hover:border-turquoise-dark hover:-translate-y-0.5 hover:shadow-lg',
      secondary: 'bg-navy text-white border-2 border-navy hover:bg-navy-dark hover:border-navy-dark hover:-translate-y-0.5 hover:shadow-lg',
      outline: 'bg-transparent text-white border-2 border-white hover:bg-white hover:text-navy',
      ghost: 'bg-transparent text-navy hover:bg-gray-100',
    }

    const sizes = {
      sm: 'px-4 py-2 text-xs',
      md: 'px-6 py-3 text-sm',
      lg: 'px-8 py-4 text-sm',
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
