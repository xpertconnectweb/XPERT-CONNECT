import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getUsersByClinicId } from '@/lib/data'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin()
  if (authError) return authError

  try {
    const { id } = await params
    const users = await getUsersByClinicId(id)

    // Return simplified user data with just the fields needed
    const simplified = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username
    }))

    return NextResponse.json(simplified)
  } catch (error) {
    console.error('Error fetching clinic users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch clinic users' },
      { status: 500 }
    )
  }
}
