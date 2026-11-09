import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRequest, buildSupabaseChainMock, flushWaitUntil } from './_helpers'
import stored from '@/data/body-shops.json'

const sb = buildSupabaseChainMock({ data: null, error: null })

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (t: string) => sb.from(t) },
}))
vi.mock('@/lib/email', () => ({
  bodyShopInquiryEmail: vi.fn().mockResolvedValue(undefined),
}))

import { GET } from '@/app/api/public/body-shops/route'
import { POST } from '@/app/api/public/body-shops/[id]/inquiry/route'
import { getBodyShopSummary } from '@/lib/body-shops'
import { INDEPENDENT } from '@/lib/body-shop-meta'
import * as email from '@/lib/email'

const mockedEmail = vi.mocked(email)

/** A real row from the published file, so the test follows the data. */
const SHOP = (stored as { id: string; name: string; brand: string; street: string; city: string; state: string; zip: string; county: string; phone: string; website: string }[]).find(
  (s) => s.website && s.street
)!
const CONTACT_FIELDS = ['phone', 'website', 'street', 'address', 'email']

const VISITOR = { name: 'Ana Pérez', phone: '(305) 555-0199', email: 'ana@example.com' }
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  sb.reset({ data: null, error: null })
})

describe('GET /api/public/body-shops', () => {
  it('lists every published shop with name and place only', async () => {
    const res = GET()
    const body = (await res.json()) as Record<string, unknown>[]
    expect(body).toHaveLength(stored.length)
    for (const shop of body) {
      expect(Object.keys(shop).sort()).toEqual(
        ['city', 'county', 'id', 'kind', 'name', 'state', 'zipCode'].sort()
      )
      for (const field of CONTACT_FIELDS) expect(shop).not.toHaveProperty(field)
    }
  })

  it('never carries a phone number anywhere in the payload', async () => {
    const text = JSON.stringify(await GET().json())
    expect(text).not.toMatch(/\(\d{3}\) \d{3}-\d{4}/)
  })
})

describe('getBodyShopSummary', () => {
  const summary = getBodyShopSummary(9)

  it('counts the whole corpus, independents first', () => {
    expect(summary.total).toBe(stored.length)
    expect(summary.kinds[0][0]).toBe(INDEPENDENT)
    expect(summary.kinds.reduce((n, [, c]) => n + c, 0)).toBe(stored.length)
    expect(summary.states.map(([st]) => st)).toEqual(['FL', 'MN'])
  })

  it('keys counties by state, since Florida and Minnesota share names', () => {
    expect(summary.counties.every((k) => /^(FL|MN)\|.+/.test(k))).toBe(true)
  })

  it('shows a stable mix of independents and chains from both states', () => {
    expect(summary.showcase).toHaveLength(9)
    expect(getBodyShopSummary(9).showcase.map((s) => s.id)).toEqual(
      summary.showcase.map((s) => s.id)
    )
    expect(summary.showcase.some((s) => s.kind === INDEPENDENT)).toBe(true)
    expect(summary.showcase.some((s) => s.kind !== INDEPENDENT)).toBe(true)
    expect(new Set(summary.showcase.map((s) => s.state))).toEqual(new Set(['FL', 'MN']))
    for (const shop of summary.showcase) {
      for (const field of CONTACT_FIELDS) expect(shop).not.toHaveProperty(field)
    }
  })
})

describe('POST /api/public/body-shops/[id]/inquiry', () => {
  it('answers with the shop contact details', async () => {
    const res = await POST(buildRequest(VISITOR), params(SHOP.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.contact).toEqual({
      id: SHOP.id,
      name: SHOP.name,
      phone: SHOP.phone,
      website: SHOP.website,
      address: `${SHOP.street}, ${SHOP.city}, ${SHOP.state} ${SHOP.zip}`,
    })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('records the lead where /admin/contacts will show it', async () => {
    await POST(buildRequest(VISITOR), params(SHOP.id))
    const insert = sb.calls.find((c) => c.method === 'insert')
    expect(insert).toBeDefined()
    const row = insert!.args[0] as Record<string, string>
    expect(row).toMatchObject({
      name: 'Ana Pérez',
      phone: '(305) 555-0199',
      email: 'ana@example.com',
      service: 'Body shop directory',
    })
    expect(row.message).toContain(SHOP.name)
    expect(row.message).toContain(SHOP.id)
  })

  it('emails the team the visitor and the shop', async () => {
    await POST(buildRequest(VISITOR), params(SHOP.id))
    await flushWaitUntil()
    expect(mockedEmail.bodyShopInquiryEmail).toHaveBeenCalledTimes(1)
    const [visitor, shop] = mockedEmail.bodyShopInquiryEmail.mock.calls[0]
    expect(visitor).toEqual(VISITOR)
    expect(shop).toMatchObject({ name: SHOP.name, phone: SHOP.phone, state: SHOP.state })
  })

  it('still hands over the contact when saving the row fails', async () => {
    sb.reset({ data: null, error: { message: 'db down' } })
    const res = await POST(buildRequest(VISITOR), params(SHOP.id))
    expect(res.status).toBe(200)
    expect((await res.json()).contact.phone).toBe(SHOP.phone)
  })

  it('404s a shop the directory does not list', async () => {
    const res = await POST(buildRequest(VISITOR), params('fl-00000-nowhere'))
    expect(res.status).toBe(404)
    expect(await res.json()).not.toHaveProperty('contact')
  })

  it.each([
    ['a missing name', { ...VISITOR, name: '' }],
    ['a missing phone', { ...VISITOR, phone: '' }],
    ['a malformed email', { ...VISITOR, email: 'ana@' }],
    ['a phone with too few digits', { ...VISITOR, phone: '555' }],
  ])('rejects %s without revealing anything', async (_label, body) => {
    const res = await POST(buildRequest(body), params(SHOP.id))
    expect(res.status).toBe(400)
    expect(await res.json()).not.toHaveProperty('contact')
  })

  it('gives a bot that fills the honeypot nothing, and records nothing', async () => {
    const res = await POST(buildRequest({ ...VISITOR, company: 'Acme' }), params(SHOP.id))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sb.calls.some((c) => c.method === 'insert')).toBe(false)
    expect(mockedEmail.bodyShopInquiryEmail).not.toHaveBeenCalled()
  })
})
