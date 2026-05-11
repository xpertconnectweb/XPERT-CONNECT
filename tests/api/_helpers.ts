import { vi } from 'vitest'
import type { Session } from 'next-auth'
import type { Referral } from '@/types/professionals'

/**
 * Awaits every promise that a route handler queued via `waitUntil`
 * (see tests/setup.ts). Call after `await POST(...)` to make sure
 * background email sends have completed before asserting on them.
 */
export async function flushWaitUntil() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = (globalThis as any).__waitUntilQueue as Promise<unknown>[]
  if (!queue) return
  await Promise.allSettled(queue.splice(0))
}

// Mirrors `AuthResult` from src/lib/api-auth.ts. The production type
// guarantees `session: Session` (never null), and the unauthorized
// path surfaces the 401/403 via the `error` NextResponse — so on the
// failure path we return `{} as Session` exactly like production.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockAuthResult = { session: Session; error: any }

/**
 * Build a `requireAuth` mock that returns the supplied session when the
 * caller's role passes `allowedRoles`, otherwise returns a 403 error
 * NextResponse — mirroring the production helper.
 */
export function buildRequireAuth(session: Session | null) {
  return vi.fn(
    async (allowedRoles?: string[]): Promise<MockAuthResult> => {
      if (!session) {
        return {
          session: {} as Session,
          error: jsonResponse({ error: 'Unauthorized' }, 401),
        }
      }
      if (allowedRoles && !allowedRoles.includes(session.user.role)) {
        return {
          session: {} as Session,
          error: jsonResponse({ error: 'Forbidden' }, 403),
        }
      }
      return { session, error: null }
    }
  )
}

export function buildRequireAdmin(session: Session | null) {
  return vi.fn(async (): Promise<MockAuthResult> => {
    if (!session || session.user.role !== 'admin') {
      return {
        session: {} as Session,
        error: jsonResponse({ error: 'Unauthorized' }, 401),
      }
    }
    return { session, error: null }
  })
}

/**
 * Lightweight NextResponse-shaped helper that the API code awaits via
 * `.json()`. We can't construct a real NextResponse from inside a vitest
 * mock factory cleanly, so we expose the same surface (`status`, `.json()`).
 */
export function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    ok: status >= 200 && status < 300,
  }
}

interface BuildSessionOptions {
  id?: string
  role: 'lawyer' | 'clinic' | 'admin' | 'partner' | 'referrer'
  clinicId?: string
  lawyerId?: string
  firmName?: string
  name?: string
  email?: string
  state?: string
}

export function buildSession(opts: BuildSessionOptions): Session {
  return {
    user: {
      id: opts.id ?? `user-${opts.role}-1`,
      name: opts.name ?? 'Test User',
      email: opts.email ?? 'user@test.com',
      role: opts.role,
      clinicId: opts.clinicId,
      lawyerId: opts.lawyerId,
      firmName: opts.firmName,
      username: 'testuser',
      state: opts.state,
    },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

/**
 * Build a NextRequest-compatible object for handler invocation. The
 * production handler only uses `.json()` so we keep this minimal.
 */
export function buildRequest(body: unknown, opts: { method?: string } = {}) {
  return {
    method: opts.method ?? 'POST',
    url: 'http://localhost/api/test',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

export function fakeClinic(overrides: Partial<{ id: string; name: string; email: string }> = {}) {
  return {
    id: overrides.id ?? 'c-001',
    name: overrides.name ?? 'Test Clinic',
    address: '1 Test St, Miami, FL 33101',
    lat: 25.7617,
    lng: -80.1918,
    phone: '305-555-0000',
    specialties: [],
    email: overrides.email ?? 'clinic@test.com',
    available: true,
  }
}

export function fakeLawyer(overrides: Partial<{ id: string; name: string; email: string }> = {}) {
  return {
    id: overrides.id ?? 'l-001',
    name: overrides.name ?? 'Test Firm',
    address: '1 Law St, Miami, FL 33101',
    lat: 25.7617,
    lng: -80.1918,
    phone: '305-555-1111',
    practiceAreas: ['Personal Injury'],
    email: overrides.email ?? 'lawyer@test.com',
    available: true,
  }
}

export function fakeReferral(overrides: Partial<Referral> = {}): Referral {
  return {
    id: 'ref-test-1',
    referralKind: 'lawyer',
    lawyerId: 'l-001',
    lawyerName: 'Test Firm',
    lawyerFirm: 'Test Firm',
    clinicId: 'c-001',
    clinicName: 'Test Clinic',
    createdByUserId: 'user-clinic-1',
    creatorRole: 'clinic',
    patientName: 'John Doe',
    patientPhone: '305-555-0000',
    caseType: 'Auto Accident',
    notes: '',
    status: 'received',
    createdAt: '2026-05-05T00:00:00Z',
    updatedAt: '2026-05-05T00:00:00Z',
    ...overrides,
  }
}
