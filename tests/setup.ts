import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Required env vars referenced at module-init time by some src files.
process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-prod'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.EMAIL_FROM = 'noreply@test.local'

// Vercel waitUntil: track every backgrounded promise so tests can
// `await flushWaitUntil()` (see tests/api/_helpers.ts) before asserting
// on side effects.
const waitUntilQueue: Array<Promise<unknown>> = []
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilQueue.push(p)
    return p
  },
}))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__waitUntilQueue = waitUntilQueue

// Replace the 600ms inter-email delay with a microtask so background
// IIFEs in the API routes resolve quickly under test.
const realSetTimeout = globalThis.setTimeout
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).setTimeout = ((fn: (...args: unknown[]) => void, _ms?: number, ...rest: unknown[]) => {
  return realSetTimeout(fn as (...a: unknown[]) => void, 0, ...rest)
}) as typeof setTimeout

afterEach(() => {
  cleanup()
})
