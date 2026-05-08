import { describe, expect, it, vi, beforeEach } from 'vitest'

interface ChainResult {
  data: unknown
  error: unknown
}

// Build a chainable Supabase query mock that captures the call sequence
// and returns the resolved payload at the end of the chain.
function buildSupabaseMock() {
  const calls: { method: string; args: unknown[] }[] = []
  let result: ChainResult = { data: null, error: null }

  function makeChain() {
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'ilike', 'order', 'insert', 'update', 'delete']
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
    chain.then = (resolve: (v: ChainResult) => unknown, reject?: (e: unknown) => unknown) => {
      return Promise.resolve(result).then(resolve, reject)
    }
    return chain
  }

  return {
    calls,
    setResult(next: ChainResult) {
      result = next
    },
    from(table: string) {
      calls.push({ method: 'from', args: [table] })
      return makeChain()
    },
  }
}

const supabaseMock = buildSupabaseMock()

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => supabaseMock.from(table),
  },
}))

import {
  getReferralsByLawyerEntity,
  getReferralsByClinic,
  getLawyerUsersByEntityId,
  getUsersByClinicId,
  updateReferralFields,
  createReferral,
} from '@/lib/data'

beforeEach(() => {
  supabaseMock.calls.length = 0
  supabaseMock.setResult({ data: [], error: null })
})

describe('getReferralsByLawyerEntity', () => {
  it('queries the referrals table by lawyer_id', async () => {
    supabaseMock.setResult({ data: [], error: null })
    await getReferralsByLawyerEntity('l-001')
    expect(supabaseMock.calls[0]).toEqual({ method: 'from', args: ['referrals'] })
    const eqCall = supabaseMock.calls.find((c) => c.method === 'eq')
    expect(eqCall?.args).toEqual(['lawyer_id', 'l-001'])
    const orderCall = supabaseMock.calls.find((c) => c.method === 'order')
    expect(orderCall?.args[0]).toBe('created_at')
  })

  it('selects all REFERRAL_COLUMNS including new fields', async () => {
    await getReferralsByLawyerEntity('l-001')
    const selectCall = supabaseMock.calls.find((c) => c.method === 'select')
    const cols = selectCall?.args[0] as string
    expect(cols).toContain('lawyer_id')
    expect(cols).toContain('clinic_id')
    expect(cols).toContain('created_by_user_id')
    expect(cols).toContain('creator_role')
    expect(cols).toContain('insurance_company')
    expect(cols).toContain('claim_number')
    expect(cols).toContain('adjuster_name')
    expect(cols).toContain('adjuster_phone')
    expect(cols).toContain('adjuster_email')
  })

  it('maps snake_case rows to camelCase models', async () => {
    supabaseMock.setResult({
      data: [
        {
          id: 'ref-1',
          lawyer_id: 'l-001',
          lawyer_name: 'Big Firm',
          lawyer_firm: 'Big Firm',
          clinic_id: 'c-001',
          clinic_name: 'Clinic',
          created_by_user_id: 'u-1',
          creator_role: 'clinic',
          patient_name: 'P',
          patient_phone: '305-1',
          case_type: 'Auto',
          coverage: null,
          pip: null,
          insurance_company: 'State Farm',
          claim_number: 'CLM-1',
          adjuster_name: 'Adj',
          adjuster_phone: '305-2',
          adjuster_email: 'adj@x.com',
          notes: '',
          status: 'received',
          created_at: '2026-05-05T00:00:00Z',
          updated_at: '2026-05-05T00:00:00Z',
        },
      ],
      error: null,
    })
    const result = await getReferralsByLawyerEntity('l-001')
    expect(result).toHaveLength(1)
    expect(result[0].lawyerId).toBe('l-001')
    expect(result[0].createdByUserId).toBe('u-1')
    expect(result[0].creatorRole).toBe('clinic')
    expect(result[0].insuranceCompany).toBe('State Farm')
    expect(result[0].claimNumber).toBe('CLM-1')
    expect(result[0].adjusterEmail).toBe('adj@x.com')
  })

  it('returns empty array on Supabase error (graceful degradation)', async () => {
    supabaseMock.setResult({ data: null, error: { message: 'connection lost' } })
    const result = await getReferralsByLawyerEntity('l-001')
    expect(result).toEqual([])
  })
})

