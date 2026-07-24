import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1a2a4a',
          dark: '#0f1a2e',
          light: '#2a3f6a',
        },
        turquoise: {
          DEFAULT: '#20b2aa',
          dark: '#1a9690',
          light: '#3fccc4',
        },
        gold: {
          DEFAULT: '#d4a84b',
          dark: '#b8923f',
          light: '#e6c878',
        },
      },
      fontFamily: {
        heading: ['var(--font-montserrat)', 'sans-serif'],
        body: ['var(--font-open-sans)', 'sans-serif'],
        // Admin dashboard system font (scoped via CSS vars set on the admin shell)
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // Navy-tinted elevation for the admin surface (not generic black)
        card: '0 1px 2px rgba(26,42,74,0.04), 0 4px 16px -2px rgba(26,42,74,0.08)',
        'card-hover': '0 2px 6px rgba(26,42,74,0.06), 0 16px 32px -6px rgba(26,42,74,0.16)',
        kpi: '0 1px 2px rgba(26,42,74,0.05), 0 10px 26px -8px rgba(26,42,74,0.14)',
      },
    },
  },
  plugins: [],
}
export default config
