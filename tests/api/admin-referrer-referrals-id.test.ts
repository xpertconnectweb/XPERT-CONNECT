import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequireAdmin, buildSession, buildRequest } from './_helpers'
import type { ReferrerReferral } from '@/types/professionals'

vi.mock('@/lib/api-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/data', () => ({
  getReferrerReferralById: vi.fn(),
  updateReferrerReferral: vi.fn(),
  deleteReferrerReferral: vi.fn(),
}))
vi.mock('@/lib/activity-log', () => ({ logActivity: vi.fn() }))

import { PATCH, DELETE } from '@/app/api/admin/referrer-referrals/[id]/route'
import * as auth from '@/lib/api-auth'
import * as data from '@/lib/data'
import * as activity from '@/lib/activity-log'

const mockedAuth = vi.mocked(auth)
const mockedData = vi.mocked(data)
const mockedActivity = vi.mocked(activity)

const ADMIN = buildSession({ role: 'admin', id: 'u-admin', name: 'Admin' })
const PARAMS = { params: Promise.resolve({ id: 'rr-1' }) }

function existing(overrides: Partial<ReferrerReferral> = {}): ReferrerReferral {
  return {
    id: 'rr-1',
    referrerId: 'u-ref',
    referrerName: 'Ref',
    state: 'FL',
    clientName: 'Client A',
    clientPhone: '305-555-0000',
    clientEmail: '',
    clientAddress: '',
    serviceNeeded: 'clinic',
    caseType: 'Auto',
    notes: '',
    status: 'received',
    assignedClinicId: null,
    assignedClinicName: null,
    assignedLawyerId: null,
    assignedLawyerName: null,
    caseConfirmed: 'pending',
    adminNotes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(ADMIN))
  mockedData.getReferrerReferralById.mockResolvedValue(existing())
  mockedData.updateReferrerReferral.mockImplementation(
    async (_id, fields) => ({ ...existing(), ...fields }) as ReferrerReferral
  )
})

describe('PATCH /api/admin/referrer-referrals/[id] — auth', () => {
  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await PATCH(buildRequest({ status: 'mri' }), PARAMS)
    expect(res.status).toBe(401)
  })

  it('turns a non-admin away', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'partner', id: 'u-p', name: 'P' }))
    )
    const res = await PATCH(buildRequest({ status: 'mri' }), PARAMS)
    expect(res.status).toBe(401)
  })

  it('returns 404 when the referral does not exist', async () => {
    mockedData.getReferrerReferralById.mockResolvedValue(undefined)
    const res = await PATCH(buildRequest({ status: 'mri' }), PARAMS)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/referrer-referrals/[id] — validation', () => {
  it('rejects a retired status', async () => {
    const res = await PATCH(buildRequest({ status: 'pending' }), PARAMS)
    expect(res.status).toBe(400)
    expect(mockedData.updateReferrerReferral).not.toHaveBeenCalled()
  })

  // The old `if (body.status)` truthiness check answered 200 having written
  // nothing at all.
  it('rejects an empty status instead of silently ignoring it', async () => {
    const res = await PATCH(buildRequest({ status: '' }), PARAMS)
    expect(res.status).toBe(400)
    expect(mockedData.updateReferrerReferral).not.toHaveBeenCalled()
  })

  it('rejects an unknown case outcome', async () => {
    const res = await PATCH(buildRequest({ caseConfirmed: 'nope' }), PARAMS)
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/referrer-referrals/[id] — writes', () => {
  it('saves a medical status and a dropped case together', async () => {
    const res = await PATCH(
      buildRequest({ status: 'mri', caseConfirmed: 'drop' }),
      PARAMS
    )
    expect(res.status).toBe(200)
    const [, fields] = mockedData.updateReferrerReferral.mock.calls[0]
    expect(fields).toMatchObject({ status: 'mri', caseConfirmed: 'drop' })
    // No DB trigger on this table — updated_at is written from JS.
    expect(fields.updatedAt).toBeDefined()
  })

  it('logs a status change with a from → to trail', async () => {
    await PATCH(buildRequest({ status: 'mri' }), PARAMS)
    const arg = mockedActivity.logActivity.mock.calls[0][0]
    expect(arg.action).toBe('referrer_referral_status_changed')
    expect(arg.details).toEqual({ status: { from: 'received', to: 'mri' } })
  })

  it('logs an assignment when a clinic is attached', async () => {
    const res = await PATCH(
      buildRequest({ assignedClinicId: 'c-1', assignedClinicName: 'Clinic One' }),
      PARAMS
    )
    expect(res.status).toBe(200)
    expect(mockedActivity.logActivity.mock.calls[0][0].action).toBe(
      'referrer_referral_assigned'
    )
  })

  // Clearing an assignment used to log a plain update, because the action was
  // picked from the truthiness of the incoming body rather than a comparison.
  it('logs an assignment when one is CLEARED', async () => {
    mockedData.getReferrerReferralById.mockResolvedValue(
      existing({ assignedClinicId: 'c-1', assignedClinicName: 'Clinic One' })
    )
    await PATCH(
      buildRequest({ assignedClinicId: null, assignedClinicName: null }),
      PARAMS
    )
    expect(mockedActivity.logActivity.mock.calls[0][0].action).toBe(
      'referrer_referral_assigned'
    )
  })

  it('falls back to a plain update when only notes change', async () => {
    await PATCH(buildRequest({ adminNotes: 'called the client' }), PARAMS)
    expect(mockedActivity.logActivity.mock.calls[0][0].action).toBe(
      'referrer_referral_updated'
    )
  })
})

describe('DELETE /api/admin/referrer-referrals/[id]', () => {
  beforeEach(() => {
    mockedData.deleteReferrerReferral.mockResolvedValue(true)
  })

  it('returns 401 for unauthenticated', async () => {
    mockedAuth.requireAdmin.mockImplementation(buildRequireAdmin(null))
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(401)
    expect(mockedData.deleteReferrerReferral).not.toHaveBeenCalled()
  })

  it('turns a non-admin away', async () => {
    mockedAuth.requireAdmin.mockImplementation(
      buildRequireAdmin(buildSession({ role: 'partner', id: 'u-p', name: 'P' }))
    )
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(401)
    expect(mockedData.deleteReferrerReferral).not.toHaveBeenCalled()
  })

  it('deletes and logs the activity', async () => {
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockedData.deleteReferrerReferral).toHaveBeenCalledWith('rr-1')
    expect(mockedActivity.logActivity.mock.calls[0][0]).toMatchObject({
      action: 'referrer_referral_deleted',
      targetType: 'referrer_referral',
      targetId: 'rr-1',
      targetName: 'Client A',
    })
  })

  // The delete used to answer 200 for an id that was never there, and log an
  // audit entry with `targetName: undefined` for a deletion that never
  // happened. Two admins on the same list hit exactly this.
  it('returns 404 for an unknown id, without deleting or logging', async () => {
    mockedData.getReferrerReferralById.mockResolvedValue(undefined)
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(404)
    expect(mockedData.deleteReferrerReferral).not.toHaveBeenCalled()
    expect(mockedActivity.logActivity).not.toHaveBeenCalled()
  })

  // The row vanished between the read and the delete: `deleteReferrerReferral`
  // reports false, and no audit entry may be written.
  it('does not log when the delete affected no row', async () => {
    mockedData.deleteReferrerReferral.mockResolvedValue(false)
    const res = await DELETE(buildRequest(null), PARAMS)
    expect(res.status).toBe(500)
    expect(mockedActivity.logActivity).not.toHaveBeenCalled()
  })
})