describe('getReferralsByClinic', () => {
  it('queries by clinic_id', async () => {
    await getReferralsByClinic('c-001')
    const eqCall = supabaseMock.calls.find((c) => c.method === 'eq')
    expect(eqCall?.args).toEqual(['clinic_id', 'c-001'])
  })
})

describe('getLawyerUsersByEntityId', () => {
  it('filters users by lawyer_id AND role=lawyer (firm membership only)', async () => {
    await getLawyerUsersByEntityId('l-001')
    const eqs = supabaseMock.calls.filter((c) => c.method === 'eq')
    expect(eqs).toHaveLength(2)
    expect(eqs[0].args).toEqual(['lawyer_id', 'l-001'])
    expect(eqs[1].args).toEqual(['role', 'lawyer'])
  })

  it('selects user columns including lawyer_id', async () => {
    await getLawyerUsersByEntityId('l-001')
    const selectCall = supabaseMock.calls.find((c) => c.method === 'select')
    const cols = selectCall?.args[0] as string
    expect(cols).toContain('lawyer_id')
  })
})

describe('getUsersByClinicId', () => {
  it('filters by clinic_id AND role=clinic', async () => {
    await getUsersByClinicId('c-001')
    const eqs = supabaseMock.calls.filter((c) => c.method === 'eq')
    expect(eqs).toHaveLength(2)
    expect(eqs[0].args).toEqual(['clinic_id', 'c-001'])
    expect(eqs[1].args).toEqual(['role', 'clinic'])
  })
})

describe('updateReferralFields', () => {
  it('does NOT manually set updated_at (DB trigger handles it)', async () => {
    supabaseMock.setResult({
      data: { id: 'ref-1', status: 'attended' },
      error: null,
    })
    await updateReferralFields('ref-1', { status: 'attended' })
    const updateCall = supabaseMock.calls.find((c) => c.method === 'update')
    const payload = updateCall?.args[0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('updated_at')
    expect(payload).toEqual({ status: 'attended' })
  })

  it('converts adjuster fields to snake_case', async () => {
    supabaseMock.setResult({
      data: { id: 'ref-1' },
      error: null,
    })
    await updateReferralFields('ref-1', {
      adjusterName: 'Adj',
      adjusterPhone: '305-1',
      adjusterEmail: 'adj@x.com',
      claimNumber: 'CLM-1',
      insuranceCompany: 'State Farm',
    })
    const payload = supabaseMock.calls.find((c) => c.method === 'update')!
      .args[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      adjuster_name: 'Adj',
      adjuster_phone: '305-1',
      adjuster_email: 'adj@x.com',
      claim_number: 'CLM-1',
      insurance_company: 'State Farm',
    })
  })

  it('returns null on error', async () => {
    supabaseMock.setResult({ data: null, error: { message: 'oops' } })
    const result = await updateReferralFields('ref-1', { status: 'attended' })
    expect(result).toBeNull()
  })
})

describe('createReferral', () => {
  it('inserts the model converted to snake_case', async () => {
    supabaseMock.setResult({
      data: { id: 'ref-new' },
      error: null,
    })
    await createReferral({
      id: 'ref-new',
      lawyerId: 'l-001',
      lawyerName: 'Firm',
      lawyerFirm: 'Firm',
      clinicId: 'c-001',
      clinicName: 'Clinic',
      createdByUserId: 'u-1',
      creatorRole: 'clinic',
      patientName: 'John',
      patientPhone: '305-1',
      caseType: 'Auto',
      notes: '',
      status: 'received',
      createdAt: '2026-05-05T00:00:00Z',
      updatedAt: '2026-05-05T00:00:00Z',
    })
    const insertCall = supabaseMock.calls.find((c) => c.method === 'insert')
    const payload = insertCall?.args[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      lawyer_id: 'l-001',
      clinic_id: 'c-001',
      created_by_user_id: 'u-1',
      creator_role: 'clinic',
      patient_name: 'John',
    })
  })
})
