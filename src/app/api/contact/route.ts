import { NextResponse } from 'next/server'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const phone = String(body?.phone ?? '').trim()
    const service = String(body?.service ?? '').trim()
    const message = String(body?.message ?? '').trim()

    if (!name || !email || !phone || !service) {
      return NextResponse.json({ ok: false, error: 'Missing required fields.' }, { status: 400 })
    }

    if (!emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: 'Invalid email.' }, { status: 400 })
    }

    if (message.length > 2000) {
      return NextResponse.json({ ok: false, error: 'Message too long.' }, { status: 400 })
    }

    // TODO: Replace with your CRM/email integration.
    console.log('Contact request', { name, email, phone, service, message })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Contact request failed', error)
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  }
}
