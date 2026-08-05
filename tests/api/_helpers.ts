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
  role: 'lawyer' | 'clinic' | 'admin' | 'partner' | 'referrer' | 'directory'
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

export function fakeContact(
  overrides: Partial<{
    id: string
    name: string
    email: string
    phone: string
    service: string
    message: string
    status: string
  }> = {}
) {
  return {
    id: overrides.id ?? 'contact-1',
    name: overrides.name ?? 'Jane Visitor',
    email: overrides.email ?? 'jane@example.com',
    phone: overrides.phone ?? '305-555-9999',
    service: overrides.service ?? 'legal',
    message: overrides.message ?? 'Need consultation',
    status: overrides.status ?? 'new',
    created_at: '2026-05-01T00:00:00Z',
  }
}

export function fakeNewsletterSubscriber(
  overrides: Partial<{ id: string; email: string; subscribed: boolean }> = {}
) {
  return {
    id: overrides.id ?? 'sub-1',
    email: overrides.email ?? 'subscriber@example.com',
    subscribed: overrides.subscribed ?? true,
    created_at: '2026-05-01T00:00:00Z',
  }
}

export function fakeUser(
  overrides: Partial<{
    id: string
    username: string
    role: string
    email: string
    name: string
    lawyer_id: string | null
    clinic_id: string | null
  }> = {}
) {
  return {
    id: overrides.id ?? 'u-1',
    username: overrides.username ?? 'testuser',
    role: overrides.role ?? 'lawyer',
    email: overrides.email ?? 'user@test.com',
    name: overrides.name ?? 'Test User',
    lawyer_id: overrides.lawyer_id ?? null,
    clinic_id: overrides.clinic_id ?? null,
  }
}

export function fakeActivityLog(
  overrides: Partial<{
    id: string
    user_id: string
    user_name: string
    action: string
    target_type: string
    target_id: string
    target_name: string
    description: string
  }> = {}
) {
  return {
    id: overrides.id ?? 'log-1',
    user_id: overrides.user_id ?? 'u-admin',
    user_name: overrides.user_name ?? 'Admin',
    action: overrides.action ?? 'clinic_created',
    target_type: overrides.target_type ?? 'clinic',
    target_id: overrides.target_id ?? 'c-001',
    target_name: overrides.target_name ?? 'Test Clinic',
    description: overrides.description ?? 'Created clinic Test Clinic',
    created_at: '2026-05-01T00:00:00Z',
  }
}

export function fakeSettings(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'settings-singleton',
    site_name: 'Xpert Connect',
    contact_email: 'contact@xpertconnect.com',
    contact_phone: '1-844-XPERT-NOW',
    referral_emails_enabled: true,
    ...overrides,
  }
}

interface ChainResult {
  data: unknown
  error: unknown
  count?: number
}

/**
 * Build a chainable Supabase query mock that captures the call sequence
 * and resolves to the configured payload. Mirrors the in-line helper in
 * `data-layer.test.ts` so route-handler tests can reuse it.
 *
 * Usage:
 *   const sb = buildSupabaseChainMock({ data: [...], error: null })
 *   vi.mock('@/lib/supabase', () => ({
 *     supabaseAdmin: { from: (t: string) => sb.from(t) },
 *   }))
 *   // ...invoke handler...
 *   expect(sb.calls).toContainEqual({ method: 'from', args: ['clinics'] })
 */
export function buildSupabaseChainMock(
  initial: ChainResult = { data: null, error: null }
) {
  const calls: { method: string; args: unknown[] }[] = []
  let result: ChainResult = initial

  function makeChain() {
    const chain: Record<string, unknown> = {}
    const methods = [
      'select',
      'eq',
      'in',
      'or',
      'ilike',
      'like',
      'order',
      'range',
      'limit',
      'gte',
      'lte',
      'gt',
      'lt',
      'is',
      'not',
      'neq',
      'insert',
      'update',
      'delete',
      'upsert',
      'match',
    ]
    for (const method of methods) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return chain
      }
    }
    chain.single = (...args: unknown[]) => {
      calls.push({ method: 'single', args })
      return Promise.resolve(result)
    }
    chain.maybeSingle = (...args: unknown[]) => {
      calls.push({ method: 'maybeSingle', args })
      return Promise.resolve(result)
    }
    chain.then = (
      resolve: (v: ChainResult) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject)
    return chain
  }

  return {
    calls,
    setResult(next: ChainResult) {
      result = next
    },
    reset(next: ChainResult = { data: null, error: null }) {
      calls.length = 0
      result = next
    },
    from(table: string) {
      calls.push({ method: 'from', args: [table] })
      return makeChain()
    },
  }
}
