import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getNewsletterSubscribers } from '@/lib/data'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const subscribers = await getNewsletterSubscribers()
  return NextResponse.json(subscribers)
}
