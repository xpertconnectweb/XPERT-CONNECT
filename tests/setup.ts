import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Required env vars referenced at module-init time by some src files.
process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-prod'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.EMAIL_FROM = 'noreply@test.local'
// Twilio. Present so the send path is ACTIVE under test — with these
// unset, sendSms returns { kind: 'config' } and every SMS assertion
// would pass for the wrong reason.
process.env.TWILIO_ACCOUNT_SID = 'ACtest00000000000000000000000000'
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token'
process.env.TWILIO_MESSAGING_SERVICE_SID = 'MGtest00000000000000000000000000'
process.env.TWILIO_WEBHOOK_URL = 'https://test.local/api/sms/inbound'
process.env.PHONE_OTP_PEPPER = 'test-pepper-at-least-32-characters-long'

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

// jsdom implements no layout, so it ships neither `scrollIntoView` nor
// `ResizeObserver`. Any component that keeps a highlighted item in view (the
// search combobox, virtualized lists) or measures its own container (the
// bottom sheet, the results panel) would otherwise throw during a passive
// effect. Both stubs report zero-sized boxes, which is honest: jsdom has no
// layout to report.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

afterEach(() => {
  cleanup()
})
