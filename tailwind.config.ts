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
      },
    },
  },
  plugins: [],
}
export default config
