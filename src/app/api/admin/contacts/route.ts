import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getContacts } from '@/lib/data'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const contacts = await getContacts()
  return NextResponse.json(contacts)
}
