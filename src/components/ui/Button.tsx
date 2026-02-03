import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center
      font-heading font-bold uppercase tracking-wide
      rounded-xl transition-all duration-300
      disabled:opacity-50 disabled:cursor-not-allowed
      focus:outline-none focus:ring-2 focus:ring-offset-2
    `

    const variants = {
      primary: `
        bg-turquoise text-white
        hover:bg-turquoise-dark hover:-translate-y-0.5
        shadow-lg shadow-turquoise/25 hover:shadow-xl hover:shadow-turquoise/30
        focus:ring-turquoise
      `,
      secondary: `
        bg-navy text-white
        hover:bg-navy-dark hover:-translate-y-0.5
        shadow-lg shadow-navy/25 hover:shadow-xl hover:shadow-navy/30
        focus:ring-navy
      `,
      outline: `
        bg-transparent text-white
        border-2 border-white/80
        hover:bg-white hover:text-navy
        focus:ring-white
      `,
      ghost: `
        bg-transparent text-navy
        hover:bg-gray-100
        focus:ring-gray-200
      `,
    }

    const sizes = {
      sm: 'px-5 py-2.5 text-xs',
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
