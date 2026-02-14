import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body?.email ?? '').trim()

    if (!email) {
      return NextResponse.json({ ok: false, error: 'Email is required.' }, { status: 400 })
    }

    if (!emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: 'Invalid email.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .upsert({ email }, { onConflict: 'email' })

    if (error) {
      console.error('Failed to save newsletter subscriber:', error)
      return NextResponse.json({ ok: false, error: 'Failed to subscribe.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Newsletter signup failed', error)
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  }
}
