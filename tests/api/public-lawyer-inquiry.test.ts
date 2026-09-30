import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequest, buildSupabaseChainMock, flushWaitUntil } from './_helpers'

const sb = buildSupabaseChainMock({ data: null, error: null })

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/data', () => ({
  getPublicDirectoryLawyerById: vi.fn(),
}))
vi.mock('@/lib/email', () => ({
  directoryInquiryEmail: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/public/lawyers/[id]/inquiry/route'
import * as data from '@/lib/data'
import * as email from '@/lib/email'

const mockedData = vi.mocked(data)
const mockedEmail = vi.mocked(email)

const FIRM = {
  id: 'l-0200',
  name: 'Czaia Law',
  address: '5308 Manatee Ave W, Bradenton, FL 34209',
  lat: 27.49,
  lng: -82.6,
  phone: '(941) 555-0142',
  email: 'private@firm.example',
  practiceAreas: ['Personal Injury'],
  website: 'https://czaialaw.example',
  region: 'Bradenton',
  county: 'Manatee',
  zipCode: '34209',
  available: true,
  directoryPublic: true,
  city: 'Bradenton',
  state: 'FL',
}

const VISITOR = { name: 'Ana Pérez', phone: '(305) 555-0199', email: 'ana@example.com' }

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null })
  mockedData.getPublicDirectoryLawyerById.mockResolvedValue({ ...FIRM } as never)
})

describe('POST /api/public/lawyers/[id]/inquiry', () => {
  it('answers a stranger with the firm contact details, and nothing private', async () => {
    const res = await POST(buildRequest(VISITOR), params('l-0200'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.contact).toEqual({
      id: 'l-0200',
      name: 'Czaia Law',
      phone: '(941) 555-0142',
      website: 'https://czaialaw.example',
      address: '5308 Manatee Ave W, Bradenton, FL 34209',
    })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('records the lead where /admin/contacts will show it', async () => {
    await POST(buildRequest(VISITOR), params('l-0200'))
    const insert = sb.calls.find((c) => c.method === 'insert')
    expect(insert).toBeDefined()
    const row = insert!.args[0] as Record<string, string>
    expect(row).toMatchObject({
      name: 'Ana Pérez',
      phone: '(305) 555-0199',
      email: 'ana@example.com',
      service: 'Lawyer directory',
    })
    expect(row.message).toContain('Czaia Law')
    expect(row.message).toContain('l-0200')
  })

  it('emails the team the visitor and the firm', async () => {
    await POST(buildRequest(VISITOR), params('l-0200'))
    await flushWaitUntil()
    expect(mockedEmail.directoryInquiryEmail).toHaveBeenCalledTimes(1)
    const [visitor, firm] = mockedEmail.directoryInquiryEmail.mock.calls[0]
    expect(visitor).toEqual(VISITOR)
    expect(firm).toMatchObject({ name: 'Czaia Law', phone: '(941) 555-0142', county: 'Manatee' })
  })

  it('still hands over the contact when saving the row fails', async () => {
    sb.reset({ data: null, error: { message: 'db down' } })
    const res = await POST(buildRequest(VISITOR), params('l-0200'))
    expect(res.status).toBe(200)
    expect((await res.json()).contact.phone).toBe('(941) 555-0142')
  })

  it('404s a firm the public directory does not list', async () => {
    mockedData.getPublicDirectoryLawyerById.mockResolvedValue(undefined)
    const res = await POST(buildRequest(VISITOR), params('l-9999'))
    expect(res.status).toBe(404)
    expect(await res.json()).not.toHaveProperty('contact')
  })

  it.each([
    ['a missing name', { ...VISITOR, name: '' }],
    ['a missing phone', { ...VISITOR, phone: '' }],
    ['a missing email', { ...VISITOR, email: '' }],
    ['a malformed email', { ...VISITOR, email: 'ana@' }],
    ['a phone with too few digits', { ...VISITOR, phone: '555' }],
  ])('rejects %s without revealing anything', async (_label, body) => {
    const res = await POST(buildRequest(body), params('l-0200'))
    expect(res.status).toBe(400)
    expect(await res.json()).not.toHaveProperty('contact')
    expect(mockedData.getPublicDirectoryLawyerById).not.toHaveBeenCalled()
  })

  it('gives a bot that fills the honeypot nothing, and records nothing', async () => {
    const res = await POST(buildRequest({ ...VISITOR, company: 'Acme' }), params('l-0200'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sb.calls.some((c) => c.method === 'insert')).toBe(false)
    expect(mockedEmail.directoryInquiryEmail).not.toHaveBeenCalled()
  })
})
