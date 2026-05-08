import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/validation.ts',
        'src/lib/sanitize.ts',
        'src/lib/mappers.ts',
        'src/lib/email/templates/**',
        'src/app/api/professionals/referrals/**',
        'src/app/api/admin/users/**',
      ],
    },
  },
})
